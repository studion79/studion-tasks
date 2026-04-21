"use server";

import {
  prisma,
  revalidatePath,
  requireMember,
  projectIdFromTask,
  projectIdFromGroup,
  logActivity,
  notifyUser,
  findUserByOwnerValueInProject,
  emitTaskChanged,
  emitProjectChanged,
  emitArchiveChanged,
} from "./_helpers";
import { isDoneStatus, toCanonicalStatus } from "@/lib/status";
import { composeDateTimeValue, hasExplicitTime } from "@/lib/task-schedule";

const INBOX_GROUP_NAME = "À trier";

async function getPersonalOwnerForProject(projectId: string): Promise<{ ownerId: string; ownerName: string } | null> {
  const rows = await prisma.$queryRawUnsafe<Array<{ isPersonal: number; ownerId: string | null; ownerName: string | null }>>(
    `SELECT p."isPersonal" as isPersonal, u."id" as ownerId, u."name" as ownerName
     FROM "Project" p
     LEFT JOIN "User" u ON u."id" = p."personalOwnerId"
     WHERE p."id" = ?
     LIMIT 1`,
    projectId
  );
  const row = rows[0];
  if (!row || !Boolean(row.isPersonal) || !row.ownerName || !row.ownerId) return null;
  return { ownerId: row.ownerId, ownerName: row.ownerName };
}

async function forceOwnerForTaskIfPersonal(taskId: string, projectId: string): Promise<void> {
  const owner = await getPersonalOwnerForProject(projectId);
  if (!owner) return;
  const ownerColumn = await prisma.projectColumn.findFirst({
    where: { projectId, type: "OWNER" },
    orderBy: { position: "asc" },
    select: { id: true },
  });
  if (!ownerColumn) return;
  await prisma.taskFieldValue.upsert({
    where: { taskId_columnId: { taskId, columnId: ownerColumn.id } },
    create: { taskId, columnId: ownerColumn.id, value: owner.ownerId },
    update: { value: owner.ownerId },
  });
}

async function ensureDefaultInboxGroup(projectId: string) {
  const existing = await prisma.group.findFirst({
    where: { projectId, name: INBOX_GROUP_NAME },
    orderBy: { position: "asc" },
  });
  if (existing) return existing;
  const count = await prisma.group.count({ where: { projectId } });
  return prisma.group.create({
    data: {
      projectId,
      name: INBOX_GROUP_NAME,
      color: "#6b7280",
      position: count,
    },
  });
}

// runAutomations is internal — defined here, used by upsertTaskField
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
        const ownerUser = await findUserByOwnerValueInProject(task.group.projectId, ownerFv.value);
        if (ownerUser) {
          await notifyUser(
            ownerUser.id,
            "AUTOMATION",
            `Automation "${auto.name}" triggered on "${task.title}"`,
            taskId,
            task.group.projectId
          );
        }
      }
    }
  }
}

export async function createTask(groupId: string, title: string, actor?: string) {
  const projectId = await projectIdFromGroup(groupId);
  await requireMember(projectId);
  const count = await prisma.task.count({ where: { groupId, archivedAt: null, parentId: null } });
  const task = await prisma.task.create({
    data: { groupId, title, position: count },
    include: { fieldValues: true, subtasks: { include: { fieldValues: true } } },
  });
  await forceOwnerForTaskIfPersonal(task.id, projectId);
  await logActivity(task.id, "CREATED", actor, { title });
  emitTaskChanged(projectId, task.id);
  return task;
}

