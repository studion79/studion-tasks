// NO "use server" — this file only exports helpers used by other action files

import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { isSuperAdminUserId } from "@/lib/super-admin";
export { revalidatePath } from "next/cache";
export { prisma };

/** Throws 401 if no session; returns the current user id */
export async function getAuthUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Non authentifié");
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
  if (!userId) throw new Error("Non authentifié");
  if (user.isSuperAdmin || isSuperAdminUserId(userId)) return userId;
  const m = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (!m) throw new Error("Accès refusé");
  return userId;
}

/** Current user must be ADMIN of projectId */
export async function requireAdmin(projectId: string): Promise<string> {
  const session = await auth();
  const user = session?.user as { id?: string; isSuperAdmin?: boolean } | undefined;
  const userId = user?.id;
  if (!userId) throw new Error("Non authentifié");
  if (user.isSuperAdmin || isSuperAdminUserId(userId)) return userId;
  const m = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (!m || m.role !== "ADMIN") throw new Error("Droits administrateur requis");
  return userId;
}

/** Resolve projectId from a groupId (1 extra query) */
export async function projectIdFromGroup(groupId: string): Promise<string> {
  const g = await prisma.group.findUnique({ where: { id: groupId } });
  if (!g) throw new Error("Groupe introuvable");
  return g.projectId;
}

/** Resolve projectId from a taskId (1 extra query) */
export async function projectIdFromTask(taskId: string): Promise<string> {
  const t = await prisma.task.findUnique({ where: { id: taskId }, include: { group: true } });
  if (!t) throw new Error("Tâche introuvable");
  return t.group.projectId;
}

/** Activity log helper — non-blocking */
export async function logActivity(taskId: string, action: string, actor = "Système", details?: object) {
  try {
    await prisma.activityLog.create({
      data: { taskId, action, actor, details: details ? JSON.stringify(details) : null },
    });
  } catch {
    // Non-blocking — never fail a mutation because of logging
  }
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

/** Find a project member by display name */
export async function findUserByNameInProject(projectId: string, name: string) {
  const member = await prisma.projectMember.findFirst({
    where: { projectId, user: { name } },
    include: { user: true },
  });
  return member?.user ?? null;
}
