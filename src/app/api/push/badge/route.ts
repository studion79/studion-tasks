import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getRequestLocale } from "@/lib/i18n/server";
import { pickByIsEn } from "@/lib/i18n/pick";

export async function GET(req: Request) {
  const locale = getRequestLocale(req);
  const isEn = locale === "en";
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return Response.json(
      { ok: false, error: pickByIsEn(isEn, "Non authentifié", "Not authenticated.") },
      { status: 401 }
    );
  }

  const unreadCount = await prisma.notification.count({
    where: { userId, isRead: false },
  });

  return Response.json({ ok: true, unreadCount });
}
