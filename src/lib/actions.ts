"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import sharp from "sharp";
import { prisma } from "@/lib/db";
import { sendMail, invitationEmailHtml } from "@/lib/mailer";
import type { CreateProjectInput } from "@/lib/types";
import { AVAILABLE_COLUMNS, AVAILABLE_VIEWS, AVAILABLE_WIDGETS } from "@/lib/types";
import { NOTIF_TYPES } from "@/lib/constants";
import type { NotifType } from "@/lib/constants";
import { auth } from "@/auth";

// ── Permission helpers ────────────────────────────────────────────────────────

/** Throws 401 if no session; returns the current user id */
async function getAuthUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Non authentifié");
  return session.user.id;
}

/** Current user must be at least MEMBER of projectId */
async function requireMember(projectId: string): Promise<string> {
  const userId = await getAuthUserId();
  const m = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (!m) throw new Error("Accès refusé");
  return userId;
}

/** Current user must be ADMIN of projectId */
async function requireAdmin(projectId: string): Promise<string> {
  const userId = await getAuthUserId();
  const m = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (!m || m.role !== "ADMIN") throw new Error("Droits administrateur requis");
  return userId;
}

/** Resolve projectId from a groupId (1 extra query) */
async function projectIdFromGroup(groupId: string): Promise<string> {
  const g = await prisma.group.findUnique({ where: { id: groupId } });
  if (!g) throw new Error("Groupe introuvable");
  return g.projectId;
}

/** Resolve projectId from a taskId (1 extra query) */
async function projectIdFromTask(taskId: string): Promise<string> {
  const t = await prisma.task.findUnique({ where: { id: taskId }, include: { group: true } });
  if (!t) throw new Error("Tâche introuvable");
  return t.group.projectId;
}

// --- Auth ---

export async function registerUser(
  email: string,
  name: string,
  password: string,
  inviteToken?: string
) {
  if (!email.trim() || !name.trim() || password.length < 6) {
    throw new Error("Données invalides");
  }
  const normalizedEmail = email.toLowerCase().trim();
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) throw new Error("Un compte existe déjà avec cet email");
  const hash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email: normalizedEmail, name: name.trim(), password: hash },
  });

  // Si un token d'invitation est fourni, on accepte automatiquement
  if (inviteToken) {
    const invitation = await prisma.projectInvitation.findUnique({
      where: { token: inviteToken },
    });
    if (invitation && !invitation.acceptedAt && invitation.expiresAt > new Date()) {
      await prisma.projectMember.create({
        data: { projectId: invitation.projectId, userId: user.id, role: invitation.role },
      });
      await prisma.projectInvitation.update({
        where: { token: inviteToken },
        data: { acceptedAt: new Date() },
      });
      redirect(`/projects/${invitation.projectId}`);
    }
  }

  redirect("/login?registered=1");
}

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

  // Créateur automatiquement ADMIN du projet
  await prisma.projectMember.create({
    data: { projectId: project.id, userId, role: "ADMIN" },
  });

  redirect(`/projects/${project.id}`);
}

export async function getProject(id: string) {
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
            },
          },
        },
      },
    },
  });
}

export async function getAllProjectColumns(projectId: string) {
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
  const projects = await prisma.project.findMany({
    where: { members: { some: { userId } } },
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: { groups: true, members: true },
      },
      members: {
        where: { userId },
        select: { isPinned: true },
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
  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (!member) throw new Error("Non membre");
  return prisma.projectMember.update({
    where: { projectId_userId: { projectId, userId } },
    data: { isPinned: !member.isPinned },
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

export async function restoreTask(taskId: string) {
  await requireMember(await projectIdFromTask(taskId));
  return prisma.task.update({ where: { id: taskId }, data: { archivedAt: null } });
}

// --- Group mutations ---

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

// --- Activity log helper ---
async function logActivity(taskId: string, action: string, actor = "Système", details?: object) {
  try {
    await prisma.activityLog.create({
      data: { taskId, action, actor, details: details ? JSON.stringify(details) : null },
    });
  } catch {
    // Non-blocking — never fail a mutation because of logging
  }
}

// --- Task mutations ---

export async function createTask(groupId: string, title: string, actor?: string) {
  await requireMember(await projectIdFromGroup(groupId));
  const count = await prisma.task.count({ where: { groupId, archivedAt: null, parentId: null } });
  const task = await prisma.task.create({
    data: { groupId, title, position: count },
    include: { fieldValues: true, subtasks: { include: { fieldValues: true } } },
  });
  await logActivity(task.id, "CREATED", actor, { title });
  return task;
}

export async function updateTaskTitle(taskId: string, title: string, actor?: string) {
  await requireMember(await projectIdFromTask(taskId));
  const task = await prisma.task.update({ where: { id: taskId }, data: { title } });
  await logActivity(taskId, "TITLE_UPDATED", actor, { title });
  return task;
}

export async function upsertTaskField(
  taskId: string,
  columnId: string,
  value: string | null,
  actor?: string,
  fieldLabel?: string
) {
  await requireMember(await projectIdFromTask(taskId));
  if (value === null || value === "") {
    await prisma.taskFieldValue.deleteMany({ where: { taskId, columnId } });
    await logActivity(taskId, "FIELD_UPDATED", actor, { field: fieldLabel ?? columnId, value: null });
    return;
  }
  await prisma.taskFieldValue.upsert({
    where: { taskId_columnId: { taskId, columnId } },
    create: { taskId, columnId, value },
    update: { value },
  });

  // Track completedAt when STATUS changes
  const colForStatus = await prisma.projectColumn.findUnique({ where: { id: columnId } });
  if (colForStatus?.type === "STATUS") {
    await prisma.task.update({
      where: { id: taskId },
      data: { completedAt: value === "DONE" ? new Date() : null },
    });
  }

  await logActivity(taskId, "FIELD_UPDATED", actor, { field: fieldLabel ?? columnId, value });

  // Notify assigned user when OWNER field changes
  const col = await prisma.projectColumn.findUnique({ where: { id: columnId } });
  if (col?.type === "OWNER" && value) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { group: { include: { project: true } } },
    });
    if (task) {
      const assignee = await findUserByNameInProject(task.group.projectId, value);
      if (assignee) {
        await notifyUser(
          assignee.id,
          "TASK_ASSIGNED",
          `Vous avez été assigné à "${task.title}"`,
          taskId,
          task.group.projectId
        );
      }
    }
  }

  // Run automations
  if (col && value !== null) {
    await runAutomations(taskId, col.type, value);
  }
}

async function runAutomations(taskId: string, changedFieldType: string, newValue: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { group: true, fieldValues: { include: { column: true } } },
  });
  if (!task) return;

  const automations = await prisma.automation.findMany({
    where: { projectId: task.group.projectId, isActive: true },
  });

  for (const auto of automations) {
    const trigger = JSON.parse(auto.trigger) as { field: string; value: string };
    if (trigger.field !== changedFieldType || trigger.value !== newValue) continue;

    const action = JSON.parse(auto.action) as
      | { type: "SET_FIELD"; field: string; value: string }
      | { type: "NOTIFY_OWNER" };

    if (action.type === "SET_FIELD") {
      const targetCol = await prisma.projectColumn.findFirst({
        where: { projectId: task.group.projectId, type: action.field as import("@/generated/prisma").ColumnType },
      });
      if (targetCol) {
        await prisma.taskFieldValue.upsert({
          where: { taskId_columnId: { taskId, columnId: targetCol.id } },
          create: { taskId, columnId: targetCol.id, value: action.value },
          update: { value: action.value },
        });
      }
    } else if (action.type === "NOTIFY_OWNER") {
      const ownerFv = task.fieldValues.find((fv) => fv.column.type === "OWNER");
      if (ownerFv?.value) {
        const ownerUser = await findUserByNameInProject(task.group.projectId, ownerFv.value);
        if (ownerUser) {
          await notifyUser(
            ownerUser.id,
            "AUTOMATION",
            `Automatisation "${auto.name}" déclenchée sur "${task.title}"`,
            taskId,
            task.group.projectId
          );
        }
      }
    }
  }
}

