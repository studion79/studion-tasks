// NO "use server" — this file only exports helpers used by other action files

import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { isSuperAdminUserId } from "@/lib/super-admin";
import { sendWebPushToUser } from "@/lib/push";
import { sendMail } from "@/lib/mailer";
import { getUserLocale } from "@/lib/i18n/server";
import type { AppLocale } from "@/i18n/config";
import { publishRealtimeEvent } from "@/lib/realtime";
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
  let title = isEn ? "Team update" : "Mise à jour d'équipe";
  let body = normalizeBody(message);
  let tag = `notif-${type.toLowerCase()}`;

  if (type === "TASK_ASSIGNED") {
    title = isEn ? "New task assigned" : "Nouvelle tâche assignée";
    body = taskName
      ? (isEn ? `“${taskName}” has been assigned to you.` : `“${taskName}” vous est attribuée.`)
      : (isEn ? "A task has been assigned to you." : "Une tâche vous a été attribuée.");
    tag = taskName ? `task-assigned-${toTagPart(taskName)}` : "task-assigned";
  } else if (type === "COMMENT_ADDED") {
    title = isEn ? "New comment" : "Nouveau commentaire";
    body = taskName
      ? (isEn ? `A comment was added on “${taskName}”.` : `Un commentaire a été ajouté sur “${taskName}”.`)
      : (isEn ? "A comment was added." : "Un commentaire a été ajouté.");
    tag = taskName ? `comment-${toTagPart(taskName)}` : "comment";
  } else if (type === "MENTIONED") {
    title = isEn ? "New comment" : "Nouveau commentaire";
    body = taskName
      ? (isEn ? `You were mentioned on “${taskName}”.` : `Vous avez été mentionné sur “${taskName}”.`)
      : (isEn ? "You were mentioned in a comment." : "Vous avez été mentionné dans un commentaire.");
    tag = taskName ? `mention-${toTagPart(taskName)}` : "mention";
  } else if (type === "DUE_DATE_SOON") {
    if (lower.includes("aujourd") || lower.includes("today")) title = isEn ? "Due today" : "Échéance aujourd'hui";
    else if (lower.includes("dans 1 jour") || lower.includes("demain") || lower.includes("in 1 day") || lower.includes("tomorrow")) title = isEn ? "Due tomorrow" : "À rendre demain";
    else title = isEn ? "Due soon" : "Échéance proche";
    body = taskName
      ? (isEn ? `“${taskName}” is due soon.` : `“${taskName}” arrive bientôt à échéance.`)
      : normalizeBody(message);
    tag = taskName ? `due-${toTagPart(taskName)}` : "due-soon";
  } else if (type === "OVERDUE") {
    title = isEn ? "Past due" : "Échéance dépassée";
    body = taskName
      ? (isEn ? `“${taskName}” was not completed on time.` : `“${taskName}” n'a pas été finalisée à temps.`)
      : (isEn ? "A task is past due." : "Une tâche dépasse sa date d'échéance.");
    tag = taskName ? `overdue-${toTagPart(taskName)}` : "overdue";
  } else if (type === "DAILY_SUMMARY") {
    title = isEn ? "Morning brief" : "Point du matin";
    body = message.trim();
    tag = "daily-summary";
  } else if (type === "AUTOMATION") {
    title = isEn ? "Team update" : "Mise à jour d'équipe";
    body = taskName
      ? (isEn ? `“${taskName}” was updated automatically.` : `“${taskName}” a été mise à jour automatiquement.`)
      : (isEn ? "An automation updated a task." : "Une automatisation a modifié une tâche.");
    tag = taskName ? `automation-${toTagPart(taskName)}` : "automation";
  } else if (type === "INVITATION") {
    title = isEn ? "New activity" : "Nouvelle activité";
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
      <a href="${params.actionUrl}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:10px 16px;border-radius:10px;font-size:14px;font-weight:600;">${isEn ? "Open Task App" : "Ouvrir Task App"}</a>
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
    const locale = await getUserLocale(userId);
    const pref = await prisma.userNotificationPreference.findUnique({
      where: { userId_type: { userId, type } },
    });
    if (pref && !pref.enabled) return;

    const copy = buildPushCopy(type, message, locale);
    const notificationMessage = type === "DAILY_SUMMARY"
      ? message
      : copy.body;

    await prisma.notification.create({
      data: { userId, type, message: notificationMessage, taskId: taskId ?? null, projectId: projectId ?? null },
    });
    emitNotificationChanged(userId, projectId);
    if (projectId) {
      emitProjectChanged(projectId, taskId);
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

    const url =
      projectId && taskId
        ? `/projects/${projectId}?taskId=${encodeURIComponent(taskId)}`
        : projectId
          ? `/projects/${projectId}`
          : "/";
    if (!dndActive && (settings?.pushEnabled ?? true)) {
      await sendWebPushToUser({
        userId,
        title: copy.title,
        body: copy.body,
        url,
        tag: taskId ? `${copy.tag}-${taskId}` : copy.tag,
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true },
    });
    if (user?.email && settings?.emailEnabled && !dndActive) {
      const actionUrl = new URL(url, resolveAppUrl()).toString();
      await sendMail({
        to: user.email,
        subject: `[Task App] ${copy.title}`,
        html: notificationEmailHtml({
          locale,
          title: copy.title,
          body: copy.body,
          actionUrl,
        }),
        text: `${copy.title}\n\n${copy.body}\n\n${actionUrl}`,
      });
    }
  } catch {
    // notifications are non-critical
  }
}

/** Find a project member by display name */
export async function findUserByNameInProject(projectId: string, name: string) {
  const member = await prisma.projectMember.findFirst({
    where: { projectId, user: { name } },
    include: { user: true },
  });
  return member?.user ?? null;
}
