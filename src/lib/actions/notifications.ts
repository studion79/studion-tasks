"use server";

import { prisma, getAuthUserId, emitNotificationChanged, emitPreferencesChanged } from "./_helpers";
import { NOTIF_TYPES } from "@/lib/constants";
import type { NotifType } from "@/lib/constants";

export type NotificationSettings = {
  pushEnabled: boolean;
  emailEnabled: boolean;
  dndEnabled: boolean;
  dndStart: string;
  dndEnd: string;
  dndWeekendsOnly: boolean;
  dailySummaryTime: string;
};

const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  pushEnabled: true,
  emailEnabled: false,
  dndEnabled: false,
  dndStart: "22:00",
  dndEnd: "08:00",
  dndWeekendsOnly: false,
  dailySummaryTime: "08:00",
};

let settingsTableEnsured = false;
async function ensureNotificationSettingsTable(): Promise<void> {
  if (settingsTableEnsured) return;
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
    const columns = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
      `PRAGMA table_info("UserNotificationSettings")`
    );
    const hasPushEnabled = columns.some((c) => c.name === "pushEnabled");
    if (!hasPushEnabled) {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "UserNotificationSettings" ADD COLUMN "pushEnabled" BOOLEAN NOT NULL DEFAULT true`
      );
    }
    const hasDailySummaryTime = columns.some((c) => c.name === "dailySummaryTime");
    if (!hasDailySummaryTime) {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "UserNotificationSettings" ADD COLUMN "dailySummaryTime" TEXT NOT NULL DEFAULT '08:00'`
      );
    }
  } catch {
    // non-blocking
  }
  settingsTableEnsured = true;
}

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
  const notif = await prisma.notification.update({
    where: { id: notifId },
    data: { isRead: true },
    select: { userId: true },
  });
  emitNotificationChanged(notif.userId);
}

export async function markAllNotificationsRead(userId: string) {
  await prisma.notification.updateMany({ where: { userId, isRead: false }, data: { isRead: true } });
  emitNotificationChanged(userId);
}

export async function getMyNotifications() {
  const userId = await getAuthUserId();
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
}

export async function markAllMyNotificationsRead() {
  const userId = await getAuthUserId();
  await prisma.notification.updateMany({ where: { userId, isRead: false }, data: { isRead: true } });
  emitNotificationChanged(userId);
}

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
  emitPreferencesChanged(userId);
}

export async function getMyNotificationSettings(): Promise<NotificationSettings> {
  const userId = await getAuthUserId();
  await ensureNotificationSettingsTable();
  const rows = await prisma.$queryRawUnsafe<Array<{
    pushEnabled: boolean;
    emailEnabled: boolean;
    dndEnabled: boolean;
    dndStart: string;
    dndEnd: string;
    dndWeekendsOnly: boolean;
    dailySummaryTime: string;
  }>>(
    `SELECT "pushEnabled","emailEnabled","dndEnabled","dndStart","dndEnd","dndWeekendsOnly","dailySummaryTime"
     FROM "UserNotificationSettings"
     WHERE "userId" = ?
     LIMIT 1`,
    userId
  );
  const row = rows[0];
  if (!row) return DEFAULT_NOTIFICATION_SETTINGS;
  return {
    pushEnabled: row.pushEnabled,
    emailEnabled: row.emailEnabled,
    dndEnabled: row.dndEnabled,
    dndStart: row.dndStart,
    dndEnd: row.dndEnd,
    dndWeekendsOnly: row.dndWeekendsOnly,
    dailySummaryTime: row.dailySummaryTime,
  };
}

export async function updateMyNotificationSettings(input: Partial<NotificationSettings>): Promise<NotificationSettings> {
  const userId = await getAuthUserId();
  await ensureNotificationSettingsTable();
  const dndStart = typeof input.dndStart === "string" && /^\d{2}:\d{2}$/.test(input.dndStart)
    ? input.dndStart
    : DEFAULT_NOTIFICATION_SETTINGS.dndStart;
  const dndEnd = typeof input.dndEnd === "string" && /^\d{2}:\d{2}$/.test(input.dndEnd)
    ? input.dndEnd
    : DEFAULT_NOTIFICATION_SETTINGS.dndEnd;
  const dailySummaryTime = typeof input.dailySummaryTime === "string" && /^\d{2}:\d{2}$/.test(input.dailySummaryTime)
    ? input.dailySummaryTime
    : DEFAULT_NOTIFICATION_SETTINGS.dailySummaryTime;

  await prisma.$executeRawUnsafe(
    `INSERT INTO "UserNotificationSettings"
      ("id","userId","pushEnabled","emailEnabled","dndEnabled","dndStart","dndEnd","dndWeekendsOnly","dailySummaryTime","createdAt","updatedAt")
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT("userId")
     DO UPDATE SET
      "pushEnabled" = COALESCE(?, "pushEnabled"),
      "emailEnabled" = COALESCE(?, "emailEnabled"),
      "dndEnabled" = COALESCE(?, "dndEnabled"),
      "dndStart" = COALESCE(?, "dndStart"),
      "dndEnd" = COALESCE(?, "dndEnd"),
      "dndWeekendsOnly" = COALESCE(?, "dndWeekendsOnly"),
      "dailySummaryTime" = COALESCE(?, "dailySummaryTime"),
      "updatedAt" = CURRENT_TIMESTAMP`,
    crypto.randomUUID(),
    userId,
    input.pushEnabled === undefined ? DEFAULT_NOTIFICATION_SETTINGS.pushEnabled : Boolean(input.pushEnabled),
    input.emailEnabled === undefined ? DEFAULT_NOTIFICATION_SETTINGS.emailEnabled : Boolean(input.emailEnabled),
    input.dndEnabled === undefined ? DEFAULT_NOTIFICATION_SETTINGS.dndEnabled : Boolean(input.dndEnabled),
    dndStart,
    dndEnd,
    input.dndWeekendsOnly === undefined ? DEFAULT_NOTIFICATION_SETTINGS.dndWeekendsOnly : Boolean(input.dndWeekendsOnly),
    dailySummaryTime,
    input.pushEnabled === undefined ? null : Boolean(input.pushEnabled),
    input.emailEnabled === undefined ? null : Boolean(input.emailEnabled),
    input.dndEnabled === undefined ? null : Boolean(input.dndEnabled),
    input.dndStart === undefined ? null : dndStart,
    input.dndEnd === undefined ? null : dndEnd,
    input.dndWeekendsOnly === undefined ? null : Boolean(input.dndWeekendsOnly),
    input.dailySummaryTime === undefined ? null : dailySummaryTime
  );
  emitPreferencesChanged(userId);
  return getMyNotificationSettings();
}
