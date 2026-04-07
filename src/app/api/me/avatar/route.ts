import { mkdir, writeFile } from "fs/promises";
import path from "path";
import sharp from "sharp";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getRequestLocale } from "@/lib/i18n/server";
import { publishRealtimeEvent } from "@/lib/realtime";

const ALLOWED_AVATAR_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]);
const MAX_AVATAR_UPLOAD_BYTES = 20 * 1024 * 1024; // 20MB

export async function POST(request: Request) {
  const locale = getRequestLocale(request);
  const isEn = locale === "en";
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ ok: false, error: isEn ? "Not authenticated." : "Non authentifié" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("avatar");
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ ok: false, error: isEn ? "No file provided." : "Aucun fichier fourni" }, { status: 400 });
    }
    if (!ALLOWED_AVATAR_TYPES.has(file.type)) {
      return NextResponse.json(
        { ok: false, error: isEn ? "Unsupported format. Use JPG, PNG, WebP, GIF or AVIF." : "Format non supporté. Utilisez JPG, PNG, WebP, GIF ou AVIF." },
        { status: 400 }
      );
    }
    if (file.size > MAX_AVATAR_UPLOAD_BYTES) {
      return NextResponse.json(
        { ok: false, error: isEn ? "Image too large (maximum 20MB)." : "Image trop volumineuse (maximum 20MB)." },
        { status: 413 }
      );
    }

    const dir = path.resolve(process.cwd(), "public/uploads/avatars");
    await mkdir(dir, { recursive: true });

    const filename = `${userId}.jpg`;
    const inputBuffer = Buffer.from(await file.arrayBuffer());
    const compressed = await sharp(inputBuffer)
      .resize(256, 256, { fit: "cover", position: "centre" })
      .jpeg({ quality: 82, progressive: true })
      .toBuffer();

    await writeFile(path.join(dir, filename), compressed);

    const avatarUrl = `/uploads/avatars/${filename}?t=${Date.now()}`;
    await prisma.user.update({ where: { id: userId }, data: { avatar: avatarUrl } });
    publishRealtimeEvent({
      type: "PROFILE_CHANGED",
      scope: `user:${userId}`,
      userId,
    });

    return NextResponse.json({ ok: true, url: avatarUrl });
  } catch (error) {
    console.error("Avatar upload failed:", error);
    return NextResponse.json(
      { ok: false, error: isEn ? "Unable to process this image. Try JPG, PNG or WebP." : "Impossible de traiter cette image. Essayez une image JPG, PNG ou WebP." },
      { status: 500 }
    );
  }
}
