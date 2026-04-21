import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getRequestLocale } from "@/lib/i18n/server";
import { publishRealtimeEvent } from "@/lib/realtime";
import { pickByIsEn, pickByLocale } from "@/lib/i18n/pick";

let settingsTableEnsured = false;
async function ensureNotificationSettingsTable(): Promise<void> {
  if (settingsTableEnsured) return;
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
    const columns = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
      `PRAGMA table_info("UserNotificationSettings")`
    );
    const hasPushEnabled = columns.some((c) => c.name === "pushEnabled");
    if (!hasPushEnabled) {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "UserNotificationSettings" ADD COLUMN "pushEnabled" BOOLEAN NOT NULL DEFAULT true`
      );
    }
    const hasDailySummaryTime = columns.some((c) => c.name === "dailySummaryTime");
    if (!hasDailySummaryTime) {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "UserNotificationSettings" ADD COLUMN "dailySummaryTime" TEXT NOT NULL DEFAULT '08:00'`
      );
    }
  } catch {
    // ignore
  }
  settingsTableEnsured = true;
}

export async function GET(req: Request) {
  const locale = getRequestLocale(req);
  const isEn = locale === "en";
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return Response.json({ ok: false, error: pickByIsEn(isEn, "Non authentifié", "Not authenticated.") }, { status: 401 });

  await ensureNotificationSettingsTable();
  const rows = await prisma.$queryRawUnsafe<Array<{ pushEnabled: boolean }>>(
    `SELECT "pushEnabled"
     FROM "UserNotificationSettings"
     WHERE "userId" = ?
     LIMIT 1`,
    userId
  );

  return Response.json({
    ok: true,
    pushEnabled: rows[0]?.pushEnabled ?? true,
  });
}

export async function POST(req: Request) {
  const locale = getRequestLocale(req);
  const isEn = locale === "en";
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return Response.json({ ok: false, error: pickByIsEn(isEn, "Non authentifié", "Not authenticated.") }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { pushEnabled?: boolean };
  const pushEnabled = Boolean(body.pushEnabled);

  await ensureNotificationSettingsTable();
  await prisma.$executeRawUnsafe(
    `INSERT INTO "UserNotificationSettings"
      ("id","userId","pushEnabled","emailEnabled","dndEnabled","dndStart","dndEnd","dndWeekendsOnly","createdAt","updatedAt")
     VALUES (?, ?, ?, false, false, '22:00', '08:00', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT("userId")
     DO UPDATE SET
      "pushEnabled" = excluded."pushEnabled",
      "updatedAt" = CURRENT_TIMESTAMP`,
    crypto.randomUUID(),
    userId,
    pushEnabled
  );
  publishRealtimeEvent({
    type: "PREFERENCES_CHANGED",
    scope: `user:${userId}`,
    userId,
  });

  return Response.json({ ok: true, pushEnabled });
}