export async function deleteTask(taskId: string) {
  await requireMember(await projectIdFromTask(taskId));
  return prisma.task.delete({ where: { id: taskId } });
}

export async function archiveTask(taskId: string, actor?: string) {
  await requireMember(await projectIdFromTask(taskId));
  const task = await prisma.task.update({ where: { id: taskId }, data: { archivedAt: new Date() } });
  await logActivity(taskId, "ARCHIVED", actor);
  return task;
}

export async function moveTask(taskId: string, toGroupId: string, toPosition: number) {
  await requireMember(await projectIdFromTask(taskId));
  // Get all tasks in the target group (excluding the task being moved)
  const siblings = await prisma.task.findMany({
    where: { groupId: toGroupId, archivedAt: null, parentId: null, id: { not: taskId } },
    orderBy: { position: "asc" },
  });
  // Build new order: insert taskId at toPosition
  const before = siblings.slice(0, toPosition);
  const after = siblings.slice(toPosition);
  const ordered = [...before.map((t) => t.id), taskId, ...after.map((t) => t.id)];
  await prisma.$transaction([
    prisma.task.update({ where: { id: taskId }, data: { groupId: toGroupId } }),
    ...ordered.map((id, i) => prisma.task.update({ where: { id }, data: { position: i } })),
  ]);
}

export async function duplicateTask(taskId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { fieldValues: true, group: true },
  });
  if (!task) throw new Error("Task not found");
  await requireMember(task.group.projectId);
  const count = await prisma.task.count({ where: { groupId: task.groupId, archivedAt: null } });
  return prisma.task.create({
    data: {
      groupId: task.groupId,
      title: `${task.title} (copie)`,
      position: count,
      fieldValues: {
        create: task.fieldValues.map((fv) => ({
          columnId: fv.columnId,
          value: fv.value ?? undefined,
        })),
      },
    },
    include: { fieldValues: true },
  });
}

// --- Comment mutations ---

export async function getTaskComments(taskId: string) {
  return prisma.comment.findMany({
    where: { taskId },
    orderBy: { createdAt: "asc" },
  });
}

export async function createComment(taskId: string, content: string, author = "Moi") {
  // Fetch task first: permission check + notification logic
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { group: true, fieldValues: { include: { column: true } } },
  });
  if (!task) throw new Error("Tâche introuvable");
  await requireMember(task.group.projectId);

  const comment = await prisma.comment.create({ data: { taskId, content, author } });
  await logActivity(taskId, "COMMENT_ADDED", author, { preview: content.slice(0, 80) });

  // Notify task owner about new comment (if owner is a known user and not the commenter)
  {
    const ownerField = task.fieldValues.find((fv) => fv.column.type === "OWNER");
    if (ownerField?.value && ownerField.value !== author) {
      const ownerUser = await findUserByNameInProject(task.group.projectId, ownerField.value);
      if (ownerUser) {
        await notifyUser(
          ownerUser.id,
          "COMMENT_ADDED",
          `${author} a commenté sur "${task.title}"`,
          taskId,
          task.group.projectId
        );
      }
    }

    // Notify @mentioned users — match against actual member names (handles multi-word names)
    const projectMembers = await prisma.projectMember.findMany({
      where: { projectId: task.group.projectId },
      include: { user: true },
    });
    for (const member of projectMembers) {
      const name = member.user.name;
      if (!name || name === author) continue;
      if (content.includes(`@${name}`)) {
        await notifyUser(
          member.user.id,
          "MENTIONED",
          `${author} vous a mentionné dans un commentaire sur "${task.title}"`,
          taskId,
          task.group.projectId
        );
      }
    }
  }

  return comment;
}