export async function createQuickTask(params: {
  projectId: string;
  title: string;
  groupId?: string | null;
  dueDate?: string | null;
  dueTime?: string | null;
  reminderMinutes?: number | null;
}) {
  const projectId = params.projectId;
  const title = params.title.trim();
  if (!title) throw new Error("TASK_TITLE_REQUIRED");

  await requireMember(projectId);

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, archivedAt: true },
  });
  if (!project || project.archivedAt) throw new Error("PROJECT_NOT_AVAILABLE");

  let targetGroupId: string;
  if (params.groupId) {
    const group = await prisma.group.findUnique({
      where: { id: params.groupId },
      select: { id: true, projectId: true },
    });
    if (!group || group.projectId !== projectId) {
      throw new Error("INVALID_GROUP");
    }
    targetGroupId = group.id;
  } else {
    const inbox = await ensureDefaultInboxGroup(projectId);
    targetGroupId = inbox.id;
  }

  const count = await prisma.task.count({
    where: { groupId: targetGroupId, archivedAt: null, parentId: null },
  });
  const task = await prisma.task.create({
    data: {
      groupId: targetGroupId,
      title,
      position: count,
    },
    select: { id: true },
  });
  const dueValue = params.dueDate ? composeDateTimeValue(params.dueDate, params.dueTime) : "";
  if (dueValue) {
    const dueDateColumn = await prisma.projectColumn.findFirst({
      where: { projectId, type: "DUE_DATE" },
      orderBy: { position: "asc" },
      select: { id: true },
    });
    if (dueDateColumn) {
      await prisma.taskFieldValue.upsert({
        where: { taskId_columnId: { taskId: task.id, columnId: dueDateColumn.id } },
        create: { taskId: task.id, columnId: dueDateColumn.id, value: dueValue },
        update: { value: dueValue },
      });
      if (hasExplicitTime(dueValue)) {
        const reminderMinutes =
          params.reminderMinutes === null || params.reminderMinutes === undefined
            ? 0
            : Math.max(0, Math.min(24 * 60, Math.floor(params.reminderMinutes)));
        await prisma.task.update({
          where: { id: task.id },
          data: { reminderOffsetMinutes: reminderMinutes, reminderSentFor: null },
        });
      }
    }
  }
  await forceOwnerForTaskIfPersonal(task.id, projectId);
  if (params.dueDate || params.dueTime) {
    await logActivity(task.id, "QUICK_SCHEDULE_SET", "System", {
      dueDate: params.dueDate ?? null,
      dueTime: params.dueTime ?? null,
    });
  }

  revalidatePath("/");
  revalidatePath("/me");
  revalidatePath(`/projects/${projectId}`);
  emitTaskChanged(projectId, task.id);
  return task;
}

export async function updateTaskTitle(taskId: string, title: string, actor?: string) {
  const projectId = await projectIdFromTask(taskId);
  await requireMember(projectId);
  const task = await prisma.task.update({ where: { id: taskId }, data: { title } });
  await logActivity(taskId, "TITLE_UPDATED", actor, { title });
  emitTaskChanged(projectId, taskId);
  return task;
}

export async function upsertTaskField(
  taskId: string,
  columnId: string,
  value: string | null,
  actor?: string,
  fieldLabel?: string
) {
  const projectId = await projectIdFromTask(taskId);
  await requireMember(projectId);
  const col = await prisma.projectColumn.findUnique({ where: { id: columnId } });
  let normalizedValue =
    col?.type === "STATUS" && value !== null
      ? toCanonicalStatus(value)
      : value;

  if (col?.type === "OWNER") {
    const personalOwner = await getPersonalOwnerForProject(projectId);
    if (personalOwner) {
      normalizedValue = personalOwner.ownerId;
    } else if (normalizedValue) {
      const ownerUser = await findUserByOwnerValueInProject(projectId, normalizedValue);
      if (ownerUser) normalizedValue = ownerUser.id;
    }
  }

  if (normalizedValue === null || normalizedValue === "") {
    await prisma.taskFieldValue.deleteMany({ where: { taskId, columnId } });
    await logActivity(taskId, "FIELD_UPDATED", actor, { field: fieldLabel ?? columnId, value: null });
    emitTaskChanged(projectId, taskId);
    return;
  }

  await prisma.taskFieldValue.upsert({
    where: { taskId_columnId: { taskId, columnId } },
    create: { taskId, columnId, value: normalizedValue },
    update: { value: normalizedValue },
  });

  if (col?.type === "DUE_DATE" || col?.type === "TIMELINE") {
    await prisma.task.update({
      where: { id: taskId },
      data: {
        ...(col.type === "DUE_DATE" && !hasExplicitTime(normalizedValue) ? { reminderOffsetMinutes: null } : {}),
        reminderSentFor: null,
      },
    });
  }

  // Track completedAt when STATUS changes
  if (col?.type === "STATUS") {
    const taskForArchive = await prisma.task.findUnique({
      where: { id: taskId },
      select: { parentId: true },
    });
    const done = isDoneStatus(normalizedValue);
    const updateData: { completedAt: Date | null; archivedAt?: Date | null } = {
      completedAt: done ? new Date() : null,
    };
    // Only archive top-level tasks. Subtasks keep their visibility in task detail.
    if (taskForArchive?.parentId === null) {
      updateData.archivedAt = done ? new Date() : null;
    }
    await prisma.task.update({
      where: { id: taskId },
      data: updateData,
    });
  }

  await logActivity(taskId, "FIELD_UPDATED", actor, { field: fieldLabel ?? columnId, value: normalizedValue });

  // Notify assigned user when OWNER field changes
  if (col?.type === "OWNER" && normalizedValue) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { group: { include: { project: true } } },
    });
    if (task) {
      const assignee = await findUserByOwnerValueInProject(task.group.projectId, normalizedValue);
      if (assignee) {
        await notifyUser(
          assignee.id,
          "TASK_ASSIGNED",
          `You have been assigned to "${task.title}"`,
          taskId,
          task.group.projectId
        );
      }
    }
  }

  // Run automations
  if (col && normalizedValue !== null) {
    await runAutomations(taskId, col.type, normalizedValue);
  }
  emitTaskChanged(projectId, taskId);
  if (col?.type === "STATUS") {
    emitArchiveChanged(projectId, taskId);
  }
}

