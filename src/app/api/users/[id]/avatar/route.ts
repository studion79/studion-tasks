import { access, readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getRequestLocale } from "@/lib/i18n/server";
import { pickByIsEn } from "@/lib/i18n/pick";

function userAvatarFilename(userId: string) {
  return `${userId}.jpg`;
}

async function resolveReadableAvatarPath(userId: string, avatarInDb: string | null) {
  const candidates: string[] = [];

  // Current canonical storage path.
  candidates.push(path.resolve(process.cwd(), "public/uploads/avatars", userAvatarFilename(userId)));

  // Legacy path when static URL is stored in DB.
  if (avatarInDb && avatarInDb.startsWith("/uploads/")) {
    const clean = avatarInDb.split("?")[0] ?? avatarInDb;
    candidates.push(path.resolve(process.cwd(), "public", clean.replace(/^\/+/, "")));
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

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const locale = getRequestLocale(request);
  const isEn = locale === "en";
  try {
    const session = await auth();
    const requesterId = session?.user?.id;
    if (!requesterId) {
      return NextResponse.json(
        { ok: false, error: pickByIsEn(isEn, "Non authentifié", "Not authenticated.") },
        { status: 401 }
      );
    }

    const { id: userId } = await context.params;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { avatar: true },
    });
    if (!user) {
      return NextResponse.json(
        { ok: false, error: pickByIsEn(isEn, "Utilisateur introuvable", "User not found.") },
        { status: 404 }
      );
    }

    const resolvedPath = await resolveReadableAvatarPath(userId, user.avatar);
    if (!resolvedPath) {
      return NextResponse.json(
        {
          ok: false,
          error: pickByIsEn(
            isEn,
            "Avatar utilisateur introuvable, veuillez le recharger.",
            "User avatar not found. Please upload it again."
          ),
        },
        { status: 404 }
      );
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
    console.error("User avatar fetch failed:", error);
    return NextResponse.json(
      { ok: false, error: pickByIsEn(isEn, "Erreur de lecture avatar", "Error while reading avatar.") },
      { status: 500 }
    );
  }
}
