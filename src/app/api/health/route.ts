import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function uptimeSeconds() {
  try {
    return Math.floor(process.uptime());
  } catch {
    return null;
  }
}

export async function GET() {
  const startedAt = Date.now();
  let dbOk = false;
  let dbError: string | null = null;

  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    dbOk = true;
  } catch (error) {
    dbOk = false;
    dbError = error instanceof Error ? error.message : "unknown_db_error";
  }

  const ok = dbOk;
  const rawVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? "vdev";
  const payload = {
    ok,
    kind: "ready",
    appVersion: rawVersion.startsWith("v") ? rawVersion : `v${rawVersion}`,
    nodeEnv: process.env.NODE_ENV ?? "development",
    uptimeSec: uptimeSeconds(),
    db: {
      ok: dbOk,
      error: dbError,
    },
    latencyMs: Date.now() - startedAt,
    ts: new Date().toISOString(),
  };

  return NextResponse.json(payload, { status: ok ? 200 : 503 });
}
