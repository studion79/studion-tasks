"use server";

import { redirect } from "next/navigation";
import {
  prisma,
  revalidatePath,
  getAuthUserId,
  requireMember,
  requireAdmin,
  projectIdFromGroup,
  isSuperAdminSession,
  emitProjectChanged,
  emitArchiveChanged,
  emitPreferencesChanged,
  emitAdminDataChanged,
} from "./_helpers";
import type { CreateProjectInput } from "@/lib/types";
import { AVAILABLE_COLUMNS, AVAILABLE_VIEWS, AVAILABLE_WIDGETS } from "@/lib/types";
import { isSuperAdminUserId } from "@/lib/super-admin";
import { toCanonicalStatus } from "@/lib/status";

const PERSONAL_PROJECT_NAME = "Personnel";
const PERSONAL_GROUP_NAMES = new Set(["personnel", "personal"]);

function isPersonalGroupName(value: string | null | undefined) {
  return PERSONAL_GROUP_NAMES.has((value ?? "").trim().toLowerCase());
}

function defaultProjectData(name: string) {
  return {
    name,
    columns: {
      create: AVAILABLE_COLUMNS.map((col, index) => ({
        type: col.type,
        label: col.label,
        position: index,
        isActive: col.defaultActive,
      })),
    },
    views: {
      create: AVAILABLE_VIEWS.map((v, index) => ({
        type: v.type,
        name: v.label,
        isDefault: v.type === "SPREADSHEET",
        position: index,
      })),
    },
    dashboardWidgets: {
      create: AVAILABLE_WIDGETS.map((widget, index) => ({
        type: widget.type,
        position: index,
        isActive: widget.defaultActive,
      })),
    },
    groups: {
      create: [
        { name: "To do", color: "#6366f1", position: 0 },
        { name: "In progress", color: "#f59e0b", position: 1 },
        { name: "Done", color: "#10b981", position: 2 },
      ],
    },
  };
}

export async function ensurePersonalProjectForUser(userId: string) {
  const existingRows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT "id" FROM "Project" WHERE "personalOwnerId" = ? LIMIT 1`,
    userId
  );
  if (existingRows[0]?.id) return existingRows[0].id;

  try {
    const project = await prisma.project.create({
      data: {
        ...defaultProjectData(PERSONAL_PROJECT_NAME),
        isPersonal: true,
        personalOwnerId: userId,
      },
      select: { id: true },
    });

    if (!isSuperAdminUserId(userId)) {
      await prisma.projectMember.create({
        data: { projectId: project.id, userId, role: "ADMIN" },
      });
    }
    return project.id;
  } catch {
    const createdRows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT "id" FROM "Project" WHERE "personalOwnerId" = ? LIMIT 1`,
      userId
    );
    if (!createdRows[0]?.id) throw new Error("PERSONAL_PROJECT_CREATE_FAILED");
    return createdRows[0].id;
  }
}

