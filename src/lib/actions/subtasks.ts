"use server";

import { prisma, requireMember, projectIdFromTask, projectIdFromGroup, emitTaskChanged } from "./_helpers";
import { upsertTaskField } from "./tasks";

export async function createSubtask(parentId: string, groupId: string, title: string) {
  const projectId = await projectIdFromGroup(groupId);
  await requireMember(projectId);
  const [count, parent] = await Promise.all([
    prisma.task.count({ where: { parentId, archivedAt: null } }),
    prisma.task.findUnique({
      where: { id: parentId },
      select: {
        id: true,
        groupId: true,
        fieldValues: {
          where: {
            column: {
              projectId,
              type: "OWNER",
            },
          },
          select: {
            columnId: true,
            value: true,
          },
          take: 1,
        },
      },
    }),
  ]);

  if (!parent || parent.groupId !== groupId) {
    throw new Error("Parent task not found.");
  }

  const inheritedOwner = parent.fieldValues[0];
  const created = await prisma.task.create({
    data: {
      groupId,
      parentId,
      title,
      position: count,
      fieldValues:
        inheritedOwner?.value && inheritedOwner.columnId
          ? {
              create: [
                {
                  columnId: inheritedOwner.columnId,
                  value: inheritedOwner.value,
                },
              ],
            }
          : undefined,
    },
    include: { fieldValues: true },
  });
  emitTaskChanged(projectId, parentId);
  return created;
}

export async function updateSubtaskTitle(subtaskId: string, title: string) {
  const projectId = await projectIdFromTask(subtaskId);
  await requireMember(projectId);
  const updated = await prisma.task.update({ where: { id: subtaskId }, data: { title } });
  emitTaskChanged(projectId, subtaskId);
  return updated;
}

export async function toggleSubtaskDone(subtaskId: string, isDone: boolean, statusColumnId: string) {
  // permission check delegated to upsertTaskField
  return upsertTaskField(subtaskId, statusColumnId, isDone ? "DONE" : "NOT_STARTED");
}

export async function deleteSubtask(subtaskId: string) {
  const projectId = await projectIdFromTask(subtaskId);
  await requireMember(projectId);
  const deleted = await prisma.task.delete({ where: { id: subtaskId } });
  emitTaskChanged(projectId, subtaskId);
  return deleted;
}