export async function getTaskActivityLog(taskId: string) {
  return prisma.activityLog.findMany({
    where: { taskId },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
}

export async function getProjectActivityLog(projectId: string, take = 200) {
  return prisma.activityLog.findMany({
    where: { task: { group: { projectId } } },
    include: {
      task: {
        select: {
          id: true,
          title: true,
          group: { select: { name: true, color: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take,
  });
}

// --- Subtask mutations ---

export async function createSubtask(parentId: string, groupId: string, title: string) {
  await requireMember(await projectIdFromGroup(groupId));
  const count = await prisma.task.count({ where: { parentId, archivedAt: null } });
  return prisma.task.create({
    data: { groupId, parentId, title, position: count },
    include: { fieldValues: true },
  });
}

export async function updateSubtaskTitle(subtaskId: string, title: string) {
  await requireMember(await projectIdFromTask(subtaskId));
  return prisma.task.update({ where: { id: subtaskId }, data: { title } });
}

export async function toggleSubtaskDone(subtaskId: string, isDone: boolean, statusColumnId: string) {
  // permission check delegated to upsertTaskField
  return upsertTaskField(subtaskId, statusColumnId, isDone ? "DONE" : "NOT_STARTED");
}

export async function deleteSubtask(subtaskId: string) {
  await requireMember(await projectIdFromTask(subtaskId));
  return prisma.task.delete({ where: { id: subtaskId } });
}

// --- Task dependency mutations ---

export async function getTaskDependencies(taskId: string) {
  const [blockerDeps, blockedDeps] = await Promise.all([
    // Tasks that block this task (this task is blocked by them)
    prisma.taskDependency.findMany({
      where: { blockedId: taskId },
      include: { blocker: { select: { id: true, title: true, groupId: true, fieldValues: true } } },
    }),
    // Tasks that this task blocks
    prisma.taskDependency.findMany({
      where: { blockerId: taskId },
      include: { blocked: { select: { id: true, title: true, groupId: true, fieldValues: true } } },
    }),
  ]);
  return { blockerDeps, blockedDeps };
}

export async function addTaskDependency(blockerId: string, blockedId: string) {
  await requireMember(await projectIdFromTask(blockerId));
  if (blockerId === blockedId) throw new Error("Une tâche ne peut pas se bloquer elle-même");
  // Check for circular dependency
  const reverse = await prisma.taskDependency.findUnique({
    where: { blockerId_blockedId: { blockerId: blockedId, blockedId: blockerId } },
  });
  if (reverse) throw new Error("Dépendance circulaire détectée");
  return prisma.taskDependency.create({ data: { blockerId, blockedId } });
}

export async function removeTaskDependency(blockerId: string, blockedId: string) {
  await requireMember(await projectIdFromTask(blockerId));
  return prisma.taskDependency.deleteMany({ where: { blockerId, blockedId } });
}

export async function getProjectTasksLight(projectId: string) {
  return prisma.task.findMany({
    where: { group: { projectId }, archivedAt: null, parentId: null },
    select: { id: true, title: true, groupId: true },
    orderBy: [{ group: { position: "asc" } }, { position: "asc" }],
  });
}

// --- Member mutations ---

export async function getProjectMembers(projectId: string) {
  return prisma.projectMember.findMany({
    where: { projectId },
    include: { user: { select: { id: true, name: true, email: true, avatar: true } } },
    orderBy: { createdAt: "asc" },
  });
}

export async function inviteMember(
  projectId: string,
  email: string,
  inviterName = "Un membre de l'équipe"
) {
  await requireAdmin(projectId);
  const normalizedEmail = email.toLowerCase().trim();
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { name: true },
  });
  if (!project) throw new Error("Projet introuvable");

  const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });

  if (existingUser) {
    // Déjà membre ?
    const existingMember = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: existingUser.id } },
    });
    if (existingMember) throw new Error("Cet utilisateur est déjà membre du projet");

    // Invitation déjà envoyée ?
    const existingInvitation = await prisma.projectInvitation.findUnique({
      where: { projectId_email: { projectId, email: normalizedEmail } },
    });
    if (existingInvitation && !existingInvitation.acceptedAt) {
      throw new Error("Une invitation est déjà en attente pour cet email");
    }
    // Recréer l'invitation si elle a déjà été acceptée ou expirée
    if (existingInvitation) {
      await prisma.projectInvitation.delete({
        where: { projectId_email: { projectId, email: normalizedEmail } },
      });
    }
  } else {
    // Pas de compte : vérifier invitation en attente
    const existingInvitation = await prisma.projectInvitation.findUnique({
      where: { projectId_email: { projectId, email: normalizedEmail } },
    });
    if (existingInvitation && !existingInvitation.acceptedAt) {
      throw new Error("Une invitation est déjà en attente pour cet email");
    }
    if (existingInvitation) {
      await prisma.projectInvitation.delete({
        where: { projectId_email: { projectId, email: normalizedEmail } },
      });
    }
  }

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 jours
  const invitation = await prisma.projectInvitation.create({
    data: { projectId, email: normalizedEmail, expiresAt },
  });

  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const inviteUrl = `${baseUrl}/invite/${invitation.token}`;

  // L'envoi d'email est non-fatal : l'invitation est créée même si le mail échoue
  try {
    await sendMail({
      to: normalizedEmail,
      subject: `Invitation à rejoindre « ${project.name} »`,
      html: invitationEmailHtml({
        projectName: project.name,
        inviterName,
        inviteUrl,
        hasAccount: !!existingUser,
      }),
      text: `${inviterName} vous invite à rejoindre le projet « ${project.name} ».\n\nAccédez à l'invitation : ${inviteUrl}\n\nCe lien est valable 7 jours.`,
    });
  } catch (mailError) {
    console.error("⚠️  Échec envoi email invitation (invitation créée quand même) :", mailError);
  }

  // Si l'utilisateur a déjà un compte : lui envoyer aussi une notification in-app
  if (existingUser) {
    await prisma.notification.create({
      data: {
        userId: existingUser.id,
        type: "INVITATION",
        message: `${inviterName} vous invite à rejoindre le projet « ${project.name} »`,
        projectId,
      },
    });
  }

  return invitation;
}

