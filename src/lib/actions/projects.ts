"use server";

import { redirect } from "next/navigation";
import { prisma, revalidatePath, getAuthUserId, requireMember, requireAdmin, projectIdFromGroup, isSuperAdminSession } from "./_helpers";
import type { CreateProjectInput } from "@/lib/types";
import { AVAILABLE_COLUMNS, AVAILABLE_VIEWS, AVAILABLE_WIDGETS } from "@/lib/types";
import { isSuperAdminUserId } from "@/lib/super-admin";

export async function createProject(input: CreateProjectInput) {
  const userId = await getAuthUserId();
  const { name, selectedColumns, defaultView, selectedWidgets } = input;

  if (!name.trim()) {
    throw new Error("Le nom du projet est requis");
  }

  const existing = await prisma.project.findFirst({ where: { name: name.trim() } });
  if (existing) throw new Error(`Un projet nommé "${name.trim()}" existe déjà`);

  const project = await prisma.project.create({
    data: {
      name: name.trim(),
      columns: {
        create: selectedColumns.map((type, index) => {
          const meta = AVAILABLE_COLUMNS.find((c) => c.type === type)!;
          return {
            type,
            label: meta.label,
            position: index,
            isActive: true,
          };
        }),
      },
      views: {
        create: AVAILABLE_VIEWS.filter(
          (v) => v.type === defaultView || v.type === "SPREADSHEET"
        ).map((v, index) => ({
          type: v.type,
          name: v.label,
          isDefault: v.type === defaultView,
          position: index,
        })),
      },
      dashboardWidgets: {
        create: selectedWidgets.map((type, index) => {
          const meta = AVAILABLE_WIDGETS.find((w) => w.type === type)!;
          return {
            type,
            position: index,
            isActive: true,
          };
        }),
      },
      groups: {
        create: [
          { name: "À faire", color: "#6366f1", position: 0 },
          { name: "En cours", color: "#f59e0b", position: 1 },
          { name: "Terminé", color: "#10b981", position: 2 },
        ],
      },
    },
  });

  // Créateur automatiquement ADMIN du projet (sauf super-admin global, invisible dans les membres)
  if (!isSuperAdminUserId(userId)) {
    await prisma.projectMember.create({
      data: { projectId: project.id, userId, role: "ADMIN" },
    });
  }

  redirect(`/projects/${project.id}`);
}

export async function getProject(id: string) {
  await requireMember(id);
  return prisma.project.findUnique({
    where: { id },
    include: {
      columns: { where: { isActive: true }, orderBy: { position: "asc" } },
      views: { orderBy: { position: "asc" } },
      dashboardWidgets: { orderBy: { position: "asc" } },
      groups: {
        orderBy: { position: "asc" },
        include: {
          tasks: {
            where: { archivedAt: null, parentId: null },
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
  if (col) await requireAdmin(col.projectId);
  return prisma.projectColumn.update({ where: { id: columnId }, data: { isActive } });
}

export async function addProjectColumn(projectId: string, type: string, label: string) {
  await requireAdmin(projectId);
  const count = await prisma.projectColumn.count({ where: { projectId } });
  return prisma.projectColumn.create({
    data: { projectId, type: type as import("@/generated/prisma").ColumnType, label, position: count, isActive: true },
  });
}

export async function listProjects() {
  const userId = await getAuthUserId();
  const isSuperAdmin = await isSuperAdminSession();
  const projects = await prisma.project.findMany({
    where: isSuperAdmin ? undefined : { members: { some: { userId } } },
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: { groups: true, members: true },
      },
      members: {
        where: { userId },
        select: { isPinned: true, userGroupId: true },
      },
      groups: {
        include: {
          _count: {
            select: { tasks: true },
          },
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
  if (!member) throw new Error("Non membre");
  return prisma.projectMember.update({
    where: { projectId_userId: { projectId, userId } },
    data: { isPinned: !member.isPinned },
  });
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
  if (isSuperAdminUserId(userId)) throw new Error("Fonction indisponible pour le super-admin global.");
  if (!name.trim()) throw new Error("Le nom est requis");
  const max = await prisma.userProjectGroup.aggregate({ where: { userId }, _max: { position: true } });
  return prisma.userProjectGroup.create({
    data: { userId, name: name.trim(), position: (max._max.position ?? -1) + 1 },
  });
}

export async function renameUserProjectGroup(groupId: string, name: string) {
  const userId = await getAuthUserId();
  if (!name.trim()) throw new Error("Le nom est requis");
  const g = await prisma.userProjectGroup.findUnique({ where: { id: groupId } });
  if (!g || g.userId !== userId) throw new Error("Groupe introuvable");
  return prisma.userProjectGroup.update({ where: { id: groupId }, data: { name: name.trim() } });
}

export async function deleteUserProjectGroup(groupId: string) {
  const userId = await getAuthUserId();
  const g = await prisma.userProjectGroup.findUnique({ where: { id: groupId } });
  if (!g || g.userId !== userId) throw new Error("Groupe introuvable");
  // Members will have userGroupId set to null via SetNull
  return prisma.userProjectGroup.delete({ where: { id: groupId } });
}

export async function assignProjectToGroup(projectId: string, groupId: string | null) {
  const userId = await getAuthUserId();
  if (isSuperAdminUserId(userId)) return null;
  if (groupId) {
    const g = await prisma.userProjectGroup.findUnique({ where: { id: groupId } });
    if (!g || g.userId !== userId) throw new Error("Groupe introuvable");
  }
  return prisma.projectMember.update({
    where: { projectId_userId: { projectId, userId } },
    data: { userGroupId: groupId },
  });
}

export async function deleteProject(projectId: string) {
  await requireAdmin(projectId);
  await prisma.project.delete({ where: { id: projectId } });
  redirect("/");
}

export async function renameProject(projectId: string, name: string) {
  await requireAdmin(projectId);
  if (!name.trim()) throw new Error("Le nom est requis");
  const existing = await prisma.project.findFirst({ where: { name: name.trim(), NOT: { id: projectId } } });
  if (existing) throw new Error(`Un projet nommé "${name.trim()}" existe déjà`);
  return prisma.project.update({ where: { id: projectId }, data: { name: name.trim() } });
}

export async function updateProjectDescription(projectId: string, description: string | null) {
  await requireAdmin(projectId);
  return prisma.project.update({ where: { id: projectId }, data: { description: description?.trim() || null } });
}

export async function createGroup(projectId: string, name: string) {
  await requireMember(projectId);
  const count = await prisma.group.count({ where: { projectId } });
  return prisma.group.create({
    data: { projectId, name, color: "#6366f1", position: count },
    include: { tasks: { include: { fieldValues: true } } },
  });
}

export async function updateGroupName(groupId: string, name: string) {
  await requireMember(await projectIdFromGroup(groupId));
  return prisma.group.update({ where: { id: groupId }, data: { name } });
}

export async function updateGroupColor(groupId: string, color: string) {
  await requireMember(await projectIdFromGroup(groupId));
  return prisma.group.update({ where: { id: groupId }, data: { color } });
}

export async function deleteGroup(groupId: string) {
  await requireAdmin(await projectIdFromGroup(groupId));
  return prisma.group.delete({ where: { id: groupId } });
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