export async function createProject(input: CreateProjectInput) {
  const userId = await getAuthUserId();
  const { name } = input;
  const initialGroupId = typeof input.initialGroupId === "string" && input.initialGroupId.trim().length > 0
    ? input.initialGroupId.trim()
    : null;
  const groupTemplateIds = Array.isArray(input.groupTemplateIds)
    ? Array.from(new Set(input.groupTemplateIds.filter((id) => typeof id === "string" && id.trim().length > 0)))
    : [];

  if (!name.trim()) {
    throw new Error("Project name is required.");
  }
  if (initialGroupId && isSuperAdminUserId(userId)) {
    throw new Error("Group assignment unavailable for super admin.");
  }
  if (initialGroupId) {
    const target = await prisma.userProjectGroup.findUnique({ where: { id: initialGroupId } });
    if (!target || target.userId !== userId) throw new Error("Group not found.");
  }

  const existing = await prisma.project.findFirst({ where: { name: name.trim() } });
  if (existing) throw new Error(`A project named "${name.trim()}" already exists.`);

  const project = await prisma.project.create({
    data: defaultProjectData(name.trim()),
  });

  // Créateur automatiquement ADMIN du projet (sauf super-admin global, invisible dans les membres)
  if (!isSuperAdminUserId(userId)) {
    await prisma.projectMember.create({
      data: {
        projectId: project.id,
        userId,
        role: "ADMIN",
        userGroupId: initialGroupId,
      },
    });
    try {
      await ensureProjectMemberOrder(userId, initialGroupId, false);
    } catch {
      // Do not block project creation if ordering metadata fails.
    }
  }

  if (groupTemplateIds.length > 0) {
    const templates = await prisma.groupTemplate.findMany({
      where: { id: { in: groupTemplateIds } },
    });
    const templateById = new Map(templates.map((t) => [t.id, t]));
    const columns = await prisma.projectColumn.findMany({ where: { projectId: project.id } });
    const priorityCol = columns.find((c) => c.type === "PRIORITY");
    const notesCol = columns.find((c) => c.type === "NOTES");
    let nextPosition = 3;

    for (const templateId of groupTemplateIds) {
      const template = templateById.get(templateId);
      if (!template) continue;

      let snapshot: { name?: string; color?: string; tasks?: Array<{ title?: string; priority?: string | null; notes?: string | null }> } | null = null;
      try {
        snapshot = JSON.parse(template.snapshot);
      } catch {
        snapshot = null;
      }
      if (!snapshot || !snapshot.name) continue;

      const group = await prisma.group.create({
        data: {
          projectId: project.id,
          name: snapshot.name,
          color: snapshot.color || "#6366f1",
          position: nextPosition++,
        },
      });

      const tasks = Array.isArray(snapshot.tasks) ? snapshot.tasks : [];
      for (let idx = 0; idx < tasks.length; idx++) {
        const task = tasks[idx];
        const title = (task.title || "").trim();
        if (!title) continue;
        const fieldValues: { columnId: string; value: string }[] = [];
        if (task.priority && priorityCol) fieldValues.push({ columnId: priorityCol.id, value: String(task.priority) });
        if (task.notes && notesCol) fieldValues.push({ columnId: notesCol.id, value: String(task.notes) });
        await prisma.task.create({
          data: {
            groupId: group.id,
            title,
            position: idx,
            fieldValues: fieldValues.length > 0 ? { create: fieldValues } : undefined,
          },
        });
      }
    }
  }

  emitProjectChanged(project.id);
  emitAdminDataChanged();
  return project.id;
}

export async function getProject(id: string) {
  await requireMember(id);
  const project = await prisma.project.findFirst({
    where: { id, archivedAt: null },
    include: {
      columns: { where: { isActive: true }, orderBy: { position: "asc" } },
      views: { orderBy: { position: "asc" } },
      dashboardWidgets: { orderBy: { position: "asc" } },
      groups: {
        orderBy: { position: "asc" },
        include: {
          tasks: {
            where: { archivedAt: null },
            orderBy: { position: "asc" },
            include: {
              fieldValues: true,
              blockerDeps: { select: { id: true, blockedId: true } },
              attachments: { select: { id: true } },
              comments: { select: { id: true } },
            },
          },
        },
      },
    },
  });

  if (!project) return project;

  for (const group of project.groups) {
    type TaskNode = (typeof group.tasks)[number] & { subtasks: TaskNode[] };
    const nodes = group.tasks.map((task) => ({ ...task, subtasks: [] as TaskNode[] })) as TaskNode[];
    const byId = new Map<string, TaskNode>(nodes.map((task) => [task.id, task]));
    for (const task of group.tasks) {
      if (!task.parentId) continue;
      const parent = byId.get(task.parentId);
      const child = byId.get(task.id);
      if (!parent || !child || parent.id === child.id) continue;
      parent.subtasks.push(child);
    }
    const roots = Array.from(byId.values())
      .filter((task) => !task.parentId || !byId.has(task.parentId))
      .sort((a, b) => a.position - b.position);
    const sortRecursive = (tasks: TaskNode[]): TaskNode[] =>
      tasks.map((task) => ({
        ...task,
        subtasks: sortRecursive((task.subtasks ?? []).sort((a, b) => a.position - b.position)),
      }));
    group.tasks = sortRecursive(roots) as typeof group.tasks;
  }

  const statusColumnIds = new Set(
    project.columns.filter((c) => c.type === "STATUS").map((c) => c.id)
  );
  if (!statusColumnIds.size) return project;

  const normalizeStatusRecursive = (tasks: Array<{ fieldValues: { columnId: string; value: string | null }[]; subtasks?: unknown[] }>) => {
    for (const task of tasks) {
      for (const fv of task.fieldValues) {
        if (statusColumnIds.has(fv.columnId)) {
          fv.value = toCanonicalStatus(fv.value) ?? fv.value;
        }
      }
      normalizeStatusRecursive((task.subtasks as Array<{ fieldValues: { columnId: string; value: string | null }[]; subtasks?: unknown[] }>) ?? []);
    }
  };

  for (const group of project.groups) {
    normalizeStatusRecursive(group.tasks);
  }

  return project;
}

