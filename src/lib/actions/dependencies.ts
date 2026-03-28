"use server";

import { prisma, requireMember, projectIdFromTask } from "./_helpers";

export async function getTaskDependencies(taskId: string) {
  const [blockerDeps, blockedDeps] = await Promise.all([
    // Tasks that block this task (this task is blocked by them)
    prisma.taskDependency.findMany({
      where: { blockedId: taskId },
      include: { blocker: { select: { id: true, title: true, groupId: true, fieldValues: true } } },
    }),
    // Tasks that this task blocks
    prisma.taskDependency.findMany({
      where: { blockerId: taskId },
      include: { blocked: { select: { id: true, title: true, groupId: true, fieldValues: true } } },
    }),
  ]);
  return { blockerDeps, blockedDeps };
}

export async function addTaskDependency(blockerId: string, blockedId: string) {
  await requireMember(await projectIdFromTask(blockerId));
  if (blockerId === blockedId) throw new Error("Une tâche ne peut pas se bloquer elle-même");
  // Check for circular dependency
  const reverse = await prisma.taskDependency.findUnique({
    where: { blockerId_blockedId: { blockerId: blockedId, blockedId: blockerId } },
  });
  if (reverse) throw new Error("Dépendance circulaire détectée");
  return prisma.taskDependency.create({ data: { blockerId, blockedId } });
}

export async function removeTaskDependency(blockerId: string, blockedId: string) {
  await requireMember(await projectIdFromTask(blockerId));
  return prisma.taskDependency.deleteMany({ where: { blockerId, blockedId } });
}

export async function getProjectTasksLight(projectId: string) {
  return prisma.task.findMany({
    where: { group: { projectId }, archivedAt: null, parentId: null },
    select: { id: true, title: true, groupId: true },
    orderBy: [{ group: { position: "asc" } }, { position: "asc" }],
  });
}
