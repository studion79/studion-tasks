import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { savePushSubscription } from "@/lib/push";
import { isSuperAdminUserId } from "@/lib/super-admin";
import { getRequestLocale } from "@/lib/i18n/server";
import { publishRealtimeEvent } from "@/lib/realtime";

type SubscriptionBody = {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
};

async function setPushEnabled(userId: string, pushEnabled: boolean): Promise<void> {
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
    pushEnabled,
    pushEnabled
  );
}

export async function POST(req: Request) {
  const locale = getRequestLocale(req);
  const isEn = locale === "en";
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return Response.json({ ok: false, error: isEn ? "Not authenticated." : "Non authentifié" }, { status: 401 });
  if (isSuperAdminUserId(userId)) {
    return Response.json(
      { ok: false, error: isEn ? "Global super admin cannot receive push notifications." : "Le super-admin global ne peut pas recevoir de notifications push." },
      { status: 400 }
    );
  }

  try {
    const body = (await req.json().catch(() => ({}))) as SubscriptionBody;
    const endpoint = body.endpoint?.trim();
    const p256dh = body.keys?.p256dh?.trim();
    const authKey = body.keys?.auth?.trim();
    if (!endpoint || !p256dh || !authKey) {
      return Response.json({ ok: false, error: isEn ? "Invalid push subscription." : "Abonnement push invalide." }, { status: 400 });
    }

    await savePushSubscription({
      userId,
      endpoint,
      p256dh,
      auth: authKey,
    });
    await setPushEnabled(userId, true).catch(() => {});
    publishRealtimeEvent({
      type: "PREFERENCES_CHANGED",
      scope: `user:${userId}`,
      userId,
    });

    return Response.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : (isEn ? "Server error." : "Erreur serveur");
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