export async function getAllProjectColumns(projectId: string) {
  await requireMember(projectId);
  return prisma.projectColumn.findMany({
    where: { projectId },
    orderBy: { position: "asc" },
  });
}

export async function setColumnActive(columnId: string, isActive: boolean) {
  const col = await prisma.projectColumn.findUnique({ where: { id: columnId } });
  if (col) await requireMember(col.projectId);
  const updated = await prisma.projectColumn.update({ where: { id: columnId }, data: { isActive } });
  if (col?.projectId) emitProjectChanged(col.projectId);
  return updated;
}

export async function addProjectColumn(projectId: string, type: string, label: string) {
  await requireMember(projectId);
  const count = await prisma.projectColumn.count({ where: { projectId } });
  const created = await prisma.projectColumn.create({
    data: { projectId, type: type as import("@/generated/prisma").ColumnType, label, position: count, isActive: true },
  });
  emitProjectChanged(projectId);
  return created;
}

export async function listProjects() {
  const userId = await getAuthUserId();
  const isSuperAdmin = await isSuperAdminSession();
  if (!isSuperAdmin) {
    await ensurePersonalProjectForUser(userId);
  }
  const projects = await prisma.project.findMany({
    where: isSuperAdmin
      ? { archivedAt: null }
      : { archivedAt: null, members: { some: { userId } } },
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: { groups: true, members: true },
      },
      personalOwner: {
        select: { id: true },
      },
      members: {
        where: { userId },
        select: { isPinned: true, userGroupId: true },
      },
      groups: {
        select: {
          id: true,
          name: true,
          _count: { select: { tasks: true } },
          tasks: {
            where: { archivedAt: null },
            select: {
              id: true,
              updatedAt: true,
              fieldValues: {
                select: { value: true, column: { select: { type: true } } },
              },
            },
            orderBy: { updatedAt: "desc" },
          },
        },
      },
    },
  });
  // Sort: pinned projects first, then by createdAt desc
  const orderByProjectId = await getProjectOrderMap(userId);
  for (const project of projects) {
    const member = project.members[0];
    if (member) {
      (member as { projectOrder?: number | null }).projectOrder = orderByProjectId.get(project.id) ?? null;
    }
  }
  return projects.sort((a, b) => {
    const aPinned = a.members[0]?.isPinned ?? false;
    const bPinned = b.members[0]?.isPinned ?? false;
    if (aPinned !== bPinned) return aPinned ? -1 : 1;
    const aOrder = orderByProjectId.get(a.id) ?? 0;
    const bOrder = orderByProjectId.get(b.id) ?? 0;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
}

export async function togglePinProject(projectId: string) {
  const userId = await getAuthUserId();
  if (isSuperAdminUserId(userId)) return null;
  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (!member) throw new Error("Not a member.");
  const updated = await prisma.projectMember.update({
    where: { projectId_userId: { projectId, userId } },
    data: { isPinned: !member.isPinned },
  });
  emitPreferencesChanged(userId);
  emitProjectChanged(projectId);
  return updated;
}

export async function listUserProjectGroups() {
  const userId = await getAuthUserId();
  if (isSuperAdminUserId(userId)) return [];
  await ensurePersonalUserProjectGroup(userId);
  const hasDescription = await tableHasColumn("UserProjectGroup", "description");
  if (hasDescription) {
    return prisma.$queryRawUnsafe<
      Array<{ id: string; userId: string; name: string; position: number; description: string | null; createdAt: Date }>
    >(
      `SELECT "id", "userId", "name", "position", "description", "createdAt" FROM "UserProjectGroup" WHERE "userId" = ? ORDER BY "position" ASC`,
      userId
    );
  }
  return prisma.$queryRawUnsafe<
    Array<{ id: string; userId: string; name: string; position: number; createdAt: Date }>
  >(
    `SELECT "id", "userId", "name", "position", "createdAt" FROM "UserProjectGroup" WHERE "userId" = ? ORDER BY "position" ASC`,
    userId
  );
}

export async function createUserProjectGroup(name: string) {
  const userId = await getAuthUserId();
  if (isSuperAdminUserId(userId)) throw new Error("Feature unavailable for global super admin.");
  if (!name.trim()) throw new Error("Name is required.");
  const max = await prisma.userProjectGroup.aggregate({ where: { userId }, _max: { position: true } });
  const normalizedName = name.trim();
  const existingPersonal = await prisma.userProjectGroup.findMany({
    where: { userId },
    orderBy: { position: "asc" },
    select: { id: true, name: true, userId: true, position: true, createdAt: true },
  });
  if (isPersonalGroupName(normalizedName)) {
    const personal = existingPersonal.find((group) => isPersonalGroupName(group.name));
    if (personal) return personal;
  }
  const created = await prisma.userProjectGroup.create({
    data: { userId, name: normalizedName, position: (max._max.position ?? -1) + 1 },
  });
  emitPreferencesChanged(userId);
  return created;
}

export async function renameUserProjectGroup(groupId: string, name: string) {
  const userId = await getAuthUserId();
  if (!name.trim()) throw new Error("Name is required.");
  const g = await prisma.userProjectGroup.findUnique({ where: { id: groupId } });
  if (!g || g.userId !== userId) throw new Error("Group not found.");
  const updated = await prisma.userProjectGroup.update({ where: { id: groupId }, data: { name: name.trim() } });
  emitPreferencesChanged(userId);
  return updated;
}

export async function updateUserProjectGroupDescription(groupId: string, description: string | null) {
  const userId = await getAuthUserId();
  const g = await prisma.userProjectGroup.findUnique({ where: { id: groupId } });
  if (!g || g.userId !== userId) throw new Error("Group not found.");
  if (!(await tableHasColumn("UserProjectGroup", "description"))) {
    return g;
  }
  const value = description?.trim() || null;
  await prisma.$executeRawUnsafe(
    `UPDATE "UserProjectGroup" SET "description" = ? WHERE "id" = ?`,
    value,
    groupId
  );
  const updatedRows = await prisma.$queryRawUnsafe<
    Array<{ id: string; userId: string; name: string; position: number; description: string | null; createdAt: Date }>
  >(
    `SELECT "id", "userId", "name", "position", "description", "createdAt" FROM "UserProjectGroup" WHERE "id" = ? LIMIT 1`,
    groupId
  );
  const updated = updatedRows[0] ?? g;
  emitPreferencesChanged(userId);
  return updated;
}

export async function deleteUserProjectGroup(groupId: string) {
  const userId = await getAuthUserId();
  const g = await prisma.userProjectGroup.findUnique({ where: { id: groupId } });
  if (!g || g.userId !== userId) throw new Error("Group not found.");
  // Members will have userGroupId set to null via SetNull
  const deleted = await prisma.userProjectGroup.delete({ where: { id: groupId } });
  emitPreferencesChanged(userId);
  return deleted;
}

export async function assignProjectToGroup(projectId: string, groupId: string | null) {
  const userId = await getAuthUserId();
  if (isSuperAdminUserId(userId)) return null;
  if (groupId) {
    const g = await prisma.userProjectGroup.findUnique({ where: { id: groupId } });
    if (!g || g.userId !== userId) throw new Error("Group not found.");
  }
  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (!member) throw new Error("Not a member.");

  const updated = await prisma.projectMember.update({
    where: { projectId_userId: { projectId, userId } },
    data: { userGroupId: groupId },
  });
  await ensureProjectMemberOrder(userId, groupId, member.isPinned);
  emitPreferencesChanged(userId);
  emitProjectChanged(projectId);
  return updated;
}

export async function moveUserProjectGroup(groupId: string, direction: "up" | "down") {
  const userId = await getAuthUserId();
  if (isSuperAdminUserId(userId)) throw new Error("Feature unavailable for global super admin.");
  const groups = await prisma.userProjectGroup.findMany({
    where: { userId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: { id: true, position: true },
  });
  const index = groups.findIndex((group) => group.id === groupId);
  if (index < 0) throw new Error("Group not found.");
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= groups.length) return null;
  const current = groups[index];
  const target = groups[targetIndex];
  await prisma.$transaction([
    prisma.userProjectGroup.update({ where: { id: current.id }, data: { position: target.position } }),
    prisma.userProjectGroup.update({ where: { id: target.id }, data: { position: current.position } }),
  ]);
  emitPreferencesChanged(userId);
  return { moved: true };
}

export async function moveProjectInHomeOrder(projectId: string, direction: "up" | "down") {
  const userId = await getAuthUserId();
  if (isSuperAdminUserId(userId)) throw new Error("Feature unavailable for global super admin.");
  const current = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { projectId: true, userGroupId: true, isPinned: true },
  });
  if (!current) throw new Error("Project not found.");
  await ensureProjectOrderColumn();
  await ensureProjectMemberOrder(userId, current.userGroupId, current.isPinned);
  const siblings = await prisma.$queryRawUnsafe<Array<{ projectId: string; projectOrder: number }>>(
    `SELECT "projectId", "projectOrder" FROM "ProjectMember"
     WHERE "userId" = ? AND "isPinned" = ? AND (
       (? IS NULL AND "userGroupId" IS NULL) OR "userGroupId" = ?
     )
     ORDER BY "projectOrder" ASC, "createdAt" ASC, "projectId" ASC`,
    userId,
    current.isPinned ? 1 : 0,
    current.userGroupId,
    current.userGroupId
  );
  const index = siblings.findIndex((item) => item.projectId === projectId);
  if (index < 0) throw new Error("Project not found.");
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= siblings.length) return null;
  const target = siblings[targetIndex];
  await prisma.$executeRawUnsafe(
    `UPDATE "ProjectMember" SET "projectOrder" = ? WHERE "projectId" = ? AND "userId" = ?`,
    target.projectOrder,
    projectId,
    userId
  );
  await prisma.$executeRawUnsafe(
    `UPDATE "ProjectMember" SET "projectOrder" = ? WHERE "projectId" = ? AND "userId" = ?`,
    siblings[index].projectOrder,
    target.projectId,
    userId
  );
  emitPreferencesChanged(userId);
  emitProjectChanged(projectId);
  emitProjectChanged(target.projectId);
  return { moved: true };
}

