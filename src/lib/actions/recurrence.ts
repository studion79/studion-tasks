"use server";

import { prisma, revalidatePath, requireMember, projectIdFromTask, notifyUser, findUserByNameInProject } from "./_helpers";

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