export async function setTaskReminderPreference(taskId: string, minutes: number | null) {
  const projectId = await projectIdFromTask(taskId);
  await requireMember(projectId);

  const sanitized =
    minutes === null
      ? null
      : Number.isFinite(minutes)
        ? Math.max(0, Math.min(24 * 60, Math.floor(minutes)))
        : null;

  await prisma.task.update({
    where: { id: taskId },
    data: {
      reminderOffsetMinutes: sanitized,
      reminderSentFor: null,
    },
  });

  revalidatePath("/");
  revalidatePath("/me");
  revalidatePath(`/projects/${projectId}`);
  emitTaskChanged(projectId, taskId);
}

export async function deleteTask(taskId: string) {
  const projectId = await projectIdFromTask(taskId);
  await requireMember(projectId);
  const deleted = await prisma.task.delete({ where: { id: taskId } });
  emitTaskChanged(projectId, taskId);
  emitArchiveChanged(projectId, taskId);
  return deleted;
}

export async function archiveTask(taskId: string, actor?: string) {
  const projectId = await projectIdFromTask(taskId);
  await requireMember(projectId);
  const task = await prisma.task.update({ where: { id: taskId }, data: { archivedAt: new Date() } });
  await logActivity(taskId, "ARCHIVED", actor);
  emitArchiveChanged(projectId, taskId);
  emitTaskChanged(projectId, taskId);
  return task;
}

export async function unarchiveTask(taskId: string) {
  await requireMember(await projectIdFromTask(taskId));
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { group: true },
  });
  if (!task) throw new Error("Task not found.");
  const statusCol = await prisma.projectColumn.findFirst({
    where: { projectId: task.group.projectId, type: "STATUS", isActive: true },
  });
  const statusFv = statusCol
    ? await prisma.taskFieldValue.findUnique({
        where: { taskId_columnId: { taskId, columnId: statusCol.id } },
      })
    : null;
  const doneByStatus = isDoneStatus(statusFv?.value ?? null);
  const shouldClearCompletion = Boolean(task.completedAt) || doneByStatus;
  const updatedTask = await prisma.task.update({
    where: { id: taskId },
    data: {
      archivedAt: null,
      ...(shouldClearCompletion ? { completedAt: null } : {}),
    },
  });
  if (statusCol && doneByStatus) {
    await prisma.taskFieldValue.upsert({
      where: { taskId_columnId: { taskId, columnId: statusCol.id } },
      create: { taskId, columnId: statusCol.id, value: "NOT_STARTED" },
      update: { value: "NOT_STARTED" },
    });
  }
  revalidatePath(`/projects/${task.group.projectId}`);
  emitArchiveChanged(task.group.projectId, taskId);
  emitTaskChanged(task.group.projectId, taskId);
  return updatedTask;
}