export async function reorderProjectsInHomeGroup(groupId: string | null, orderedProjectIds: string[]) {
  const userId = await getAuthUserId();
  if (isSuperAdminUserId(userId)) throw new Error("Feature unavailable for global super admin.");
  await ensureProjectOrderColumn();

  const ids = Array.from(new Set((orderedProjectIds ?? []).filter((id) => typeof id === "string" && id.length > 0)));
  const members = await prisma.projectMember.findMany({
    where: { userId, userGroupId: groupId },
    select: { projectId: true },
  });
  const memberIds = members.map((m) => m.projectId);
  if (memberIds.length === 0) return null;

  const unknown = ids.find((id) => !memberIds.includes(id));
  if (unknown) throw new Error("INVALID_PROJECT_IN_REORDER");

  const missing = memberIds.filter((id) => !ids.includes(id));
  const finalOrder = [...ids, ...missing];

  for (let index = 0; index < finalOrder.length; index += 1) {
    await prisma.$executeRawUnsafe(
      `UPDATE "ProjectMember" SET "projectOrder" = ? WHERE "projectId" = ? AND "userId" = ?`,
      index,
      finalOrder[index],
      userId
    );
  }
  emitPreferencesChanged(userId);
  for (const pid of finalOrder) emitProjectChanged(pid);
  return { moved: true };
}