export async function getPendingInvitations(email: string) {
  const normalizedEmail = email.toLowerCase().trim();
  return prisma.projectInvitation.findMany({
    where: {
      email: normalizedEmail,
      acceptedAt: null,
      expiresAt: { gt: new Date() },
    },
    include: { project: { select: { id: true, name: true, description: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getInvitationByToken(token: string) {
  return prisma.projectInvitation.findUnique({
    where: { token },
    include: { project: { select: { id: true, name: true } } },
  });
}

export async function acceptInvitation(token: string, userId: string) {
  const invitation = await prisma.projectInvitation.findUnique({
    where: { token },
    include: { project: { select: { id: true, name: true } } },
  });

  if (!invitation) throw new Error("Invitation introuvable");
  if (invitation.acceptedAt) throw new Error("Invitation déjà acceptée");
  if (invitation.expiresAt < new Date()) throw new Error("Invitation expirée");

  // Vérifier si déjà membre
  const existingMember = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId: invitation.projectId, userId } },
  });

  if (!existingMember) {
    await prisma.projectMember.create({
      data: { projectId: invitation.projectId, userId, role: invitation.role },
    });
  }

  await prisma.projectInvitation.update({
    where: { token },
    data: { acceptedAt: new Date() },
  });

  revalidatePath("/");
  revalidatePath(`/projects/${invitation.projectId}`);
  return invitation.project.id;
}

export async function declineInvitation(token: string) {
  await prisma.projectInvitation.update({
    where: { token },
    data: { acceptedAt: new Date() }, // on marque comme "traitée"
  });
  revalidatePath("/");
}

export async function getProjectInvitations(projectId: string) {
  return prisma.projectInvitation.findMany({
    where: { projectId, acceptedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
}

export async function cancelInvitation(invitationId: string) {
  const inv = await prisma.projectInvitation.findUnique({ where: { id: invitationId } });
  if (inv) await requireAdmin(inv.projectId);
  await prisma.projectInvitation.delete({ where: { id: invitationId } });
}

export async function removeMember(projectId: string, userId: string) {
  await requireAdmin(projectId);
  return prisma.projectMember.delete({
    where: { projectId_userId: { projectId, userId } },
  });
}

export async function updateMemberRole(projectId: string, userId: string, role: "ADMIN" | "MEMBER") {
  await requireAdmin(projectId);

  // Prevent demoting the last admin (including self-demotion)
  if (role === "MEMBER") {
    const adminCount = await prisma.projectMember.count({
      where: { projectId, role: "ADMIN" },
    });
    if (adminCount <= 1) {
      throw new Error("Impossible de rétrograder le dernier administrateur du projet.");
    }
  }

  return prisma.projectMember.update({
    where: { projectId_userId: { projectId, userId } },
    data: { role },
    include: { user: { select: { id: true, name: true, email: true, avatar: true } } },
  });
}

// --- Widget mutations ---

export async function toggleDashboardWidget(widgetId: string, isActive: boolean) {
  const w = await prisma.projectDashboardWidget.findUnique({ where: { id: widgetId } });
  if (w) await requireMember(w.projectId);
  return prisma.projectDashboardWidget.update({ where: { id: widgetId }, data: { isActive } });
}

export async function getProjectWidgets(projectId: string) {
  return prisma.projectDashboardWidget.findMany({
    where: { projectId },
    orderBy: { position: "asc" },
  });
}

// --- Bulk task mutations ---

export async function bulkUpdateTaskField(taskIds: string[], columnId: string, value: string | null) {
  if (taskIds.length === 0) return;
  await requireMember(await projectIdFromTask(taskIds[0]));
  if (value === null || value === "") {
    await prisma.taskFieldValue.deleteMany({ where: { taskId: { in: taskIds }, columnId } });
  } else {
    await prisma.$transaction(
      taskIds.map((taskId) =>
        prisma.taskFieldValue.upsert({
          where: { taskId_columnId: { taskId, columnId } },
          create: { taskId, columnId, value },
          update: { value },
        })
      )
    );
  }
}

export async function bulkArchiveTasks(taskIds: string[]) {
  if (taskIds.length === 0) return;
  await requireMember(await projectIdFromTask(taskIds[0]));
  await prisma.task.updateMany({
    where: { id: { in: taskIds } },
    data: { archivedAt: new Date() },
  });
}

export async function bulkDeleteTasks(taskIds: string[]) {
  if (taskIds.length === 0) return;
  await requireMember(await projectIdFromTask(taskIds[0]));
  await prisma.task.deleteMany({ where: { id: { in: taskIds } } });
}

// --- Project template mutations ---

type TemplateTask = {
  title: string;
  priority?: string | null;
  notes?: string | null;
};

type TemplateSnapshot = {
  columns: { type: string; label: string; position: number }[];
  views: { type: string; name: string; isDefault: boolean; position: number }[];
  widgets: { type: string; position: number }[];
  groups: { name: string; color: string; position: number; tasks?: TemplateTask[] }[];
};

export async function saveProjectAsTemplate(
  projectId: string,
  templateName: string,
  includeTasks = false
) {
  await requireAdmin(projectId);
  if (!templateName.trim()) throw new Error("Le nom du template est requis");
  const existingTpl = await prisma.projectTemplate.findFirst({ where: { name: templateName.trim() } });
  if (existingTpl) throw new Error(`Un template nommé "${templateName.trim()}" existe déjà`);
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      columns: { orderBy: { position: "asc" } },
      views: { orderBy: { position: "asc" } },
      dashboardWidgets: { where: { isActive: true }, orderBy: { position: "asc" } },
      groups: {
        orderBy: { position: "asc" },
        include: includeTasks
          ? {
              tasks: {
                where: { archivedAt: null, parentId: null },
                orderBy: { position: "asc" },
                include: { fieldValues: { include: { column: true } } },
              },
            }
          : undefined,
      },
    },
  });
  if (!project) throw new Error("Projet introuvable");

  const priorityTypes = ["PRIORITY"];
  const notesTypes = ["NOTES"];

  const snapshot: TemplateSnapshot = {
    columns: project.columns.map((c) => ({ type: c.type, label: c.label, position: c.position })),
    views: project.views.map((v) => ({ type: v.type, name: v.name, isDefault: v.isDefault, position: v.position })),
    widgets: project.dashboardWidgets.map((w) => ({ type: w.type, position: w.position })),
    groups: project.groups.map((g) => {
      const base = { name: g.name, color: g.color, position: g.position };
      if (!includeTasks || !("tasks" in g) || !g.tasks) return base;
      return {
        ...base,
        tasks: (g.tasks as Array<{ title: string; fieldValues: Array<{ column: { type: string }; value: string | null }> }>).map((t) => {
          const fv = (type: string) =>
            t.fieldValues.find((f) => f.column.type === type)?.value ?? null;
          return {
            title: t.title,
            priority: fv(priorityTypes[0]),
            notes: fv(notesTypes[0]),
          };
        }),
      };
    }),
  };

  return prisma.projectTemplate.create({
    data: {
      name: templateName.trim(),
      description: `Basé sur "${project.name}"`,
      snapshot: JSON.stringify(snapshot),
    },
  });
}

export async function listProjectTemplates() {
  return prisma.projectTemplate.findMany({ orderBy: { createdAt: "desc" } });
}

export async function deleteProjectTemplate(templateId: string) {
  return prisma.projectTemplate.delete({ where: { id: templateId } });
}

export async function createProjectFromTemplate(templateId: string, name: string) {
  if (!name.trim()) throw new Error("Le nom du projet est requis");
  const existing = await prisma.project.findFirst({ where: { name: name.trim() } });
  if (existing) throw new Error(`Un projet nommé "${name.trim()}" existe déjà`);
  const userId = await getAuthUserId();
  const template = await prisma.projectTemplate.findUnique({ where: { id: templateId } });
  if (!template) throw new Error("Template introuvable");

  const snapshot = JSON.parse(template.snapshot) as TemplateSnapshot;

  // Create project with groups (no tasks yet — need column IDs first)
  const project = await prisma.project.create({
    data: {
      name: name.trim(),
      columns: {
        create: snapshot.columns.map((c) => ({
          type: c.type as import("@/generated/prisma").ColumnType,
          label: c.label,
          position: c.position,
          isActive: true,
        })),
      },
      views: {
        create: snapshot.views.map((v) => ({
          type: v.type as import("@/generated/prisma").ViewType,
          name: v.name,
          isDefault: v.isDefault,
          position: v.position,
        })),
      },
      dashboardWidgets: {
        create: snapshot.widgets.map((w) => ({
          type: w.type as import("@/generated/prisma").WidgetType,
          position: w.position,
          isActive: true,
        })),
      },
      groups: {
        create: snapshot.groups.map((g) => ({
          name: g.name,
          color: g.color,
          position: g.position,
        })),
      },
    },
    include: {
      columns: true,
      groups: true,
    },
  });

  // If any group has tasks, recreate them with proper column IDs
  const hasTasks = snapshot.groups.some((g) => g.tasks && g.tasks.length > 0);
  if (hasTasks) {
    const priorityCol = project.columns.find((c) => c.type === "PRIORITY");
    const notesCol = project.columns.find((c) => c.type === "NOTES");

    for (const snapGroup of snapshot.groups) {
      if (!snapGroup.tasks || snapGroup.tasks.length === 0) continue;
      const dbGroup = project.groups.find((g) => g.name === snapGroup.name && g.position === snapGroup.position);
      if (!dbGroup) continue;

      for (let idx = 0; idx < snapGroup.tasks.length; idx++) {
        const t = snapGroup.tasks[idx];
        const fieldValues: { columnId: string; value: string }[] = [];
        if (t.priority && priorityCol) fieldValues.push({ columnId: priorityCol.id, value: t.priority });
        if (t.notes && notesCol) fieldValues.push({ columnId: notesCol.id, value: t.notes });

        await prisma.task.create({
          data: {
            groupId: dbGroup.id,
            title: t.title,
            position: idx,
            fieldValues: fieldValues.length > 0 ? { create: fieldValues } : undefined,
          },
        });
      }
    }
  }

  // Créateur automatiquement ADMIN du projet
  await prisma.projectMember.create({
    data: { projectId: project.id, userId, role: "ADMIN" },
  });

  redirect(`/projects/${project.id}`);
}

// --- Notification helpers (internal) ---

async function notifyUser(
  userId: string,
  type: string,
  message: string,
  taskId?: string,
  projectId?: string
) {
  try {
    // Respect user preferences (default: enabled)
    const pref = await prisma.userNotificationPreference.findUnique({
      where: { userId_type: { userId, type } },
    });
    if (pref && !pref.enabled) return;

    await prisma.notification.create({
      data: { userId, type, message, taskId: taskId ?? null, projectId: projectId ?? null },
    });
  } catch {
    // notifications are non-critical
  }
}

async function findUserByNameInProject(projectId: string, name: string) {
  const member = await prisma.projectMember.findFirst({
    where: { projectId, user: { name } },
    include: { user: true },
  });
  return member?.user ?? null;
}

// --- Notification queries ---

export async function listNotifications(userId: string) {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
}

export async function getUnreadNotificationCount(userId: string) {
  return prisma.notification.count({ where: { userId, isRead: false } });
}

export async function markNotificationRead(notifId: string) {
  await prisma.notification.update({ where: { id: notifId }, data: { isRead: true } });
}

export async function markAllNotificationsRead(userId: string) {
  await prisma.notification.updateMany({ where: { userId, isRead: false }, data: { isRead: true } });
}

// --- Notification preferences ---

/** Returns the list of preferences for the current user (missing entries = enabled by default). */
export async function getNotifPreferences(): Promise<{ type: string; enabled: boolean }[]> {
  const userId = await getAuthUserId();
  const rows = await prisma.userNotificationPreference.findMany({ where: { userId } });
  return NOTIF_TYPES.map(({ type }) => ({
    type,
    enabled: rows.find((r) => r.type === type)?.enabled ?? true,
  }));
}

/** Toggles a specific notification type for the current user. */
export async function setNotifPreference(type: NotifType, enabled: boolean): Promise<void> {
  const userId = await getAuthUserId();
  await prisma.userNotificationPreference.upsert({
    where: { userId_type: { userId, type } },
    create: { userId, type, enabled },
    update: { enabled },
  });
}

// --- Saved views ---

type SavedViewSnapshot = {
  tab: string;
  filters: { status: string[]; priority: string[]; owner: string[] };
  sort: { columnType: string; dir: "asc" | "desc" } | null;
  visibleColumnIds: string[];
  search: string;
};

export async function createSavedView(
  projectId: string,
  name: string,
  snapshot: SavedViewSnapshot
) {
  await requireMember(projectId);
  if (!name.trim()) throw new Error("Le nom de la vue est requis");
  return await prisma.savedView.create({
    data: { projectId, name: name.trim(), snapshot: JSON.stringify(snapshot) },
  });
}

export async function listSavedViews(projectId: string) {
  return await prisma.savedView.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
  });
}

