"use server";

import { writeFile, mkdir } from "fs/promises";
import path from "path";
import bcrypt from "bcryptjs";
import sharp from "sharp";
import { randomUUID } from "crypto";
import { prisma, revalidatePath, getAuthUserId, emitPreferencesChanged, emitProfileChanged, emitTaskChanged, emitArchiveChanged } from "./_helpers";
import { toCanonicalStatus } from "@/lib/status";

const ALLOWED_AVATAR_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]);
const MAX_AVATAR_UPLOAD_BYTES = 20 * 1024 * 1024; // 20MB

type DisplaySettings = {
  syncAcrossDevices: boolean;
  defaultView: "SPREADSHEET" | "KANBAN" | "CARDS" | "GANTT" | "TIMELINE" | "CALENDAR";
  density: "compact" | "comfortable";
  mondayFirst: boolean;
  dateFormat: "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD";
  language: "fr" | "en";
};

const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  syncAcrossDevices: false,
  defaultView: "SPREADSHEET",
  density: "comfortable",
  mondayFirst: true,
  dateFormat: "DD/MM/YYYY",
  language: "fr",
};

let displaySettingsTableEnsured = false;
async function ensureDisplaySettingsTable() {
  if (displaySettingsTableEnsured) return;
  await prisma.$executeRawUnsafe(
    `CREATE TABLE IF NOT EXISTS "UserDisplaySettings" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "syncAcrossDevices" BOOLEAN NOT NULL DEFAULT false,
      "defaultView" TEXT NOT NULL DEFAULT 'SPREADSHEET',
      "density" TEXT NOT NULL DEFAULT 'comfortable',
      "mondayFirst" BOOLEAN NOT NULL DEFAULT true,
      "dateFormat" TEXT NOT NULL DEFAULT 'DD/MM/YYYY',
      "language" TEXT NOT NULL DEFAULT 'fr',
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "UserDisplaySettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`
  );
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "UserDisplaySettings_userId_key" ON "UserDisplaySettings"("userId")`
  );
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "UserDisplaySettings" ADD COLUMN "syncAcrossDevices" BOOLEAN NOT NULL DEFAULT false`
    );
  } catch {
    // already exists
  }
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "UserDisplaySettings" ADD COLUMN "defaultView" TEXT NOT NULL DEFAULT 'SPREADSHEET'`
    );
  } catch {
    // already exists
  }
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "UserDisplaySettings" ADD COLUMN "density" TEXT NOT NULL DEFAULT 'comfortable'`
    );
  } catch {
    // already exists
  }
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "UserDisplaySettings" ADD COLUMN "mondayFirst" BOOLEAN NOT NULL DEFAULT true`
    );
  } catch {
    // already exists
  }
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "UserDisplaySettings" ADD COLUMN "dateFormat" TEXT NOT NULL DEFAULT 'DD/MM/YYYY'`
    );
  } catch {
    // already exists
  }
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "UserDisplaySettings" ADD COLUMN "language" TEXT NOT NULL DEFAULT 'fr'`
    );
  } catch {
    // already exists
  }
  displaySettingsTableEnsured = true;
}

function normalizeDisplaySettings(input: {
  syncAcrossDevices?: unknown;
  defaultView?: unknown;
  density?: unknown;
  mondayFirst?: unknown;
  dateFormat?: unknown;
  language?: unknown;
}): DisplaySettings {
  const defaultView = ["SPREADSHEET", "KANBAN", "CARDS", "GANTT", "TIMELINE", "CALENDAR"].includes(String(input.defaultView))
    ? (input.defaultView as DisplaySettings["defaultView"])
    : DEFAULT_DISPLAY_SETTINGS.defaultView;
  const density = input.density === "compact" ? "compact" : "comfortable";
  const mondayFirst = input.mondayFirst === undefined ? DEFAULT_DISPLAY_SETTINGS.mondayFirst : Boolean(input.mondayFirst);
  const dateFormat = ["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"].includes(String(input.dateFormat))
    ? (input.dateFormat as DisplaySettings["dateFormat"])
    : DEFAULT_DISPLAY_SETTINGS.dateFormat;
  const language = input.language === "en" ? "en" : "fr";
  const syncAcrossDevices = input.syncAcrossDevices === undefined
    ? DEFAULT_DISPLAY_SETTINGS.syncAcrossDevices
    : Boolean(input.syncAcrossDevices);

  return {
    syncAcrossDevices,
    defaultView,
    density,
    mondayFirst,
    dateFormat,
    language,
  };
}

export async function getMyDisplaySettings(): Promise<DisplaySettings> {
  const userId = await getAuthUserId();
  await ensureDisplaySettingsTable();
  const rows = await prisma.$queryRawUnsafe<Array<{
    syncAcrossDevices: boolean;
    defaultView: string;
    density: string;
    mondayFirst: boolean;
    dateFormat: string;
    language: string;
  }>>(
    `SELECT "syncAcrossDevices","defaultView","density","mondayFirst","dateFormat","language"
     FROM "UserDisplaySettings"
     WHERE "userId" = ?
     LIMIT 1`,
    userId
  );
  if (!rows[0]) return DEFAULT_DISPLAY_SETTINGS;
  return normalizeDisplaySettings(rows[0]);
}

export async function updateMyDisplaySettings(input: Partial<DisplaySettings>) {
  const userId = await getAuthUserId();
  await ensureDisplaySettingsTable();
  const normalized = normalizeDisplaySettings(input);

  await prisma.$executeRawUnsafe(
    `INSERT INTO "UserDisplaySettings"
      ("id","userId","syncAcrossDevices","defaultView","density","mondayFirst","dateFormat","language","createdAt","updatedAt")
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT("userId") DO UPDATE SET
      "syncAcrossDevices" = COALESCE(?, "syncAcrossDevices"),
      "defaultView" = COALESCE(?, "defaultView"),
      "density" = COALESCE(?, "density"),
      "mondayFirst" = COALESCE(?, "mondayFirst"),
      "dateFormat" = COALESCE(?, "dateFormat"),
      "language" = COALESCE(?, "language"),
      "updatedAt" = CURRENT_TIMESTAMP`,
    randomUUID(),
    userId,
    normalized.syncAcrossDevices,
    normalized.defaultView,
    normalized.density,
    normalized.mondayFirst,
    normalized.dateFormat,
    normalized.language,
    input.syncAcrossDevices === undefined ? null : normalized.syncAcrossDevices,
    input.defaultView === undefined ? null : normalized.defaultView,
    input.density === undefined ? null : normalized.density,
    input.mondayFirst === undefined ? null : normalized.mondayFirst,
    input.dateFormat === undefined ? null : normalized.dateFormat,
    input.language === undefined ? null : normalized.language
  );
  emitPreferencesChanged(userId);
}

export async function getMyTasks() {
  const userId = await getAuthUserId();

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  if (!user) throw new Error("Utilisateur introuvable");

  const tasks = await prisma.task.findMany({
    where: {
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
      status: toCanonicalStatus(getField("STATUS")),
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
  if (!name.trim()) throw new Error("Name cannot be empty.");
  await prisma.user.update({ where: { id: userId }, data: { name: name.trim() } });
  emitProfileChanged(userId);
  revalidatePath("/me");
}

export async function updateMyPassword(currentPassword: string, newPassword: string) {
  const userId = await getAuthUserId();
  if (newPassword.length < 8) throw new Error("Password must be at least 8 characters.");
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("User not found.");
  const valid = await bcrypt.compare(currentPassword, user.password);
  if (!valid) throw new Error("Current password is incorrect.");
  const hashed = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: userId }, data: { password: hashed } });
  emitProfileChanged(userId);
}

export async function updateMyAvatar(formData: FormData) {
  const userId = await getAuthUserId();
  const file = formData.get("avatar");

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false as const, error: "No file provided." };
  }
  if (!ALLOWED_AVATAR_TYPES.has(file.type)) {
    return {
      ok: false as const,
      error: "Unsupported format. Use JPG, PNG, WebP, GIF or AVIF.",
    };
  }
  if (file.size > MAX_AVATAR_UPLOAD_BYTES) {
    return { ok: false as const, error: "Image too large (maximum 20MB)." };
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
    emitProfileChanged(userId);
    revalidatePath("/me");
    return { ok: true as const, url: avatarUrl };
  } catch (error) {
    console.error("updateMyAvatar failed:", error);
    return {
      ok: false as const,
      error: "Unable to process this image. Try JPG, PNG or WebP.",
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

  if (!task) throw new Error("Task not found.");
  if (!task.group.project.members.length) throw new Error("Access denied.");

  const nowDone = !task.completedAt;
  await prisma.task.update({
    where: { id: taskId },
    data: {
      completedAt: nowDone ? new Date() : null,
      ...(task.parentId === null ? { archivedAt: nowDone ? new Date() : null } : {}),
    },
  });

  // Sync STATUS field if a STATUS column exists for this project
  const statusCol = task.group.project.columns[0];
  if (statusCol) {
    await prisma.taskFieldValue.upsert({
      where: { taskId_columnId: { taskId, columnId: statusCol.id } },
      create: { taskId, columnId: statusCol.id, value: nowDone ? "DONE" : "NOT_STARTED" },
      update: { value: nowDone ? "DONE" : "NOT_STARTED" },
    });
  }
  emitTaskChanged(task.group.project.id, taskId);
  emitArchiveChanged(task.group.project.id, taskId);
}