async function ensurePersonalUserProjectGroup(userId: string) {
  const existing = await prisma.userProjectGroup.findMany({
    where: { userId },
    orderBy: { position: "asc" },
    select: { id: true, name: true },
  });
  if (existing.some((group) => isPersonalGroupName(group.name))) return;
  const max = await prisma.userProjectGroup.aggregate({ where: { userId }, _max: { position: true } });
  await prisma.userProjectGroup.create({
    data: {
      userId,
      name: PERSONAL_PROJECT_NAME,
      position: (max._max.position ?? -1) + 1,
    },
  });
}

const tableColumnCache = new Map<string, boolean>();

async function tableHasColumn(table: string, column: string) {
  const key = `${table}:${column}`;
  const cached = tableColumnCache.get(key);
  if (typeof cached === "boolean") return cached;
  const rows = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
    `PRAGMA table_info("${table}")`
  );
  const exists = rows.some((row) => row.name === column);
  tableColumnCache.set(key, exists);
  return exists;
}

async function ensureProjectMemberOrder(userId: string, groupId: string | null, isPinned: boolean) {
  await ensureProjectOrderColumn();
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT "id" FROM "ProjectMember"
     WHERE "userId" = ? AND "isPinned" = ? AND (
      (? IS NULL AND "userGroupId" IS NULL) OR "userGroupId" = ?
     )
     ORDER BY "projectOrder" ASC, "createdAt" ASC, "id" ASC`,
    userId,
    isPinned ? 1 : 0,
    groupId,
    groupId
  );
  for (let index = 0; index < rows.length; index += 1) {
    await prisma.$executeRawUnsafe(
      `UPDATE "ProjectMember" SET "projectOrder" = ? WHERE "id" = ?`,
      index,
      rows[index].id
    );
  }
}

async function getProjectOrderMap(userId: string) {
  const out = new Map<string, number>();
  await ensureProjectOrderColumn();
  const rows = await prisma.$queryRawUnsafe<Array<{ projectId: string; projectOrder: number }>>(
    `SELECT "projectId", "projectOrder" FROM "ProjectMember" WHERE "userId" = ?`,
    userId
  );
  for (const row of rows) out.set(row.projectId, row.projectOrder ?? 0);
  return out;
}

async function ensureProjectOrderColumn() {
  if (await tableHasColumn("ProjectMember", "projectOrder")) return;
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "ProjectMember" ADD COLUMN "projectOrder" INTEGER NOT NULL DEFAULT 0`
    );
  } catch {
    // Another request may have added it concurrently.
    if (!(await tableHasColumn("ProjectMember", "projectOrder"))) {
      throw new Error("PROJECT_ORDER_COLUMN_INIT_FAILED");
    }
  }
  tableColumnCache.set("ProjectMember:projectOrder", true);
}

