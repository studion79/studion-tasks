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
  const groupTemplateIds = Array.isArray(input.groupTemplateIds)
    ? Array.from(new Set(input.groupTemplateIds.filter((id) => typeof id === "string" && id.trim().length > 0)))
    : [];

  if (!name.trim()) {
    throw new Error("Project name is required.");
  }

  const existing = await prisma.project.findFirst({ where: { name: name.trim() } });
  if (existing) throw new Error(`A project named "${name.trim()}" already exists.`);

  const project = await prisma.project.create({
    data: defaultProjectData(name.trim()),
  });

  // Créateur automatiquement ADMIN du projet (sauf super-admin global, invisible dans les membres)
  if (!isSuperAdminUserId(userId)) {
    await prisma.projectMember.create({
      data: { projectId: project.id, userId, role: "ADMIN" },
    });
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
            where: { parentId: null },
            orderBy: { position: "asc" },
            include: {
              fieldValues: true,
              subtasks: {
                where: { archivedAt: null },
                orderBy: { position: "asc" },
                include: { fieldValues: true },
              },
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

  const statusColumnIds = new Set(
    project.columns.filter((c) => c.type === "STATUS").map((c) => c.id)
  );
  if (!statusColumnIds.size) return project;

  for (const group of project.groups) {
    for (const task of group.tasks) {
      for (const fv of task.fieldValues) {
        if (statusColumnIds.has(fv.columnId)) {
          fv.value = toCanonicalStatus(fv.value) ?? fv.value;
        }
      }
      for (const subtask of task.subtasks) {
        for (const fv of subtask.fieldValues) {
          if (statusColumnIds.has(fv.columnId)) {
            fv.value = toCanonicalStatus(fv.value) ?? fv.value;
          }
        }
      }
    }
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
  return projects.sort((a, b) => {
    const aPinned = a.members[0]?.isPinned ?? false;
    const bPinned = b.members[0]?.isPinned ?? false;
    if (aPinned !== bPinned) return aPinned ? -1 : 1;
    return 0;
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
  return prisma.userProjectGroup.findMany({
    where: { userId },
    orderBy: { position: "asc" },
  });
}

export async function createUserProjectGroup(name: string) {
  const userId = await getAuthUserId();
  if (isSuperAdminUserId(userId)) throw new Error("Feature unavailable for global super admin.");
  if (!name.trim()) throw new Error("Name is required.");
  const max = await prisma.userProjectGroup.aggregate({ where: { userId }, _max: { position: true } });
  const created = await prisma.userProjectGroup.create({
    data: { userId, name: name.trim(), position: (max._max.position ?? -1) + 1 },
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
  const updated = await prisma.projectMember.update({
    where: { projectId_userId: { projectId, userId } },
    data: { userGroupId: groupId },
  });
  emitPreferencesChanged(userId);
  emitProjectChanged(projectId);
  return updated;
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
  await requireMember(projectId);
  const count = await prisma.group.count({ where: { projectId } });
  const created = await prisma.group.create({
    data: { projectId, name, color: "#6366f1", position: count },
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
  const projectId = await projectIdFromGroup(groupId);
  await requireAdmin(projectId);
  const deleted = await prisma.group.delete({ where: { id: groupId } });
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
