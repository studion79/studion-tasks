"use server";

import {
  prisma,
  revalidatePath,
  requireMember,
  projectIdFromTask,
  notifyUser,
  findUserByNameInProject,
  emitTaskChanged,
  emitArchiveChanged,
  emitProjectChanged,
} from "./_helpers";
import { toCanonicalStatus } from "@/lib/status";
import { formatDailySummary, formatDueSoonMessage, formatOverdueMessage, getUserLocale } from "@/lib/i18n/server";
import { parseDateTimeToDate, parseTimelineValue, toLocalIsoMinute, hasExplicitTime } from "@/lib/task-schedule";

export type RecurrenceConfig = {
  frequency: "daily" | "weekly" | "monthly";
  interval: number; // every N days/weeks/months
  endDate?: string | null; // YYYY-MM-DD, null/undefined = infinite
};

function getTimeZoneDateParts(now: Date, timeZone: string): { dateKey: string; minutes: number } {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(now);
    const year = parts.find((p) => p.type === "year")?.value ?? "1970";
    const month = parts.find((p) => p.type === "month")?.value ?? "01";
    const day = parts.find((p) => p.type === "day")?.value ?? "01";
    const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
    const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
    return {
      dateKey: `${year}-${month}-${day}`,
      minutes: (Number.isNaN(hour) ? 0 : hour) * 60 + (Number.isNaN(minute) ? 0 : minute),
    };
  } catch {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return {
      dateKey: `${y}-${m}-${d}`,
      minutes: now.getHours() * 60 + now.getMinutes(),
    };
  }
}

