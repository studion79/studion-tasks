"use server";

import { prisma, getAuthUserId } from "./_helpers";
import { NOTIF_TYPES } from "@/lib/constants";
import type { NotifType } from "@/lib/constants";

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
}
