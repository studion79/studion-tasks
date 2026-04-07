import { access, mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import sharp from "sharp";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { isSuperAdminUserId } from "@/lib/super-admin";
import { getRequestLocale } from "@/lib/i18n/server";
import { publishRealtimeEvent } from "@/lib/realtime";

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]);
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20MB

function projectAvatarFilename(projectId: string) {
  return `project-${projectId}.jpg`;
}

function projectAvatarStaticUrl(projectId: string, ts: number) {
  return `/uploads/avatars/${projectAvatarFilename(projectId)}?t=${ts}`;
}

function projectAvatarApiUrl(projectId: string, ts: number) {
  return `/api/projects/${projectId}/avatar?t=${ts}`;
}

async function resolveReadableAvatarPath(projectId: string, avatarInDb: string | null) {
  const candidates: string[] = [];

  const newStaticPath = path.resolve(process.cwd(), "public/uploads/avatars", projectAvatarFilename(projectId));
  candidates.push(newStaticPath);

  const legacyStaticPath = path.resolve(process.cwd(), "public/uploads/avatars/projects", `${projectId}.jpg`);
  candidates.push(legacyStaticPath);

  if (avatarInDb && avatarInDb.startsWith("/uploads/")) {
    const clean = avatarInDb.split("?")[0] ?? avatarInDb;
    const fromDbPath = path.resolve(process.cwd(), "public", clean.replace(/^\/+/, ""));
    candidates.push(fromDbPath);
  }

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // continue
    }
  }

  return null;
}

async function ensureCanManageProject(userId: string, projectId: string, isSuperAdmin: boolean) {
  if (isSuperAdmin) return true;
  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  return Boolean(member && member.role === "ADMIN");
}

async function ensureCanReadProject(userId: string, projectId: string, isSuperAdmin: boolean) {
  if (isSuperAdmin) return true;
  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  return Boolean(member);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const locale = getRequestLocale(request);
  const isEn = locale === "en";
  try {
    const session = await auth();
    const user = session?.user as { id?: string; isSuperAdmin?: boolean } | undefined;
    const userId = user?.id;
    if (!userId) {
      return NextResponse.json({ ok: false, error: isEn ? "Not authenticated." : "Non authentifié" }, { status: 401 });
    }

    const { id: projectId } = await context.params;
    const isGlobalAdmin = Boolean(user?.isSuperAdmin) || isSuperAdminUserId(userId);
    const canRead = await ensureCanReadProject(userId, projectId, isGlobalAdmin);
    if (!canRead) {
      return NextResponse.json({ ok: false, error: isEn ? "Access denied." : "Accès refusé" }, { status: 403 });
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { avatar: true },
    });

    if (!project) {
      return NextResponse.json({ ok: false, error: isEn ? "Project not found." : "Projet introuvable" }, { status: 404 });
    }

    const resolvedPath = await resolveReadableAvatarPath(projectId, project.avatar);
    if (!resolvedPath) {
      return NextResponse.json({ ok: false, error: isEn ? "Project avatar not found. Please upload it again." : "Avatar projet introuvable, veuillez le recharger." }, { status: 404 });
    }

    const buffer = await readFile(resolvedPath);
    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Project avatar fetch failed:", error);
    return NextResponse.json({ ok: false, error: isEn ? "Error while reading project avatar." : "Erreur de lecture avatar" }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const locale = getRequestLocale(request);
  const isEn = locale === "en";
  try {
    const session = await auth();
    const user = session?.user as { id?: string; isSuperAdmin?: boolean } | undefined;
    const userId = user?.id;
    if (!userId) {
      return NextResponse.json({ ok: false, error: isEn ? "Not authenticated." : "Non authentifié" }, { status: 401 });
    }

    const { id: projectId } = await context.params;
    const isGlobalAdmin = Boolean(user?.isSuperAdmin) || isSuperAdminUserId(userId);
    const canManage = await ensureCanManageProject(userId, projectId, isGlobalAdmin);
    if (!canManage) {
      return NextResponse.json({ ok: false, error: isEn ? "Administrator rights required." : "Droits administrateur requis" }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get("avatar");
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ ok: false, error: isEn ? "No file provided." : "Aucun fichier fourni" }, { status: 400 });
    }
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      return NextResponse.json(
        { ok: false, error: isEn ? "Unsupported format. Use JPG, PNG, WebP, GIF or AVIF." : "Format non supporté. Utilisez JPG, PNG, WebP, GIF ou AVIF." },
        { status: 400 }
      );
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { ok: false, error: isEn ? "Image too large (maximum 20MB)." : "Image trop volumineuse (maximum 20MB)." },
        { status: 413 }
      );
    }

    const dir = path.resolve(process.cwd(), "public/uploads/avatars");
    await mkdir(dir, { recursive: true });

    const filename = projectAvatarFilename(projectId);
    const inputBuffer = Buffer.from(await file.arrayBuffer());
    const compressed = await sharp(inputBuffer)
      .resize(512, 512, { fit: "cover", position: "centre" })
      .jpeg({ quality: 84, progressive: true })
      .toBuffer();

    await writeFile(path.join(dir, filename), compressed);

    const ts = Date.now();
    // Keep static URL in DB for compatibility with existing list views,
    // but API URL is returned to UI to ensure robust serving/fallback.
    await prisma.project.update({
      where: { id: projectId },
      data: { avatar: projectAvatarStaticUrl(projectId, ts) },
    });
    publishRealtimeEvent({
      type: "PROJECT_CHANGED",
      scope: `project:${projectId}`,
      projectId,
    });

    return NextResponse.json({ ok: true, url: projectAvatarApiUrl(projectId, ts) });
  } catch (error) {
    console.error("Project avatar upload failed:", error);
    return NextResponse.json(
      { ok: false, error: isEn ? "Unable to process this image. Try JPG, PNG or WebP." : "Impossible de traiter cette image. Essayez une image JPG, PNG ou WebP." },
      { status: 500 }
    );
  }
}