function parseMinutes(hhmm: string): number | null {
  const m = hhmm.match(/^(\d{2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (Number.isNaN(h) || Number.isNaN(min) || h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

function sanitizeRecurrenceConfig(config: RecurrenceConfig): RecurrenceConfig {
  const interval = Math.max(1, Math.floor(Number(config.interval) || 1));
  const endDate = config.endDate?.trim() || null;
  return {
    frequency: config.frequency,
    interval,
    endDate,
  };
}

export async function setTaskRecurrence(taskId: string, config: RecurrenceConfig | null) {
  const projectId = await projectIdFromTask(taskId);
  await requireMember(projectId);
  const safeConfig = config ? sanitizeRecurrenceConfig(config) : null;
  const task = await prisma.task.update({
    where: { id: taskId },
    data: { recurrence: safeConfig ? JSON.stringify(safeConfig) : null },
    include: { group: true },
  });
  revalidatePath(`/projects/${task.group.projectId}`);
  emitTaskChanged(projectId, taskId);
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
  let hasChanges = false;
  let archiveChanged = false;
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
      const safeConfig = sanitizeRecurrenceConfig(config);
      const dueFv = task.fieldValues.find((fv) => fv.columnId === dueDateColId);
      if (!dueFv?.value) continue;

      const dueDate = new Date(dueFv.value);
      if (dueDate >= today) continue; // not yet due

      // Compute next due date
      const next = new Date(dueDate);
      if (safeConfig.frequency === "daily") next.setDate(next.getDate() + safeConfig.interval);
      else if (safeConfig.frequency === "weekly") next.setDate(next.getDate() + safeConfig.interval * 7);
      else next.setMonth(next.getMonth() + safeConfig.interval);

      const recurrenceEnd = safeConfig.endDate
        ? new Date(`${safeConfig.endDate}T00:00:00`)
        : null;
      if (recurrenceEnd && next > recurrenceEnd) {
        await prisma.task.update({ where: { id: task.id }, data: { archivedAt: new Date(), recurrence: null } });
        hasChanges = true;
        archiveChanged = true;
        continue;
      }

      // Create new task instance
      const position = await prisma.task.count({ where: { groupId: group.id, archivedAt: null, parentId: null } });
      const newTask = await prisma.task.create({
        data: {
          groupId: group.id,
          title: task.title,
          position,
          recurrence: JSON.stringify(safeConfig),
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
      hasChanges = true;
      emitTaskChanged(projectId, newTask.id);

      // Archive the original task (completed occurrence)
      await prisma.task.update({ where: { id: task.id }, data: { archivedAt: new Date(), recurrence: null } });
      archiveChanged = true;
      emitArchiveChanged(projectId, task.id);
    }
  }
  if (hasChanges) emitProjectChanged(projectId);
  if (archiveChanged) emitArchiveChanged(projectId);
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
    const ownerLocale = await getUserLocale(ownerUser.id);
    const message = formatDueSoonMessage(ownerLocale, task.title, daysUntil);

    await notifyUser(ownerUser.id, "DUE_DATE_SOON", message, task.id, projectId);
  }
}

/**
 * For each non-archived task in the project that is past due and not completed,
 * create an OVERDUE notification for the task owner (once per day per task).
 */
export async function generateOverdueReminders(projectId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tasks = await prisma.task.findMany({
    where: { archivedAt: null, group: { projectId } },
    include: { fieldValues: { include: { column: true } } },
  });

  for (const task of tasks) {
    if (task.completedAt) continue;

    const statusRaw = task.fieldValues.find((fv) => fv.column.type === "STATUS")?.value ?? null;
    if (toCanonicalStatus(statusRaw) === "DONE") continue;

    const dueRaw = task.fieldValues.find((fv) => fv.column.type === "DUE_DATE")?.value ?? null;
    if (!dueRaw) continue;

    const dueDate = new Date(dueRaw);
    dueDate.setHours(0, 0, 0, 0);
    if (dueDate >= today) continue;

    const ownerName = task.fieldValues.find((fv) => fv.column.type === "OWNER")?.value ?? null;
    if (!ownerName) continue;

    const ownerUser = await findUserByNameInProject(projectId, ownerName);
    if (!ownerUser) continue;

    const existing = await prisma.notification.findFirst({
      where: {
        userId: ownerUser.id,
        type: "OVERDUE",
        taskId: task.id,
        createdAt: { gte: today },
      },
    });
    if (existing) continue;

    const ownerLocale = await getUserLocale(ownerUser.id);
    const message = formatOverdueMessage(ownerLocale, task.title);
    await notifyUser(ownerUser.id, "OVERDUE", message, task.id, projectId);
  }
}

function pickTaskScheduledDateTime(task: {
  fieldValues: Array<{ value: string | null; column: { type: string } }>;
}): Date | null {
  const dueRaw = task.fieldValues.find((fv) => fv.column.type === "DUE_DATE")?.value ?? null;
  if (dueRaw && hasExplicitTime(dueRaw)) {
    return parseDateTimeToDate(dueRaw);
  }

  const timelineRaw = task.fieldValues.find((fv) => fv.column.type === "TIMELINE")?.value ?? null;
  const timeline = parseTimelineValue(timelineRaw);
  if (timeline?.start && hasExplicitTime(timeline.start)) {
    return parseDateTimeToDate(timeline.start);
  }
  if (timeline?.end && hasExplicitTime(timeline.end)) {
    return parseDateTimeToDate(timeline.end);
  }
  return null;
}

/**
 * For tasks that include an explicit hour (due date or timeline),
 * send one reminder before the scheduled time based on task.reminderOffsetMinutes.
 * Idempotent via Task.reminderSentFor.
 */
export async function generateTaskTimeReminders(projectId: string) {
  const now = new Date();
  const WINDOW_MINUTES = 1;

  const tasks = await prisma.task.findMany({
    where: { archivedAt: null, group: { projectId } },
    include: {
      fieldValues: { include: { column: true } },
      group: true,
    },
  });

  for (const task of tasks) {
    if (task.completedAt) continue;
    const statusRaw = task.fieldValues.find((fv) => fv.column.type === "STATUS")?.value ?? null;
    if (toCanonicalStatus(statusRaw) === "DONE") continue;

    const ownerName = task.fieldValues.find((fv) => fv.column.type === "OWNER")?.value ?? null;
    if (!ownerName) continue;
    const ownerUser = await findUserByNameInProject(projectId, ownerName);
    if (!ownerUser) continue;

    const scheduledAt = pickTaskScheduledDateTime(task);
    if (!scheduledAt) continue;
    const offset = Math.max(0, task.reminderOffsetMinutes ?? 0);
    const triggerAt = new Date(scheduledAt.getTime() - offset * 60_000);
    const diffMs = now.getTime() - triggerAt.getTime();
    if (diffMs < 0 || diffMs > WINDOW_MINUTES * 60_000) continue;

    const scheduleKey = `${task.id}:${toLocalIsoMinute(scheduledAt)}:${offset}`;
    if (task.reminderSentFor === scheduleKey) continue;

    const ownerLocale = await getUserLocale(ownerUser.id);
    const hhmm = `${String(scheduledAt.getHours()).padStart(2, "0")}:${String(scheduledAt.getMinutes()).padStart(2, "0")}`;
    const message =
      ownerLocale === "en"
        ? `Action required — "${task.title}" is scheduled at ${hhmm}.`
        : `Action requise — "${task.title}" est prévue à ${hhmm}.`;

    await notifyUser(ownerUser.id, "DUE_DATE_SOON", message, task.id, projectId);
    await prisma.task.update({
      where: { id: task.id },
      data: { reminderSentFor: scheduleKey },
    });
  }
}

/**
 * Creates one DAILY_SUMMARY notification per user per day (idempotent),
 * based on all tasks assigned to that user.
 */
export async function generateDailySummaries() {
  const tz = process.env.APP_TIMEZONE?.trim() || "Europe/Paris";
  const now = new Date();
  const { dateKey: todayKey, minutes: nowMinutes } = getTimeZoneDateParts(now, tz);

  let settingsByUser = new Map<string, { dailySummaryTime: string }>();
  try {
    await prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "UserNotificationSettings" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "pushEnabled" BOOLEAN NOT NULL DEFAULT true,
        "emailEnabled" BOOLEAN NOT NULL DEFAULT false,
        "dndEnabled" BOOLEAN NOT NULL DEFAULT false,
        "dndStart" TEXT NOT NULL DEFAULT '22:00',
        "dndEnd" TEXT NOT NULL DEFAULT '08:00',
        "dndWeekendsOnly" BOOLEAN NOT NULL DEFAULT false,
        "dailySummaryTime" TEXT NOT NULL DEFAULT '08:00',
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "UserNotificationSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      )`
    );
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UserNotificationSettings_userId_key" ON "UserNotificationSettings"("userId")`
    );
    try {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "UserNotificationSettings" ADD COLUMN "dailySummaryTime" TEXT NOT NULL DEFAULT '08:00'`
      );
    } catch {
      // already exists
    }
    const rows = await prisma.$queryRawUnsafe<Array<{ userId: string; dailySummaryTime: string }>>(
      `SELECT "userId","dailySummaryTime" FROM "UserNotificationSettings"`
    );
    settingsByUser = new Map(rows.map((r) => [r.userId, { dailySummaryTime: r.dailySummaryTime }]));
  } catch {
    settingsByUser = new Map();
  }

  const users = await prisma.user.findMany({
    select: { id: true, name: true },
  });

  for (const user of users) {
    if (!user.name?.trim()) continue;

    const configuredTime = settingsByUser.get(user.id)?.dailySummaryTime ?? "08:00";
    const triggerMinutes = parseMinutes(configuredTime) ?? parseMinutes("08:00") ?? 480;
    if (nowMinutes < triggerMinutes) continue;

    const existing = await prisma.notification.findFirst({
      where: {
        userId: user.id,
        type: "DAILY_SUMMARY",
        createdAt: { gte: new Date(`${todayKey}T00:00:00`) },
      },
    });
    if (existing) continue;

    const tasks = await prisma.task.findMany({
      where: {
        archivedAt: null,
        parentId: null,
        fieldValues: {
          some: { value: user.name, column: { type: "OWNER" } },
        },
        group: { project: { members: { some: { userId: user.id } } } },
      },
      include: {
        fieldValues: { include: { column: true } },
      },
    });

    const activeTasks = tasks.filter((task) => {
      if (task.completedAt) return false;
      const statusRaw = task.fieldValues.find((fv) => fv.column.type === "STATUS")?.value ?? null;
      return toCanonicalStatus(statusRaw) !== "DONE";
    });
    const dueTodayCount = activeTasks.filter((task) => {
      const dueRaw = task.fieldValues.find((fv) => fv.column.type === "DUE_DATE")?.value ?? null;
      if (!dueRaw) return false;
      return dueRaw.slice(0, 10) === todayKey;
    }).length;
    const blockedCount = activeTasks.filter((task) => {
      const statusRaw = task.fieldValues.find((fv) => fv.column.type === "STATUS")?.value ?? null;
      const canonical = toCanonicalStatus(statusRaw);
      return canonical === "STUCK" || canonical === "WAITING";
    }).length;

    const todayTaskSet = new Set<string>();
    for (const task of activeTasks) {
      const title = task.title.trim();
      if (!title) continue;

      const dueRaw = task.fieldValues.find((fv) => fv.column.type === "DUE_DATE")?.value ?? null;
      const dueToday = Boolean(dueRaw && dueRaw.slice(0, 10) === todayKey);

      const timelineRaw = task.fieldValues.find((fv) => fv.column.type === "TIMELINE")?.value ?? null;
      const timeline = parseTimelineValue(timelineRaw);
      const startKey = timeline?.start ? timeline.start.slice(0, 10) : null;
      const endKey = timeline?.end ? timeline.end.slice(0, 10) : null;
      const normalizedStart = startKey || endKey;
      const normalizedEnd = endKey || startKey;
      const periodInProgress = Boolean(
        normalizedStart &&
          normalizedEnd &&
          normalizedStart <= todayKey &&
          todayKey <= normalizedEnd
      );

      if (dueToday || periodInProgress) {
        todayTaskSet.add(title);
      }
    }
    const todayTasks = Array.from(todayTaskSet);
    const locale = await getUserLocale(user.id);
    const message = formatDailySummary(locale, {
      activeTasks: activeTasks.length,
      dueTodayCount,
      blockedCount,
      todayTasks,
    });
    await notifyUser(user.id, "DAILY_SUMMARY", message);
  }
}
