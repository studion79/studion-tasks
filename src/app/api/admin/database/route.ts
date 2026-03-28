import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { isSuperAdminUserId } from "@/lib/super-admin";
import { resolveDatabaseFilePath } from "@/lib/admin-db";
import { mkdir, readFile, rename, stat, unlink, writeFile } from "fs/promises";
import path from "path";

type SessionUser = { id?: string; isSuperAdmin?: boolean };

function isAllowed(user: SessionUser | undefined): boolean {
  return Boolean(user?.isSuperAdmin) || isSuperAdminUserId(user?.id);
}

function hasSqliteHeader(buffer: Buffer): boolean {
  if (buffer.length < 16) return false;
  return buffer.subarray(0, 16).toString("ascii") === "SQLite format 3\u0000";
}

export async function GET() {
  const session = await auth();
  const user = session?.user as SessionUser | undefined;
  if (!isAllowed(user)) {
    return new Response("Accès refusé", { status: 403 });
  }

  const dbPath = resolveDatabaseFilePath();
  const content = await readFile(dbPath);
  const date = new Date().toISOString().slice(0, 10);
  const filename = `task-app-db-${date}.db`;

  return new Response(content, {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(request: Request) {
  const session = await auth();
  const user = session?.user as SessionUser | undefined;
  if (!isAllowed(user)) {
    return Response.json({ ok: false, error: "Accès refusé" }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("database");
  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ ok: false, error: "Aucun fichier fourni" }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (!hasSqliteHeader(bytes)) {
    return Response.json({ ok: false, error: "Fichier invalide: base SQLite attendue (.db)." }, { status: 400 });
  }

  const dbPath = resolveDatabaseFilePath();
  const dbDir = path.dirname(dbPath);
  await mkdir(dbDir, { recursive: true });

  const stamp = Date.now();
  const backupPath = `${dbPath}.backup-${stamp}`;
  const tempPath = `${dbPath}.import-${stamp}.tmp`;

  // Close Prisma before filesystem swap to avoid locked file issues.
  await prisma.$disconnect().catch(() => {});

  await writeFile(tempPath, bytes);
  const imported = await stat(tempPath);
  if (imported.size === 0) {
    await unlink(tempPath).catch(() => {});
    return Response.json({ ok: false, error: "La base importée est vide." }, { status: 400 });
  }

  try {
    await rename(dbPath, backupPath);
  } catch (error) {
    const e = error as NodeJS.ErrnoException;
    if (e.code !== "ENOENT") {
      await unlink(tempPath).catch(() => {});
      throw error;
    }
  }
  await rename(tempPath, dbPath);

  // Reconnect eagerly so next requests use the imported DB.
  await prisma.$connect().catch(() => {});

  return Response.json({
    ok: true,
    message: "Base importée avec succès.",
    backupFile: path.basename(backupPath),
  });
}
