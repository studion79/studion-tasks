"use server";

import { prisma, requireMember, logActivity, notifyUser, findUserByNameInProject } from "./_helpers";

export async function getTaskComments(taskId: string) {
  return prisma.comment.findMany({
    where: { taskId },
    orderBy: { createdAt: "asc" },
  });
}

export async function createComment(taskId: string, content: string, author = "Moi") {
  // Fetch task first: permission check + notification logic
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { group: true, fieldValues: { include: { column: true } } },
  });
  if (!task) throw new Error("Tâche introuvable");
  await requireMember(task.group.projectId);

  const comment = await prisma.comment.create({ data: { taskId, content, author } });
  await logActivity(taskId, "COMMENT_ADDED", author, { preview: content.slice(0, 80) });

  // Notify task owner about new comment (if owner is a known user and not the commenter)
  {
    const ownerField = task.fieldValues.find((fv) => fv.column.type === "OWNER");
    if (ownerField?.value && ownerField.value !== author) {
      const ownerUser = await findUserByNameInProject(task.group.projectId, ownerField.value);
      if (ownerUser) {
        await notifyUser(
          ownerUser.id,
          "COMMENT_ADDED",
          `${author} a commenté sur "${task.title}"`,
          taskId,
          task.group.projectId
        );
      }
    }

    // Notify @mentioned users — match against actual member names (handles multi-word names)
    const projectMembers = await prisma.projectMember.findMany({
      where: { projectId: task.group.projectId },
      include: { user: true },
    });
    for (const member of projectMembers) {
      const name = member.user.name;
      if (!name || name === author) continue;
      if (content.includes(`@${name}`)) {
        await notifyUser(
          member.user.id,
          "MENTIONED",
          `${author} vous a mentionné dans un commentaire sur "${task.title}"`,
          taskId,
          task.group.projectId
        );
      }
    }
  }

  return comment;
}

export async function getTaskActivityLog(taskId: string) {
  return prisma.activityLog.findMany({
    where: { taskId },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
}

export async function getProjectActivityLog(projectId: string, take = 200) {
  return prisma.activityLog.findMany({
    where: { task: { group: { projectId } } },
    include: {
      task: {
        select: {
          id: true,
          title: true,
          group: { select: { name: true, color: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take,
  });
}