export async function deleteSavedView(viewId: string) {
  const v = await prisma.savedView.findUnique({ where: { id: viewId } });
  if (v) await requireMember(v.projectId);
  await prisma.savedView.delete({ where: { id: viewId } });
}

// --- Recurring tasks ---

export type RecurrenceConfig = {
  frequency: "daily" | "weekly" | "monthly";
  interval: number; // every N days/weeks/months
};

export async function setTaskRecurrence(taskId: string, config: RecurrenceConfig | null) {
  await requireMember(await projectIdFromTask(taskId));
  const task = await prisma.task.update({
    where: { id: taskId },
    data: { recurrence: config ? JSON.stringify(config) : null },
    include: { group: true },
  });
  revalidatePath(`/projects/${task.group.projectId}`);
}

export async function getTaskRecurrence(taskId: string): Promise<RecurrenceConfig | null> {
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { recurrence: true } });
  if (!task?.recurrence) return null;
  return JSON.parse(task.recurrence) as RecurrenceConfig;
}

// --- Task attachments ---

export async function getTaskAttachments(taskId: string) {
  return prisma.taskAttachment.findMany({
    where: { taskId },
    orderBy: { createdAt: "asc" },
  });
}

export async function uploadTaskAttachment(taskId: string, formData: FormData) {
  await requireMember(await projectIdFromTask(taskId));
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) throw new Error("Fichier manquant");

  const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
  if (file.size > MAX_SIZE) throw new Error("Fichier trop volumineux (max 10 Mo)");

  // Sanitize filename
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const uploadDir = path.join(process.cwd(), "public", "uploads", taskId);
  await mkdir(uploadDir, { recursive: true });

  const bytes = await file.arrayBuffer();
  await writeFile(path.join(uploadDir, safeName), Buffer.from(bytes));

  const attachment = await prisma.taskAttachment.create({
    data: {
      taskId,
      filename: file.name,
      filesize: file.size,
      mimetype: file.type || "application/octet-stream",
      path: `/uploads/${taskId}/${safeName}`,
    },
  });
  return attachment;
}