export async function deleteProject(projectId: string) {
  await requireAdmin(projectId);
  const rows = await prisma.$queryRawUnsafe<Array<{ isPersonal: number }>>(
    `SELECT "isPersonal" FROM "Project" WHERE "id" = ? LIMIT 1`,
    projectId
  );
  if (!rows[0]) throw new Error("Project not found.");
  if (Boolean(rows[0].isPersonal)) {
    throw new Error("FORBIDDEN_DELETE_PERSONAL_PROJECT");
  }
  await prisma.project.delete({ where: { id: projectId } });
  emitAdminDataChanged();
  redirect("/");
}

export async function archiveProject(projectId: string) {
  try {
    await requireAdmin(projectId);
  } catch {
    throw new Error("FORBIDDEN_ARCHIVE_PROJECT");
  }
  const archived = await prisma.project.update({
    where: { id: projectId },
    data: { archivedAt: new Date() },
  });
  revalidatePath("/");
  revalidatePath("/me");
  revalidatePath(`/projects/${projectId}`);
  emitArchiveChanged(projectId);
  emitProjectChanged(projectId);
  return archived;
}

export async function restoreProject(projectId: string) {
  try {
    await requireAdmin(projectId);
  } catch {
    throw new Error("FORBIDDEN_RESTORE_PROJECT");
  }
  const restored = await prisma.project.update({
    where: { id: projectId },
    data: { archivedAt: null },
  });
  revalidatePath("/");
  revalidatePath("/me");
  revalidatePath(`/projects/${projectId}`);
  emitArchiveChanged(projectId);
  emitProjectChanged(projectId);
  return restored;
}

