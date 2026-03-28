"use server";

import { prisma, requireMember, projectIdFromTask, projectIdFromGroup } from "./_helpers";
import { upsertTaskField } from "./tasks";

export async function createSubtask(parentId: string, groupId: string, title: string) {
  await requireMember(await projectIdFromGroup(groupId));
  const count = await prisma.task.count({ where: { parentId, archivedAt: null } });
  return prisma.task.create({
    data: { groupId, parentId, title, position: count },
    include: { fieldValues: true },
  });
}

export async function updateSubtaskTitle(subtaskId: string, title: string) {
  await requireMember(await projectIdFromTask(subtaskId));
  return prisma.task.update({ where: { id: subtaskId }, data: { title } });
}

export async function toggleSubtaskDone(subtaskId: string, isDone: boolean, statusColumnId: string) {
  // permission check delegated to upsertTaskField
  return upsertTaskField(subtaskId, statusColumnId, isDone ? "DONE" : "NOT_STARTED");
}

export async function deleteSubtask(subtaskId: string) {
  await requireMember(await projectIdFromTask(subtaskId));
  return prisma.task.delete({ where: { id: subtaskId } });
}