export async function deleteTaskAttachment(id: string) {
  const attachment = await prisma.taskAttachment.findUnique({ where: { id } });
  if (!attachment) return;
  await requireMember(await projectIdFromTask(attachment.taskId));
  const filePath = path.join(process.cwd(), "public", attachment.path);
  await unlink(filePath).catch(() => {});
  await prisma.taskAttachment.delete({ where: { id } });
}

// --- Automations ---

export type AutomationTrigger = { field: string; value: string };
export type AutomationAction =
  | { type: "SET_FIELD"; field: string; value: string }
  | { type: "NOTIFY_OWNER" };

export async function listAutomations(projectId: string) {
  return prisma.automation.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } });
}

export async function createAutomation(
  projectId: string,
  name: string,
  trigger: AutomationTrigger,
  action: AutomationAction
) {
  await requireAdmin(projectId);
  return prisma.automation.create({
    data: { projectId, name, trigger: JSON.stringify(trigger), action: JSON.stringify(action) },
  });
}

export async function toggleAutomation(id: string, isActive: boolean) {
  const a = await prisma.automation.findUnique({ where: { id } });
  if (a) await requireAdmin(a.projectId);
  return prisma.automation.update({ where: { id }, data: { isActive } });
}

export async function deleteAutomation(id: string) {
  const a = await prisma.automation.findUnique({ where: { id } });
  if (a) await requireAdmin(a.projectId);
  return prisma.automation.delete({ where: { id } });
}