export async function listArchivedProjects() {
  const userId = await getAuthUserId();
  const isSuperAdmin = await isSuperAdminSession();
  return prisma.project.findMany({
    where: isSuperAdmin
      ? { archivedAt: { not: null } }
      : { archivedAt: { not: null }, members: { some: { userId } } },
    orderBy: { archivedAt: "desc" },
    include: {
      _count: { select: { groups: true, members: true } },
      members: {
        where: { userId },
        select: { isPinned: true, userGroupId: true },
      },
      groups: {
        include: {
          _count: { select: { tasks: true } },
          tasks: {
            where: { archivedAt: null },
            select: {
              id: true,
              updatedAt: true,
              fieldValues: {
                select: { value: true, column: { select: { type: true } } },
              },
            },
            orderBy: { updatedAt: "desc" },
          },
        },
      },
    },
  });
}

export async function renameProject(projectId: string, name: string) {
  await requireAdmin(projectId);
  if (!name.trim()) throw new Error("Name is required.");
  const existing = await prisma.project.findFirst({ where: { name: name.trim(), NOT: { id: projectId } } });
  if (existing) throw new Error(`A project named "${name.trim()}" already exists.`);
  const updated = await prisma.project.update({ where: { id: projectId }, data: { name: name.trim() } });
  emitProjectChanged(projectId);
  return updated;
}

export async function updateProjectDescription(projectId: string, description: string | null) {
  await requireAdmin(projectId);
  const updated = await prisma.project.update({ where: { id: projectId }, data: { description: description?.trim() || null } });
  emitProjectChanged(projectId);
  return updated;
}

export async function createGroup(projectId: string, name: string) {
  return createGroupWithParent(projectId, name, null);
}

function lightenHexColor(hex: string, ratio = 0.2): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return "#6366f1";
  const clamp = (v: number) => Math.max(0, Math.min(255, v));
  const toHex = (v: number) => clamp(v).toString(16).padStart(2, "0");
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const nr = Math.round(r + (255 - r) * ratio);
  const ng = Math.round(g + (255 - g) * ratio);
  const nb = Math.round(b + (255 - b) * ratio);
  return `#${toHex(nr)}${toHex(ng)}${toHex(nb)}`;
}

async function normalizeParentId(projectId: string, parentId: string | null | undefined) {
  if (!parentId) return null;
  const parent = await prisma.group.findUnique({
    where: { id: parentId },
    select: { id: true, projectId: true },
  });
  if (!parent || parent.projectId !== projectId) throw new Error("INVALID_GROUP_PARENT");
  return parent.id;
}

