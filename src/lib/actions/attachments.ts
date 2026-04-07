"use server";

import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import { prisma, requireMember, projectIdFromTask, emitTaskChanged } from "./_helpers";

export async function getTaskAttachments(taskId: string) {
  return prisma.taskAttachment.findMany({
    where: { taskId },
    orderBy: { createdAt: "asc" },
  });
}

export async function uploadTaskAttachment(taskId: string, formData: FormData) {
  const projectId = await projectIdFromTask(taskId);
  await requireMember(projectId);
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) throw new Error("Fichier manquant");

  const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
  if (file.size > MAX_SIZE) throw new Error("Fichier trop volumineux (max 10 Mo)");

  // Sanitize filename
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const uploadDir = path.join(process.cwd(), "public", "uploads", taskId);
  await mkdir(uploadDir, { recursive: true });

  const bytes = await file.arrayBuffer();
  await writeFile(path.join(uploadDir, safeName), Buffer.from(bytes));

  const attachment = await prisma.taskAttachment.create({
    data: {
      taskId,
      filename: file.name,
      filesize: file.size,
      mimetype: file.type || "application/octet-stream",
      path: `/uploads/${taskId}/${safeName}`,
    },
  });
  emitTaskChanged(projectId, taskId);
  return attachment;
}

export async function deleteTaskAttachment(id: string) {
  const attachment = await prisma.taskAttachment.findUnique({ where: { id } });
  if (!attachment) return;
  const projectId = await projectIdFromTask(attachment.taskId);
  await requireMember(projectId);
  const filePath = path.join(process.cwd(), "public", attachment.path);
  await unlink(filePath).catch(() => {});
  await prisma.taskAttachment.delete({ where: { id } });
  emitTaskChanged(projectId, attachment.taskId);
}