// --- Project links ---

export async function getProjectLinks(projectId: string) {
  const links = await prisma.projectLink.findMany({
    where: { OR: [{ projectAId: projectId }, { projectBId: projectId }] },
    include: {
      projectA: { select: { id: true, name: true } },
      projectB: { select: { id: true, name: true } },
    },
  });
  return links.map((l) => ({
    id: l.id,
    project: l.projectAId === projectId ? l.projectB : l.projectA,
  }));
}

export async function addProjectLink(projectId: string, targetProjectId: string) {
  if (projectId === targetProjectId) return;
  // Normalize order to respect unique constraint (smaller id first)
  const [a, b] = [projectId, targetProjectId].sort();
  await prisma.projectLink.upsert({
    where: { projectAId_projectBId: { projectAId: a, projectBId: b } },
    update: {},
    create: { projectAId: a, projectBId: b },
  });
  revalidatePath(`/projects/${projectId}`);
}

export async function removeProjectLink(linkId: string, projectId: string) {
  await prisma.projectLink.delete({ where: { id: linkId } });
  revalidatePath(`/projects/${projectId}`);
}

// --- User Groups (app-wide invitation groups) ---

export async function listUserGroups() {
  await getAuthUserId();
  return prisma.userGroup.findMany({ orderBy: { name: "asc" } });
}

export async function createUserGroup(name: string, emails: string[]) {
  await getAuthUserId();
  if (!name.trim()) throw new Error("Le nom du groupe est requis");
  const clean = emails.map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (clean.length === 0) throw new Error("Au moins un email est requis");
  return prisma.userGroup.create({
    data: { name: name.trim(), emails: JSON.stringify(clean) },
  });
}

export async function updateUserGroup(id: string, name: string, emails: string[]) {
  await getAuthUserId();
  if (!name.trim()) throw new Error("Le nom du groupe est requis");
  const clean = emails.map((e) => e.trim().toLowerCase()).filter(Boolean);
  return prisma.userGroup.update({
    where: { id },
    data: { name: name.trim(), emails: JSON.stringify(clean) },
  });
}

export async function deleteUserGroup(id: string) {
  await getAuthUserId();
  return prisma.userGroup.delete({ where: { id } });
}

/**
 * For each recurring task in the project with a DUE_DATE that has passed,
 * create a new instance and advance the due date by the recurrence interval.
 * Called on project page load (server-side, idempotent).
 */
export async function generateRecurringTasks(projectId: string) {
  const groups = await prisma.group.findMany({
    where: { projectId },
    include: {
      tasks: {
        where: { recurrence: { not: null }, archivedAt: null, parentId: null },
        include: { fieldValues: { include: { column: true } } },
      },
    },
  });

  const dueDateColumns = await prisma.projectColumn.findMany({
    where: { projectId, type: "DUE_DATE" },
  });
  const dueDateColId = dueDateColumns[0]?.id;
  if (!dueDateColId) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const group of groups) {
    for (const task of group.tasks) {
      const config = JSON.parse(task.recurrence!) as RecurrenceConfig;
      const dueFv = task.fieldValues.find((fv) => fv.columnId === dueDateColId);
      if (!dueFv?.value) continue;

      const dueDate = new Date(dueFv.value);
      if (dueDate >= today) continue; // not yet due

      // Compute next due date
      const next = new Date(dueDate);
      if (config.frequency === "daily") next.setDate(next.getDate() + config.interval);
      else if (config.frequency === "weekly") next.setDate(next.getDate() + config.interval * 7);
      else next.setMonth(next.getMonth() + config.interval);

      // Create new task instance
      const position = await prisma.task.count({ where: { groupId: group.id, archivedAt: null, parentId: null } });
      const newTask = await prisma.task.create({
        data: {
          groupId: group.id,
          title: task.title,
          position,
          recurrence: task.recurrence,
          fieldValues: {
            create: task.fieldValues
              .filter((fv) => fv.columnId !== dueDateColId)
              .map((fv) => ({ columnId: fv.columnId, value: fv.value })),
          },
        },
      });
      // Set new due date
      await prisma.taskFieldValue.create({
        data: { taskId: newTask.id, columnId: dueDateColId, value: next.toISOString().split("T")[0] },
      });

      // Archive the original task (completed occurrence)
      await prisma.task.update({ where: { id: task.id }, data: { archivedAt: new Date(), recurrence: null } });
    }
  }
}

/**
 * For each non-archived task in the project with a DUE_DATE in the next DAYS_BEFORE days,
 * create a DUE_DATE_SOON notification for the task owner (once per 7 days per task).
 */
