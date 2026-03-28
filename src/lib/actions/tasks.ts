"use server";

import { prisma, revalidatePath, requireMember, projectIdFromTask, projectIdFromGroup, logActivity, notifyUser, findUserByNameInProject } from "./_helpers";

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

export async function unarchiveTask(taskId: string) {
  await requireMember(await projectIdFromTask(taskId));
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { group: true },
  });
  if (!task) throw new Error("Tâche introuvable");
  const updatedTask = await prisma.task.update({
    where: { id: taskId },
    data: { archivedAt: null },
  });
  revalidatePath(`/projects/${task.group.projectId}`);
  return updatedTask;
}

export async function restoreTask(taskId: string) {
  await requireMember(await projectIdFromTask(taskId));
  return prisma.task.update({ where: { id: taskId }, data: { archivedAt: null } });
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