export async function restoreTask(taskId: string) {
  await requireMember(await projectIdFromTask(taskId));
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { group: true },
  });
  if (!task) throw new Error("Task not found.");
  const statusCol = await prisma.projectColumn.findFirst({
    where: { projectId: task.group.projectId, type: "STATUS", isActive: true },
  });
  const statusFv = statusCol
    ? await prisma.taskFieldValue.findUnique({
        where: { taskId_columnId: { taskId, columnId: statusCol.id } },
      })
    : null;
  const doneByStatus = isDoneStatus(statusFv?.value ?? null);
  const shouldClearCompletion = Boolean(task.completedAt) || doneByStatus;
  const restored = await prisma.task.update({
    where: { id: taskId },
    data: {
      archivedAt: null,
      ...(shouldClearCompletion ? { completedAt: null } : {}),
    },
  });
  if (statusCol && doneByStatus) {
    await prisma.taskFieldValue.upsert({
      where: { taskId_columnId: { taskId, columnId: statusCol.id } },
      create: { taskId, columnId: statusCol.id, value: "NOT_STARTED" },
      update: { value: "NOT_STARTED" },
    });
  }
  revalidatePath(`/projects/${task.group.projectId}`);
  emitArchiveChanged(task.group.projectId, taskId);
  emitTaskChanged(task.group.projectId, taskId);
  return restored;
}

export async function moveTask(taskId: string, toGroupId: string, toPosition: number) {
  const projectId = await projectIdFromTask(taskId);
  await requireMember(projectId);
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
  emitTaskChanged(projectId, taskId);
}

export async function duplicateTask(taskId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { fieldValues: true, group: true },
  });
  if (!task) throw new Error("Task not found");
  await requireMember(task.group.projectId);
  const count = await prisma.task.count({
    where: {
      groupId: task.groupId,
      archivedAt: null,
      parentId: task.parentId,
    },
  });
  const duplicated = await prisma.task.create({
    data: {
      groupId: task.groupId,
      parentId: task.parentId,
      title: `${task.title} (copy)`,
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
  emitTaskChanged(task.group.projectId, duplicated.id);
  return duplicated;
}

export async function bulkUpdateTaskField(taskIds: string[], columnId: string, value: string | null) {
  if (taskIds.length === 0) return;
  const projectId = await projectIdFromTask(taskIds[0]);
  await requireMember(projectId);
  const column = await prisma.projectColumn.findUnique({
    where: { id: columnId },
    select: { type: true },
  });

  let effectiveValue = value;
  if (column?.type === "OWNER") {
    const personalOwner = await getPersonalOwnerForProject(projectId);
    if (personalOwner) {
      effectiveValue = personalOwner.ownerId;
    } else if (effectiveValue) {
      const ownerUser = await findUserByOwnerValueInProject(projectId, effectiveValue);
      if (ownerUser) effectiveValue = ownerUser.id;
    }
  }

  if (effectiveValue === null || effectiveValue === "") {
    await prisma.taskFieldValue.deleteMany({ where: { taskId: { in: taskIds }, columnId } });
  } else {
    await prisma.$transaction(
      taskIds.map((taskId) =>
        prisma.taskFieldValue.upsert({
          where: { taskId_columnId: { taskId, columnId } },
          create: { taskId, columnId, value: effectiveValue },
          update: { value: effectiveValue },
        })
      )
    );
  }
  emitProjectChanged(projectId);
}

export async function bulkArchiveTasks(taskIds: string[]) {
  if (taskIds.length === 0) return;
  const projectId = await projectIdFromTask(taskIds[0]);
  await requireMember(projectId);
  await prisma.task.updateMany({
    where: { id: { in: taskIds } },
    data: { archivedAt: new Date() },
  });
  emitArchiveChanged(projectId);
  emitProjectChanged(projectId);
}

export async function bulkDeleteTasks(taskIds: string[]) {
  if (taskIds.length === 0) return;
  const projectId = await projectIdFromTask(taskIds[0]);
  await requireMember(projectId);
  await prisma.task.deleteMany({ where: { id: { in: taskIds } } });
  emitTaskChanged(projectId, taskIds[0]);
  emitArchiveChanged(projectId);
}
