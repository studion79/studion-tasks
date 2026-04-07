import webpush, { type PushSubscription as WebPushSubscription } from "web-push";
import { prisma } from "@/lib/db";

type StoredSubscription = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

let tableEnsured = false;
async function ensurePushTableExists(): Promise<void> {
  if (tableEnsured) return;
  await prisma.$executeRawUnsafe(
    `CREATE TABLE IF NOT EXISTS "PushSubscription" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "endpoint" TEXT NOT NULL,
      "p256dh" TEXT NOT NULL,
      "auth" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`
  );
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint")`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "PushSubscription_userId_idx" ON "PushSubscription"("userId")`
  );
  tableEnsured = true;
}

export async function ensurePushSubscriptionStorage(): Promise<void> {
  await ensurePushTableExists();
}

function getVapidConfig() {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim() || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:admin@example.com";
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject };
}

export function getWebPushPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY?.trim() || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() || null;
}

export function isWebPushEnabled(): boolean {
  return Boolean(getVapidConfig());
}

let vapidConfigured = false;
function ensureVapidConfigured() {
  if (vapidConfigured) return;
  const vapid = getVapidConfig();
  if (!vapid) return;
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
  vapidConfigured = true;
}

function decodeB64Url(value: string): Buffer {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(normalized + padding, "base64");
}

function toWebPushSubscription(row: StoredSubscription): WebPushSubscription {
  return {
    endpoint: row.endpoint,
    keys: {
      p256dh: decodeB64Url(row.p256dh).toString("base64"),
      auth: decodeB64Url(row.auth).toString("base64"),
    },
  };
}

function isMissingTable(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return msg.includes("no such table") || msg.includes("pushsubscription");
}

export async function savePushSubscription(params: {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}): Promise<void> {
  try {
    await ensurePushTableExists();
    await prisma.$executeRawUnsafe(
      `INSERT INTO "PushSubscription" ("id","userId","endpoint","p256dh","auth","createdAt")
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT("endpoint")
       DO UPDATE SET "userId"=excluded."userId","p256dh"=excluded."p256dh","auth"=excluded."auth"`,
      crypto.randomUUID(),
      params.userId,
      params.endpoint,
      params.p256dh,
      params.auth
    );
  } catch (error) {
    if (isMissingTable(error)) return;
    throw error;
  }
}

export async function removePushSubscription(endpoint: string): Promise<void> {
  try {
    await ensurePushTableExists();
    await prisma.$executeRawUnsafe(
      `DELETE FROM "PushSubscription" WHERE "endpoint" = ?`,
      endpoint
    );
  } catch (error) {
    if (isMissingTable(error)) return;
    throw error;
  }
}

export async function sendWebPushToUser(params: {
  userId: string;
  title: string;
  body: string;
  url?: string;
  tag?: string;
}): Promise<void> {
  if (!isWebPushEnabled()) return;
  ensureVapidConfigured();

  let rows: StoredSubscription[] = [];
  try {
    await ensurePushTableExists();
    rows = await prisma.$queryRawUnsafe<StoredSubscription[]>(
      `SELECT "id","endpoint","p256dh","auth" FROM "PushSubscription" WHERE "userId" = ?`,
      params.userId
    );
  } catch (error) {
    if (isMissingTable(error)) return;
    throw error;
  }
  if (rows.length === 0) return;

  const payload = JSON.stringify({
    title: params.title,
    body: params.body,
    url: params.url ?? "/",
    tag: params.tag ?? "task-app",
    type: "task-app",
    actions: [
      { action: "open", title: "Ouvrir" },
    ],
  });

  await Promise.all(
    rows.map(async (row) => {
      try {
        await webpush.sendNotification(toWebPushSubscription(row), payload);
      } catch (error) {
        const statusCode = (error as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await removePushSubscription(row.endpoint).catch(() => {});
        }
      }
    })
  );
}