async function nextSiblingPosition(projectId: string, parentId: string | null) {
  const agg = await prisma.group.aggregate({
    where: { projectId, parentId },
    _max: { position: true },
  });
  return (agg._max.position ?? -1) + 1;
}

async function reindexSiblingPositions(projectId: string, parentId: string | null) {
  const siblings = await prisma.group.findMany({
    where: { projectId, parentId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: { id: true, position: true },
  });
  await Promise.all(
    siblings.map((sibling, idx) =>
      sibling.position === idx
        ? Promise.resolve()
        : prisma.group.update({ where: { id: sibling.id }, data: { position: idx } })
    )
  );
}

export async function createGroupWithParent(projectId: string, name: string, parentId?: string | null) {
  await requireMember(projectId);
  const normalizedParentId = await normalizeParentId(projectId, parentId);
  const position = await nextSiblingPosition(projectId, normalizedParentId);
  let color = "#6366f1";
  if (normalizedParentId) {
    const parent = await prisma.group.findUnique({
      where: { id: normalizedParentId },
      select: { color: true },
    });
    color = lightenHexColor(parent?.color ?? color, 0.18);
  }
  const created = await prisma.group.create({
    data: { projectId, parentId: normalizedParentId, name, color, position },
    include: { tasks: { include: { fieldValues: true } } },
  });
  emitProjectChanged(projectId);
  return created;
}

export async function updateGroupName(groupId: string, name: string) {
  const projectId = await projectIdFromGroup(groupId);
  await requireMember(projectId);
  const updated = await prisma.group.update({ where: { id: groupId }, data: { name } });
  emitProjectChanged(projectId);
  return updated;
}

export async function updateGroupColor(groupId: string, color: string) {
  const projectId = await projectIdFromGroup(groupId);
  await requireMember(projectId);
  const updated = await prisma.group.update({ where: { id: groupId }, data: { color } });
  emitProjectChanged(projectId);
  return updated;
}

export async function deleteGroup(groupId: string) {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { id: true, projectId: true, parentId: true },
  });
  if (!group) throw new Error("Group not found.");
  const projectId = group.projectId;
  await requireMember(projectId);
  const allGroups = await prisma.group.findMany({
    where: { projectId },
    select: { id: true, parentId: true },
  });
  const descendants = new Set<string>([groupId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const g of allGroups) {
      if (!g.parentId) continue;
      if (descendants.has(g.parentId) && !descendants.has(g.id)) {
        descendants.add(g.id);
        changed = true;
      }
    }
  }
  const deleted = await prisma.group.deleteMany({ where: { id: { in: Array.from(descendants) } } });
  await reindexSiblingPositions(projectId, group.parentId ?? null);
  emitProjectChanged(projectId);
  return deleted;
}

export async function reorderGroup(groupId: string, direction: "up" | "down") {
  const group = await prisma.group.findUnique({ where: { id: groupId } });
  if (!group) return;
  await requireMember(group.projectId);
  const neighbor = await prisma.group.findFirst({
    where: {
      projectId: group.projectId,
      parentId: group.parentId,
      position: direction === "up" ? { lt: group.position } : { gt: group.position },
    },
    orderBy: { position: direction === "up" ? "desc" : "asc" },
  });
  if (!neighbor) return;
  await prisma.$transaction([
    prisma.group.update({ where: { id: groupId }, data: { position: neighbor.position } }),
    prisma.group.update({ where: { id: neighbor.id }, data: { position: group.position } }),
  ]);
  emitProjectChanged(group.projectId);
}

export async function getArchivedTasks(projectId: string) {
  return prisma.task.findMany({
    where: {
      group: { projectId },
      archivedAt: { not: null },
      parentId: null,
    },
    include: {
      fieldValues: true,
      group: { select: { name: true, color: true } },
    },
    orderBy: { archivedAt: "desc" },
  });
}
