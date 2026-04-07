import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { removePushSubscription } from "@/lib/push";
import { getRequestLocale } from "@/lib/i18n/server";
import { publishRealtimeEvent } from "@/lib/realtime";

export async function POST(req: Request) {
  const locale = getRequestLocale(req);
  const isEn = locale === "en";
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return Response.json({ ok: false, error: isEn ? "Not authenticated." : "Non authentifié" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { endpoint?: string };
  const endpoint = body.endpoint?.trim();
  if (!endpoint) return Response.json({ ok: false, error: isEn ? "Missing endpoint." : "Endpoint manquant" }, { status: 400 });

  await removePushSubscription(endpoint);

  const rows = await prisma.$queryRawUnsafe<Array<{ count: number | bigint }>>(
    `SELECT COUNT(*) as count FROM "PushSubscription" WHERE "userId" = ?`,
    userId
  ).catch(() => []);
  const countRaw = rows[0]?.count ?? 0;
  const remaining =
    typeof countRaw === "bigint"
      ? Number(countRaw)
      : Number(countRaw ?? 0);

  await prisma.$executeRawUnsafe(
    `CREATE TABLE IF NOT EXISTS "UserNotificationSettings" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "pushEnabled" BOOLEAN NOT NULL DEFAULT true,
      "emailEnabled" BOOLEAN NOT NULL DEFAULT false,
      "dndEnabled" BOOLEAN NOT NULL DEFAULT false,
      "dndStart" TEXT NOT NULL DEFAULT '22:00',
      "dndEnd" TEXT NOT NULL DEFAULT '08:00',
      "dndWeekendsOnly" BOOLEAN NOT NULL DEFAULT false,
      "dailySummaryTime" TEXT NOT NULL DEFAULT '08:00',
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "UserNotificationSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`
  );
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "UserNotificationSettings_userId_key" ON "UserNotificationSettings"("userId")`
  );
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "UserNotificationSettings" ADD COLUMN "pushEnabled" BOOLEAN NOT NULL DEFAULT true`
    );
  } catch {
    // already exists
  }
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "UserNotificationSettings" ADD COLUMN "dailySummaryTime" TEXT NOT NULL DEFAULT '08:00'`
    );
  } catch {
    // already exists
  }
  const nextPushEnabled = remaining > 0;
  await prisma.$executeRawUnsafe(
    `INSERT INTO "UserNotificationSettings"
      ("id","userId","pushEnabled","emailEnabled","dndEnabled","dndStart","dndEnd","dndWeekendsOnly","createdAt","updatedAt")
     VALUES (?, ?, ?, false, false, '22:00', '08:00', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT("userId")
     DO UPDATE SET
      "pushEnabled" = ?,
      "updatedAt" = CURRENT_TIMESTAMP`,
    crypto.randomUUID(),
    userId,
    nextPushEnabled,
    nextPushEnabled
  );
  publishRealtimeEvent({
    type: "PREFERENCES_CHANGED",
    scope: `user:${userId}`,
    userId,
  });

  return Response.json({ ok: true });
}
