"use server";

import { writeFile, mkdir } from "fs/promises";
import path from "path";
import bcrypt from "bcryptjs";
import sharp from "sharp";
import { prisma, revalidatePath, getAuthUserId } from "./_helpers";

const ALLOWED_AVATAR_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]);
const MAX_AVATAR_UPLOAD_BYTES = 20 * 1024 * 1024; // 20MB

export async function getMyTasks() {
  const userId = await getAuthUserId();

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  if (!user) throw new Error("Utilisateur introuvable");

  const tasks = await prisma.task.findMany({
    where: {
      archivedAt: null,
      fieldValues: {
        some: {
          value: user.name,
          column: { type: "OWNER" },
        },
      },
      group: {
        project: {
          members: { some: { userId } },
        },
      },
    },
    include: {
      fieldValues: { include: { column: true } },
      group: {
        include: {
          project: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: [{ completedAt: "asc" }, { createdAt: "desc" }],
  });

  return tasks.map((task) => {
    const getField = (type: string) =>
      task.fieldValues.find((fv) => fv.column.type === type)?.value ?? null;
    return {
      id: task.id,
      title: task.title,
      completedAt: task.completedAt?.toISOString() ?? null,
      parentId: task.parentId ?? null,
      projectId: task.group.project.id,
      projectName: task.group.project.name,
      groupName: task.group.name,
      status: getField("STATUS"),
      priority: getField("PRIORITY"),
      dueDate: getField("DUE_DATE"),
    };
  });
}

export async function getMyProjects() {
  const userId = await getAuthUserId();
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  if (!user) throw new Error("Utilisateur introuvable");

  const memberships = await prisma.projectMember.findMany({
    where: { userId },
    include: {
      project: {
        include: {
          _count: { select: { members: true } },
          groups: {
            include: {
              tasks: {
                where: { archivedAt: null, parentId: null },
                select: {
                  id: true,
                  completedAt: true,
                  fieldValues: {
                    where: { column: { type: "OWNER" } },
                    select: { value: true },
                  },
                },
              },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return memberships.map((m) => {
    const allTasks = m.project.groups.flatMap((g) => g.tasks);
    const myTaskCount = allTasks.filter((t) =>
      t.fieldValues.some((fv) => fv.value === user.name)
    ).length;
    const completedCount = allTasks.filter((t) => t.completedAt).length;
    return {
      id: m.project.id,
      name: m.project.name,
      role: m.role as "ADMIN" | "MEMBER",
      memberCount: m.project._count.members,
      totalTaskCount: allTasks.length,
      myTaskCount,
      completedCount,
    };
  });
}

export async function updateMyProfile(name: string) {
  const userId = await getAuthUserId();
  if (!name.trim()) throw new Error("Le nom ne peut pas être vide");
  await prisma.user.update({ where: { id: userId }, data: { name: name.trim() } });
  revalidatePath("/me");
}

export async function updateMyPassword(currentPassword: string, newPassword: string) {
  const userId = await getAuthUserId();
  if (newPassword.length < 8) throw new Error("Le mot de passe doit faire au moins 8 caractères");
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("Utilisateur introuvable");
  const valid = await bcrypt.compare(currentPassword, user.password);
  if (!valid) throw new Error("Mot de passe actuel incorrect");
  const hashed = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: userId }, data: { password: hashed } });
}

export async function updateMyAvatar(formData: FormData) {
  const userId = await getAuthUserId();
  const file = formData.get("avatar");

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false as const, error: "Aucun fichier fourni" };
  }
  if (!ALLOWED_AVATAR_TYPES.has(file.type)) {
    return {
      ok: false as const,
      error: "Format non supporté. Utilisez JPG, PNG, WebP, GIF ou AVIF.",
    };
  }
  if (file.size > MAX_AVATAR_UPLOAD_BYTES) {
    return { ok: false as const, error: "Image trop volumineuse (maximum 20MB)." };
  }

  try {
    const dir = path.resolve(process.cwd(), "public/uploads/avatars");
    await mkdir(dir, { recursive: true });

    // Always save as JPEG for consistency
    const filename = `${userId}.jpg`;
    const inputBuffer = Buffer.from(await file.arrayBuffer());

    // Compress & resize: max 256×256, JPEG quality 82, strip metadata
    const compressed = await sharp(inputBuffer)
      .resize(256, 256, { fit: "cover", position: "centre" })
      .jpeg({ quality: 82, progressive: true })
      .toBuffer();

    await writeFile(path.join(dir, filename), compressed);

    const avatarUrl = `/uploads/avatars/${filename}?t=${Date.now()}`;
    await prisma.user.update({ where: { id: userId }, data: { avatar: avatarUrl } });
    revalidatePath("/me");
    return { ok: true as const, url: avatarUrl };
  } catch (error) {
    console.error("updateMyAvatar failed:", error);
    return {
      ok: false as const,
      error: "Impossible de traiter cette image. Essayez une image JPG, PNG ou WebP.",
    };
  }
}

export async function toggleMyTask(taskId: string) {
  const userId = await getAuthUserId();

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      group: {
        include: {
          project: {
            include: {
              columns: { where: { type: "STATUS", isActive: true } },
              members: { where: { userId }, select: { id: true } },
            },
          },
        },
      },
    },
  });

  if (!task) throw new Error("Tâche introuvable");
  if (!task.group.project.members.length) throw new Error("Accès refusé");

  const nowDone = !task.completedAt;
  await prisma.task.update({ where: { id: taskId }, data: { completedAt: nowDone ? new Date() : null } });

  // Sync STATUS field if a STATUS column exists for this project
  const statusCol = task.group.project.columns[0];
  if (statusCol) {
    await prisma.taskFieldValue.upsert({
      where: { taskId_columnId: { taskId, columnId: statusCol.id } },
      create: { taskId, columnId: statusCol.id, value: nowDone ? "Done" : "Not started" },
      update: { value: nowDone ? "Done" : "Not started" },
    });
  }
}
