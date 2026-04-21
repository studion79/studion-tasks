// NO "use server" — this file only exports helpers used by other action files

import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { isSuperAdminUserId } from "@/lib/super-admin";
import { sendWebPushToUser } from "@/lib/push";
import { sendMail } from "@/lib/mailer";
import { getUserLocale } from "@/lib/i18n/server";
import type { AppLocale } from "@/i18n/config";
import { publishRealtimeEvent } from "@/lib/realtime";
import { pickByIsEn } from "@/lib/i18n/pick";
export { revalidatePath } from "next/cache";
export { prisma };

function clampText(value: string, max: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function extractQuotedTaskName(message: string): string | null {
  const quoteMatch = message.match(/["“«]([^"”»]+)["”»]/);
  return quoteMatch?.[1]?.trim() || null;
}

function normalizeBody(body: string): string {
  const clean = body
    .replace(/[!]{2,}/g, "!")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return "";
  return clean.endsWith(".") ? clean : `${clean}.`;
}

function toTagPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function parseMinutes(hhmm: string): number | null {
  const m = hhmm.match(/^(\d{2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (Number.isNaN(h) || Number.isNaN(min) || h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

function getTimePartsInTimeZone(now: Date, timeZone: string): { day: number; minutes: number } | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(now);
    const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
    const hourStr = parts.find((p) => p.type === "hour")?.value ?? "";
    const minuteStr = parts.find((p) => p.type === "minute")?.value ?? "";
    const map: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };
    const day = map[weekday];
    const hour = Number(hourStr);
    const minute = Number(minuteStr);
    if (day === undefined || Number.isNaN(hour) || Number.isNaN(minute)) return null;
    return { day, minutes: hour * 60 + minute };
  } catch {
    return null;
  }
}

function isInsideDndWindow(params: {
  enabled: boolean;
  start: string;
  end: string;
  weekendsOnly: boolean;
  timeZone?: string;
  now?: Date;
}): boolean {
  if (!params.enabled) return false;
  const now = params.now ?? new Date();
  const tz = params.timeZone?.trim() || process.env.APP_TIMEZONE?.trim() || "Europe/Paris";
  const tzParts = getTimePartsInTimeZone(now, tz);
  const dayOfWeek = tzParts ? tzParts.day : now.getDay();
  const currentMinutes = tzParts ? tzParts.minutes : now.getHours() * 60 + now.getMinutes();
  if (params.weekendsOnly) {
    if (dayOfWeek !== 0 && dayOfWeek !== 6) return false;
  }
  const startMin = parseMinutes(params.start);
  const endMin = parseMinutes(params.end);
  if (startMin === null || endMin === null) return false;
  if (startMin === endMin) return true;
  if (startMin < endMin) {
    return currentMinutes >= startMin && currentMinutes < endMin;
  }
  return currentMinutes >= startMin || currentMinutes < endMin;
}

function buildPushCopy(type: string, message: string, locale: AppLocale): { title: string; body: string; tag: string } {
  const taskName = extractQuotedTaskName(message);
  const lower = message.toLowerCase();
  const isEn = locale === "en";
  let title = pickByIsEn(isEn, "Mise à jour d'équipe", "Team update");
  let body = normalizeBody(message);
  let tag = `notif-${type.toLowerCase()}`;

  if (type === "TASK_ASSIGNED") {
    title = pickByIsEn(isEn, "Nouvelle tâche assignée", "New task assigned");
    body = taskName
      ? (pickByIsEn(isEn, `“${taskName}” vous est attribuée.`, `“${taskName}” has been assigned to you.`))
      : (pickByIsEn(isEn, "Une tâche vous a été attribuée.", "A task has been assigned to you."));
    tag = taskName ? `task-assigned-${toTagPart(taskName)}` : "task-assigned";
  } else if (type === "COMMENT_ADDED") {
    title = pickByIsEn(isEn, "Nouveau commentaire", "New comment");
    body = taskName
      ? (pickByIsEn(isEn, `Un commentaire a été ajouté sur “${taskName}”.`, `A comment was added on “${taskName}”.`))
      : (pickByIsEn(isEn, "Un commentaire a été ajouté.", "A comment was added."));
    tag = taskName ? `comment-${toTagPart(taskName)}` : "comment";
  } else if (type === "MENTIONED") {
    title = pickByIsEn(isEn, "Nouveau commentaire", "New comment");
    body = taskName
      ? (pickByIsEn(isEn, `Vous avez été mentionné sur “${taskName}”.`, `You were mentioned on “${taskName}”.`))
      : (pickByIsEn(isEn, "Vous avez été mentionné dans un commentaire.", "You were mentioned in a comment."));
    tag = taskName ? `mention-${toTagPart(taskName)}` : "mention";
  } else if (type === "DUE_DATE_SOON") {
    if (lower.includes("aujourd") || lower.includes("today")) title = pickByIsEn(isEn, "Échéance aujourd'hui", "Due today");
    else if (lower.includes("dans 1 jour") || lower.includes("demain") || lower.includes("in 1 day") || lower.includes("tomorrow")) title = pickByIsEn(isEn, "À rendre demain", "Due tomorrow");
    else title = pickByIsEn(isEn, "Échéance proche", "Due soon");
    body = taskName
      ? (pickByIsEn(isEn, `“${taskName}” arrive bientôt à échéance.`, `“${taskName}” is due soon.`))
      : normalizeBody(message);
    tag = taskName ? `due-${toTagPart(taskName)}` : "due-soon";
  } else if (type === "OVERDUE") {
    title = pickByIsEn(isEn, "Échéance dépassée", "Past due");
    body = taskName
      ? (pickByIsEn(isEn, `“${taskName}” n'a pas été finalisée à temps.`, `“${taskName}” was not completed on time.`))
      : (pickByIsEn(isEn, "Une tâche dépasse sa date d'échéance.", "A task is past due."));
    tag = taskName ? `overdue-${toTagPart(taskName)}` : "overdue";
  } else if (type === "DAILY_SUMMARY") {
    title = pickByIsEn(isEn, "Point du matin", "Morning brief");
    body = message.trim();
    tag = "daily-summary";
  } else if (type === "AUTOMATION") {
    title = pickByIsEn(isEn, "Mise à jour d'équipe", "Team update");
    body = taskName
      ? (pickByIsEn(isEn, `“${taskName}” a été mise à jour automatiquement.`, `“${taskName}” was updated automatically.`))
      : (pickByIsEn(isEn, "Une automatisation a modifié une tâche.", "An automation updated a task."));
    tag = taskName ? `automation-${toTagPart(taskName)}` : "automation";
  } else if (type === "INVITATION") {
    title = pickByIsEn(isEn, "Nouvelle activité", "New activity");
    body = normalizeBody(message);
    tag = "invitation";
  }

  if (type === "DAILY_SUMMARY") {
    return { title, body, tag };
  }

  return {
    title: clampText(title, 40),
    body: clampText(body, 110),
    tag,
  };
}

function notificationEmailHtml(params: {
  locale: AppLocale;
  title: string;
  body: string;
  actionUrl: string;
}): string {
  const isEn = params.locale === "en";
  const bodyHtml = params.body.replace(/\n/g, "<br/>");
  return `<!DOCTYPE html>
<html lang="${params.locale}">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:system-ui,-apple-system,sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb;">
    <div style="padding:18px 22px;border-bottom:1px solid #f1f5f9;">
      <p style="margin:0;font-size:12px;letter-spacing:.04em;color:#6b7280;text-transform:uppercase;">Task App</p>
      <h1 style="margin:8px 0 0;color:#111827;font-size:20px;line-height:1.3;">${params.title}</h1>
    </div>
    <div style="padding:22px;">
      <p style="margin:0 0 18px;color:#374151;font-size:15px;line-height:1.6;">${bodyHtml}</p>
      <a href="${params.actionUrl}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:10px 16px;border-radius:10px;font-size:14px;font-weight:600;">${pickByIsEn(isEn, "Ouvrir Task App", "Open Task App")}</a>
    </div>
  </div>
</body>
</html>`;
}

function resolveAppUrl(): string {
  const candidates = [
    process.env.APP_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXTAUTH_URL,
  ]
    .map((v) => (v ?? "").trim())
    .filter(Boolean);

  for (const candidate of candidates) {
    try {
      const url = new URL(candidate);
      if (!/^https?:$/.test(url.protocol)) continue;
      // Avoid unusable URLs in emails on production devices.
      if (["localhost", "127.0.0.1", "::1"].includes(url.hostname)) continue;
      return url.origin;
    } catch {
      // try next candidate
    }
  }

  for (const candidate of candidates) {
    try {
      const url = new URL(candidate);
      if (/^https?:$/.test(url.protocol)) return url.origin;
    } catch {
      // ignore invalid
    }
  }

  return "http://localhost:3000";
}

function getNotificationUrl(params: {
  type: string;
  taskId?: string;
  projectId?: string;
}): string {
  const { type, taskId, projectId } = params;
  if (projectId && taskId) {
    const base = `/projects/${projectId}?taskId=${encodeURIComponent(taskId)}`;
    if (type === "COMMENT_ADDED" || type === "MENTIONED") {
      return `${base}&focus=comments`;
    }
    return base;
  }
  if (projectId) return `/projects/${projectId}`;
  if (type === "INVITATION") return "/";
  if (type === "DAILY_SUMMARY") return "/";
  return "/";
}

function isDailySummaryText(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("tâches à suivre") || normalized.includes("tasks to follow");
}

async function retry<T>(fn: () => Promise<T>, attempts = 2): Promise<T> {
  let lastError: unknown = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 200 * (i + 1)));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

let deliveryLogTableEnsured = false;
async function ensureNotificationDeliveryLogTable(): Promise<void> {
  if (deliveryLogTableEnsured) return;
  await prisma.$executeRawUnsafe(
    `CREATE TABLE IF NOT EXISTS "NotificationDeliveryLog" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "notificationId" TEXT,
      "userId" TEXT NOT NULL,
      "type" TEXT NOT NULL,
      "channel" TEXT NOT NULL,
      "status" TEXT NOT NULL,
      "reason" TEXT,
      "taskId" TEXT,
      "projectId" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "NotificationDeliveryLog_userId_createdAt_idx"
     ON "NotificationDeliveryLog"("userId","createdAt")`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "NotificationDeliveryLog_notificationId_idx"
     ON "NotificationDeliveryLog"("notificationId")`
  );
  deliveryLogTableEnsured = true;
}

async function logDelivery(params: {
  notificationId?: string | null;
  userId: string;
  type: string;
  channel: "PUSH" | "EMAIL";
  status: "SENT" | "FAILED" | "SKIPPED";
  reason?: string | null;
  taskId?: string | null;
  projectId?: string | null;
}): Promise<void> {
  try {
    await ensureNotificationDeliveryLogTable();
    await prisma.$executeRawUnsafe(
      `INSERT INTO "NotificationDeliveryLog"
       ("id","notificationId","userId","type","channel","status","reason","taskId","projectId","createdAt")
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      crypto.randomUUID(),
      params.notificationId ?? null,
      params.userId,
      params.type,
      params.channel,
      params.status,
      params.reason ?? null,
      params.taskId ?? null,
      params.projectId ?? null
    );
  } catch {
    // non-blocking
  }
}

/** Throws 401 if no session; returns the current user id */
export async function getAuthUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated.");
  return session.user.id;
}

export async function isSuperAdminSession(): Promise<boolean> {
  const session = await auth();
  const user = session?.user as { id?: string; isSuperAdmin?: boolean } | undefined;
  return Boolean(user?.isSuperAdmin) || isSuperAdminUserId(user?.id);
}

/** Current user must be at least MEMBER of projectId */
export async function requireMember(projectId: string): Promise<string> {
  const session = await auth();
  const user = session?.user as { id?: string; isSuperAdmin?: boolean } | undefined;
  const userId = user?.id;
  if (!userId) throw new Error("Not authenticated.");
  if (user.isSuperAdmin || isSuperAdminUserId(userId)) return userId;
  const m = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (!m) throw new Error("Access denied.");
  return userId;
}

/** Current user must be ADMIN of projectId */
export async function requireAdmin(projectId: string): Promise<string> {
  const session = await auth();
  const user = session?.user as { id?: string; isSuperAdmin?: boolean } | undefined;
  const userId = user?.id;
  if (!userId) throw new Error("Not authenticated.");
  if (user.isSuperAdmin || isSuperAdminUserId(userId)) return userId;
  const m = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (!m || m.role !== "ADMIN") throw new Error("Administrator rights required.");
  return userId;
}

/** Resolve projectId from a groupId (1 extra query) */
export async function projectIdFromGroup(groupId: string): Promise<string> {
  const g = await prisma.group.findUnique({ where: { id: groupId } });
  if (!g) throw new Error("Group not found.");
  return g.projectId;
}

/** Resolve projectId from a taskId (1 extra query) */
export async function projectIdFromTask(taskId: string): Promise<string> {
  const t = await prisma.task.findUnique({ where: { id: taskId }, include: { group: true } });
  if (!t) throw new Error("Task not found.");
  return t.group.projectId;
}

/** Activity log helper — non-blocking */
export async function logActivity(taskId: string, action: string, actor = "System", details?: object) {
  try {
    await prisma.activityLog.create({
      data: { taskId, action, actor, details: details ? JSON.stringify(details) : null },
    });
  } catch {
    // Non-blocking — never fail a mutation because of logging
  }
}

export function emitProjectChanged(projectId: string, taskId?: string) {
  publishRealtimeEvent({
    type: "PROJECT_CHANGED",
    scope: `project:${projectId}`,
    projectId,
    taskId,
  });
}

export function emitTaskChanged(projectId: string, taskId: string) {
  publishRealtimeEvent({
    type: "TASK_CHANGED",
    scope: `project:${projectId}`,
    projectId,
    taskId,
  });
}

export function emitArchiveChanged(projectId: string, taskId?: string) {
  publishRealtimeEvent({
    type: "ARCHIVE_CHANGED",
    scope: `project:${projectId}`,
    projectId,
    taskId,
  });
}

export function emitNotificationChanged(userId: string, projectId?: string) {
  publishRealtimeEvent({
    type: "NOTIFICATION_CHANGED",
    scope: `user:${userId}`,
    userId,
    projectId,
  });
}

export function emitProfileChanged(userId: string) {
  publishRealtimeEvent({
    type: "PROFILE_CHANGED",
    scope: `user:${userId}`,
    userId,
  });
}

export function emitPreferencesChanged(userId: string) {
  publishRealtimeEvent({
    type: "PREFERENCES_CHANGED",
    scope: `user:${userId}`,
    userId,
  });
}

export function emitAdminDataChanged() {
  publishRealtimeEvent({
    type: "ADMIN_DATA_CHANGED",
    scope: "global:admin",
  });
}

/** Notify a user — non-blocking, respects preferences */
export async function notifyUser(
  userId: string,
  type: string,
  message: string,
  taskId?: string,
  projectId?: string
) {
  try {
    if (message.trim().length === 0) return;
    let effectiveProjectId = projectId;
    if (!effectiveProjectId && taskId) {
      const taskRow = await prisma.task.findUnique({
        where: { id: taskId },
        select: { group: { select: { projectId: true } } },
      });
      effectiveProjectId = taskRow?.group.projectId ?? undefined;
    }
    const locale = await getUserLocale(userId);
    const pref = await prisma.userNotificationPreference.findUnique({
      where: { userId_type: { userId, type } },
    });
    if (pref && !pref.enabled) return;

    const recentDuplicate = await prisma.notification.findFirst({
      where: {
        userId,
        type,
        taskId: taskId ?? null,
        projectId: effectiveProjectId ?? null,
        message,
        createdAt: { gte: new Date(Date.now() - 30_000) },
      },
      select: { id: true },
      orderBy: { createdAt: "desc" },
    });
    if (recentDuplicate) return;

    const copy = buildPushCopy(type, message, locale);
    const notificationMessage = type === "DAILY_SUMMARY"
      ? message
      : copy.body;

    const notification = await prisma.notification.create({
      data: { userId, type, message: notificationMessage, taskId: taskId ?? null, projectId: effectiveProjectId ?? null },
    });
    emitNotificationChanged(userId, effectiveProjectId);
    if (effectiveProjectId) {
      emitProjectChanged(effectiveProjectId, taskId);
    }

    let settings: {
      pushEnabled: boolean;
      emailEnabled: boolean;
      dndEnabled: boolean;
      dndStart: string;
      dndEnd: string;
      dndWeekendsOnly: boolean;
    } | null = null;
    try {
      const settingsRows = await prisma.$queryRawUnsafe<Array<{
        pushEnabled: boolean;
        emailEnabled: boolean;
        dndEnabled: boolean;
        dndStart: string;
        dndEnd: string;
        dndWeekendsOnly: boolean;
      }>>(
        `SELECT "pushEnabled","emailEnabled","dndEnabled","dndStart","dndEnd","dndWeekendsOnly"
         FROM "UserNotificationSettings"
         WHERE "userId" = ?
         LIMIT 1`,
        userId
      );
      settings = settingsRows[0] ?? null;
    } catch {
      settings = null;
    }
    const dndActive = settings
      ? isInsideDndWindow({
          enabled: settings.dndEnabled,
          start: settings.dndStart,
          end: settings.dndEnd,
          weekendsOnly: settings.dndWeekendsOnly,
        })
      : false;

    const url = getNotificationUrl({ type, projectId: effectiveProjectId, taskId });
    const pushEnabled = settings?.pushEnabled ?? true;
    const emailEnabled = settings?.emailEnabled ?? false;

    if (dndActive) {
      await logDelivery({
        notificationId: notification.id,
        userId,
        type,
        channel: "PUSH",
        status: "SKIPPED",
        reason: "DND_ACTIVE",
        taskId,
        projectId: effectiveProjectId,
      });
    } else if (!pushEnabled) {
      await logDelivery({
        notificationId: notification.id,
        userId,
        type,
        channel: "PUSH",
        status: "SKIPPED",
        reason: "PUSH_DISABLED",
        taskId,
        projectId: effectiveProjectId,
      });
    } else {
      try {
        const pushResult = await retry(
          () =>
            sendWebPushToUser({
              userId,
              title: copy.title,
              body: copy.body,
              url,
              tag: taskId ? `${copy.tag}-${taskId}` : copy.tag,
            }),
          2
        );
        if (pushResult.total === 0) {
          await logDelivery({
            notificationId: notification.id,
            userId,
            type,
            channel: "PUSH",
            status: "SKIPPED",
            reason: "NO_SUBSCRIPTION",
            taskId,
            projectId: effectiveProjectId,
          });
        } else if (pushResult.sent > 0) {
          await logDelivery({
            notificationId: notification.id,
            userId,
            type,
            channel: "PUSH",
            status: "SENT",
            reason: `sent=${pushResult.sent},failed=${pushResult.failed}`,
            taskId,
            projectId: effectiveProjectId,
          });
        } else {
          await logDelivery({
            notificationId: notification.id,
            userId,
            type,
            channel: "PUSH",
            status: "FAILED",
            reason: pushResult.errors[0] ?? "PUSH_SEND_FAILED",
            taskId,
            projectId: effectiveProjectId,
          });
        }
      } catch (error) {
        await logDelivery({
          notificationId: notification.id,
          userId,
          type,
          channel: "PUSH",
          status: "FAILED",
          reason: error instanceof Error ? error.message : String(error),
          taskId,
          projectId: effectiveProjectId,
        });
      }
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (!user?.email) {
      await logDelivery({
        notificationId: notification.id,
        userId,
        type,
        channel: "EMAIL",
        status: "SKIPPED",
        reason: "NO_EMAIL",
        taskId,
        projectId: effectiveProjectId,
      });
      return;
    }

    if (dndActive) {
      await logDelivery({
        notificationId: notification.id,
        userId,
        type,
        channel: "EMAIL",
        status: "SKIPPED",
        reason: "DND_ACTIVE",
        taskId,
        projectId: effectiveProjectId,
      });
      return;
    }

    if (!emailEnabled) {
      await logDelivery({
        notificationId: notification.id,
        userId,
        type,
        channel: "EMAIL",
        status: "SKIPPED",
        reason: "EMAIL_DISABLED",
        taskId,
        projectId: effectiveProjectId,
      });
      return;
    }

    try {
      const actionUrl = new URL(url, resolveAppUrl()).toString();
      const emailBody = type === "DAILY_SUMMARY" || isDailySummaryText(message)
        ? message
        : copy.body;
      await retry(
        () =>
          sendMail({
            to: user.email,
            subject: `[Task App] ${copy.title}`,
            html: notificationEmailHtml({
              locale,
              title: copy.title,
              body: emailBody,
              actionUrl,
            }),
            text: `${copy.title}\n\n${emailBody}\n\n${actionUrl}`,
          }),
        2
      );
      await logDelivery({
        notificationId: notification.id,
        userId,
        type,
        channel: "EMAIL",
        status: "SENT",
        taskId,
        projectId: effectiveProjectId,
      });
    } catch (error) {
      await logDelivery({
        notificationId: notification.id,
        userId,
        type,
        channel: "EMAIL",
        status: "FAILED",
        reason: error instanceof Error ? error.message : String(error),
        taskId,
        projectId: effectiveProjectId,
      });
    }
  } catch {
    // notifications are non-critical
  }
}

export async function getNotificationDeliveryLog(limit = 200) {
  await ensureNotificationDeliveryLogTable();
  const rows = await prisma.$queryRawUnsafe<Array<{
    id: string;
    notificationId: string | null;
    userId: string;
    type: string;
    channel: string;
    status: string;
    reason: string | null;
    taskId: string | null;
    projectId: string | null;
    createdAt: string;
  }>>(
    `SELECT "id","notificationId","userId","type","channel","status","reason","taskId","projectId","createdAt"
     FROM "NotificationDeliveryLog"
     ORDER BY "createdAt" DESC
     LIMIT ?`,
    Math.max(1, Math.min(1000, Math.floor(limit)))
  );
  return rows;
}

/** Find a project member by display name */
export async function findUserByNameInProject(projectId: string, name: string) {
  const member = await prisma.projectMember.findFirst({
    where: { projectId, user: { name } },
    include: { user: true },
  });
  return member?.user ?? null;
}

/** Resolve an OWNER field value to a member user (supports userId and legacy display-name values). */
export async function findUserByOwnerValueInProject(projectId: string, ownerValue: string) {
  const normalized = ownerValue.trim();
  if (!normalized) return null;

  const byId = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: normalized } },
    include: { user: true },
  });
  if (byId?.user) return byId.user;

  return findUserByNameInProject(projectId, normalized);
}
