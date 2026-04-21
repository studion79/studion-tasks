import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { ensurePushSubscriptionStorage, sendWebPushToUser } from "@/lib/push";
import { notifyUser } from "@/lib/actions/_helpers";
import { isSuperAdminUserId } from "@/lib/super-admin";
import { toCanonicalStatus } from "@/lib/status";
import { formatDailySummary, getRequestLocale, getUserLocale } from "@/lib/i18n/server";
import { parseTimelineValue } from "@/lib/task-schedule";
import { pickByIsEn } from "@/lib/i18n/pick";

type SessionUser = { id?: string; isSuperAdmin?: boolean };

function getTodayKeyInTimeZone(timeZone: string): string {
  const now = new Date();
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const year = parts.find((p) => p.type === "year")?.value ?? "1970";
    const month = parts.find((p) => p.type === "month")?.value ?? "01";
    const day = parts.find((p) => p.type === "day")?.value ?? "01";
    return `${year}-${month}-${day}`;
  } catch {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
}

function isAllowed(user: SessionUser | undefined): boolean {
  return Boolean(user?.isSuperAdmin) || isSuperAdminUserId(user?.id);
}

export async function GET(request: Request) {
  const locale = getRequestLocale(request);
  const isEn = locale === "en";
  const session = await auth();
  const user = session?.user as SessionUser | undefined;
  if (!isAllowed(user)) {
    return Response.json({ ok: false, error: pickByIsEn(isEn, "Accès refusé", "Access denied.") }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true },
    orderBy: [{ name: "asc" }, { email: "asc" }],
  });

  return Response.json({ ok: true, users });
}

export async function POST(request: Request) {
  const locale = getRequestLocale(request);
  const isEn = locale === "en";
  const session = await auth();
  const user = session?.user as SessionUser | undefined;
  if (!isAllowed(user)) {
    return Response.json({ ok: false, error: pickByIsEn(isEn, "Accès refusé", "Access denied.") }, { status: 403 });
  }

  await ensurePushSubscriptionStorage().catch(() => {});

  const body = (await request.json().catch(() => ({}))) as { userId?: string; mode?: "push" | "daily-summary" };
  const userId = body.userId?.trim();
  const mode = body.mode === "daily-summary" ? "daily-summary" : "push";
  if (!userId) {
    return Response.json({ ok: false, error: pickByIsEn(isEn, "Utilisateur manquant.", "Missing user.") }, { status: 400 });
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true },
  });
  if (!target) {
    return Response.json({ ok: false, error: pickByIsEn(isEn, "Utilisateur introuvable.", "User not found.") }, { status: 404 });
  }

  if (mode === "daily-summary") {
    const targetLocale = await getUserLocale(target.id);
    const tz = process.env.APP_TIMEZONE?.trim() || "Europe/Paris";
    const todayKey = getTodayKeyInTimeZone(tz);

    const tasks = await prisma.task.findMany({
      where: {
        archivedAt: null,
        parentId: null,
        fieldValues: {
          some: {
            column: { type: "OWNER" },
            OR: [{ value: target.id }, { value: target.name }],
          },
        },
        group: { project: { members: { some: { userId: target.id } } } },
      },
      include: { fieldValues: { include: { column: true } } },
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
    const message = formatDailySummary(targetLocale, {
      activeTasks: activeTasks.length,
      dueTodayCount,
      blockedCount,
      todayTasks,
    });
    await notifyUser(target.id, "DAILY_SUMMARY", message);

    return Response.json({
      ok: true,
      message: pickByIsEn(isEn, `Résumé quotidien de test envoyé à ${target.name || target.email}.`, `Test daily summary sent to ${target.name || target.email}.`),
      stats: {
        activeTasks: activeTasks.length,
        dueToday: dueTodayCount,
        blocked: blockedCount,
      },
    });
  }

  const rows = await prisma.$queryRawUnsafe<Array<{ count: number | bigint }>>(
    `SELECT COUNT(*) as count FROM "PushSubscription" WHERE "userId" = ?`,
    target.id
  ).catch(() => []);

  const subscriptionCountRaw = rows[0]?.count ?? 0;
  const subscriptionCount =
    typeof subscriptionCountRaw === "bigint"
      ? Number(subscriptionCountRaw)
      : Number(subscriptionCountRaw ?? 0);

  if (!subscriptionCount) {
    return Response.json({
      ok: false,
      error: pickByIsEn(isEn, `Aucun abonnement push trouvé pour ${target.name || target.email}.`, `No push subscription found for ${target.name || target.email}.`),
    }, { status: 400 });
  }

  const targetLocale = await getUserLocale(target.id);
  const timeLocale = targetLocale === "en" ? "en-GB" : "fr-FR";
  const sentAt = new Date().toLocaleTimeString(timeLocale);
  await sendWebPushToUser({
    userId: target.id,
    title: "Task App",
    body: targetLocale === "en"
      ? `Test notification sent by admin (${sentAt})`
      : `Notification de test envoyée par l'admin (${sentAt})`,
    url: "/",
  });

  return Response.json({
    ok: true,
    message: pickByIsEn(isEn, `Notification push de test envoyée à ${target.name || target.email}.`, `Push test notification sent to ${target.name || target.email}.`),
    subscriptionCount,
  });
}