export async function generateDueDateReminders(projectId: string) {
  const DAYS_BEFORE = 2;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const soonLimit = new Date(today);
  soonLimit.setDate(soonLimit.getDate() + DAYS_BEFORE);

  const tasks = await prisma.task.findMany({
    where: { archivedAt: null, group: { projectId } },
    include: { fieldValues: { include: { column: true } }, group: true },
  });

  for (const task of tasks) {
    const dueFv = task.fieldValues.find((fv) => fv.column.type === "DUE_DATE");
    if (!dueFv?.value) continue;

    const dueDate = new Date(dueFv.value);
    dueDate.setHours(0, 0, 0, 0);
    if (dueDate < today || dueDate > soonLimit) continue;

    const ownerFv = task.fieldValues.find((fv) => fv.column.type === "OWNER");
    if (!ownerFv?.value) continue;

    const ownerUser = await findUserByNameInProject(projectId, ownerFv.value);
    if (!ownerUser) continue;

    // Idempotency: skip if already notified in the last 7 days
    const existing = await prisma.notification.findFirst({
      where: {
        userId: ownerUser.id,
        type: "DUE_DATE_SOON",
        taskId: task.id,
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
    });
    if (existing) continue;

    const daysUntil = Math.round((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const message =
      daysUntil === 0
        ? `"${task.title}" est à rendre aujourd'hui`
        : `"${task.title}" est à rendre dans ${daysUntil} jour${daysUntil > 1 ? "s" : ""}`;

    await notifyUser(ownerUser.id, "DUE_DATE_SOON", message, task.id, projectId);
  }
}

// ── Personal space ─────────────────────────────────────────────────────────────

export async function getMyTasks() {
  const userId = await getAuthUserId();

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  if (!user) throw new Error("Utilisateur introuvable");

  const tasks = await prisma.task.findMany({
    where: {
      archivedAt: null,
      fieldValues: {
        some: {
          value: user.name,
          column: { type: "OWNER" },
        },
      },
      group: {
        project: {
          members: { some: { userId } },
        },
      },
    },
    include: {
      fieldValues: { include: { column: true } },
      group: {
        include: {
          project: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: [{ completedAt: "asc" }, { createdAt: "desc" }],
  });

  return tasks.map((task) => {
    const getField = (type: string) =>
      task.fieldValues.find((fv) => fv.column.type === type)?.value ?? null;
    return {
      id: task.id,
      title: task.title,
      completedAt: task.completedAt?.toISOString() ?? null,
      parentId: task.parentId ?? null,
      projectId: task.group.project.id,
      projectName: task.group.project.name,
      groupName: task.group.name,
      status: getField("STATUS"),
      priority: getField("PRIORITY"),
      dueDate: getField("DUE_DATE"),
    };
  });
}

export async function getMyProjects() {
  const userId = await getAuthUserId();
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  if (!user) throw new Error("Utilisateur introuvable");

  const memberships = await prisma.projectMember.findMany({
    where: { userId },
    include: {
      project: {
        include: {
          _count: { select: { members: true } },
          groups: {
            include: {
              tasks: {
                where: { archivedAt: null, parentId: null },
                select: {
                  id: true,
                  completedAt: true,
                  fieldValues: {
                    where: { column: { type: "OWNER" } },
                    select: { value: true },
                  },
                },
              },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return memberships.map((m) => {
    const allTasks = m.project.groups.flatMap((g) => g.tasks);
    const myTaskCount = allTasks.filter((t) =>
      t.fieldValues.some((fv) => fv.value === user.name)
    ).length;
    const completedCount = allTasks.filter((t) => t.completedAt).length;
    return {
      id: m.project.id,
      name: m.project.name,
      role: m.role as "ADMIN" | "MEMBER",
      memberCount: m.project._count.members,
      totalTaskCount: allTasks.length,
      myTaskCount,
      completedCount,
    };
  });
}

export async function updateMyProfile(name: string) {
  const userId = await getAuthUserId();
  if (!name.trim()) throw new Error("Le nom ne peut pas être vide");
  await prisma.user.update({ where: { id: userId }, data: { name: name.trim() } });
  revalidatePath("/me");
}

export async function updateMyPassword(currentPassword: string, newPassword: string) {
  const userId = await getAuthUserId();
  if (newPassword.length < 8) throw new Error("Le mot de passe doit faire au moins 8 caractères");
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("Utilisateur introuvable");
  const valid = await bcrypt.compare(currentPassword, user.password);
  if (!valid) throw new Error("Mot de passe actuel incorrect");
  const hashed = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: userId }, data: { password: hashed } });
}

export async function updateMyAvatar(formData: FormData) {
  const userId = await getAuthUserId();
  const file = formData.get("avatar") as File;
  if (!file || file.size === 0) throw new Error("Aucun fichier fourni");
  if (!file.type.startsWith("image/")) throw new Error("Le fichier doit être une image");

  const dir = path.resolve(process.cwd(), "public/uploads/avatars");
  await mkdir(dir, { recursive: true });

  // Always save as JPEG for consistency
  const filename = `${userId}.jpg`;
  const inputBuffer = Buffer.from(await file.arrayBuffer());

  // Compress & resize: max 256×256, JPEG quality 82, strip metadata
  const compressed = await sharp(inputBuffer)
    .resize(256, 256, { fit: "cover", position: "centre" })
    .jpeg({ quality: 82, progressive: true })
    .toBuffer();

  await writeFile(path.join(dir, filename), compressed);

  const avatarUrl = `/uploads/avatars/${filename}?t=${Date.now()}`;
  await prisma.user.update({ where: { id: userId }, data: { avatar: avatarUrl } });
  revalidatePath("/me");
  return avatarUrl;
}

export async function toggleMyTask(taskId: string) {
  const userId = await getAuthUserId();

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      group: {
        include: {
          project: {
            include: {
              columns: { where: { type: "STATUS", isActive: true } },
              members: { where: { userId }, select: { id: true } },
            },
          },
        },
      },
    },
  });

  if (!task) throw new Error("Tâche introuvable");
  if (!task.group.project.members.length) throw new Error("Accès refusé");

  const nowDone = !task.completedAt;
  await prisma.task.update({ where: { id: taskId }, data: { completedAt: nowDone ? new Date() : null } });

  // Sync STATUS field if a STATUS column exists for this project
  const statusCol = task.group.project.columns[0];
  if (statusCol) {
    await prisma.taskFieldValue.upsert({
      where: { taskId_columnId: { taskId, columnId: statusCol.id } },
      create: { taskId, columnId: statusCol.id, value: nowDone ? "Done" : "Not started" },
      update: { value: nowDone ? "Done" : "Not started" },
    });
  }
}
