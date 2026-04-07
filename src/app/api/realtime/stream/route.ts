import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { createRealtimeSubscription, parseRequestedScopes, type RealtimeEvent, type RealtimeScope } from "@/lib/realtime";
import { isSuperAdminUserId } from "@/lib/super-admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEARTBEAT_INTERVAL_MS = 20_000;
const MAX_CONNECTION_AGE_MS = 10 * 60_000;

type SessionUser = { id?: string; isSuperAdmin?: boolean };

function formatSseEvent(name: string, payload: unknown): string {
  return `event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`;
}

function parseProjectIdFromScope(scope: RealtimeScope): string | null {
  if (!scope.startsWith("project:")) return null;
  const id = scope.slice("project:".length).trim();
  return id || null;
}

async function getAllowedProjectIds(userId: string, isSuperAdmin: boolean): Promise<Set<string>> {
  if (isSuperAdmin) return new Set<string>();
  const memberships = await prisma.projectMember.findMany({
    where: { userId },
    select: { projectId: true },
  });
  return new Set(memberships.map((row) => row.projectId));
}

function sanitizeScopes(params: {
  userId: string;
  isSuperAdmin: boolean;
  requested: RealtimeScope[];
  allowedProjectIds: Set<string>;
}): RealtimeScope[] {
  const { userId, isSuperAdmin, requested, allowedProjectIds } = params;
  const finalScopes = new Set<RealtimeScope>();

  for (const scope of requested) {
    if (scope === "global:admin") {
      if (isSuperAdmin) finalScopes.add(scope);
      continue;
    }
    if (scope.startsWith("user:")) {
      if (scope === `user:${userId}`) {
        finalScopes.add(scope);
      }
      continue;
    }
    const projectId = parseProjectIdFromScope(scope);
    if (!projectId) continue;
    if (isSuperAdmin || allowedProjectIds.has(projectId)) {
      finalScopes.add(scope);
    }
  }

  if (!finalScopes.size) {
    finalScopes.add(`user:${userId}`);
    if (isSuperAdmin) finalScopes.add("global:admin");
  }

  return Array.from(finalScopes);
}

function canReceiveEvent(event: RealtimeEvent, activeScopes: Set<RealtimeScope>): boolean {
  if (event.scope === "global:admin") return activeScopes.has("global:admin");
  if (event.scope.startsWith("user:")) return activeScopes.has(event.scope);
  if (event.scope.startsWith("project:")) return activeScopes.has(event.scope);
  return false;
}

export async function GET(request: Request) {
  const session = await auth();
  const user = session?.user as SessionUser | undefined;
  const userId = user?.id;
  if (!userId) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const isSuperAdmin = Boolean(user?.isSuperAdmin) || isSuperAdminUserId(userId);
  const url = new URL(request.url);
  const reconnectCountRaw = url.searchParams.get("rc");
  const reconnectCount = Number.parseInt(reconnectCountRaw ?? "0", 10);
  const requestedScopes = parseRequestedScopes(url.searchParams.get("scopes"));
  const allowedProjectIds = await getAllowedProjectIds(userId, isSuperAdmin);
  const scopes = sanitizeScopes({
    userId,
    isSuperAdmin,
    requested: requestedScopes,
    allowedProjectIds,
  });
  const scopeSet = new Set<RealtimeScope>(scopes);

  const encoder = new TextEncoder();
  let cleanupRef: (() => void) | null = null;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const startedAt = Date.now();
      let closed = false;
      let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
      let hardTimeout: ReturnType<typeof setTimeout> | null = null;
      let unsubscribe: (() => void) | null = null;

      const write = (name: string, payload: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(formatSseEvent(name, payload)));
      };

      const close = () => {
        if (closed) return;
        closed = true;
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
          heartbeatTimer = null;
        }
        if (hardTimeout) {
          clearTimeout(hardTimeout);
          hardTimeout = null;
        }
        if (unsubscribe) {
          unsubscribe();
          unsubscribe = null;
        }
        try {
          controller.close();
        } catch {
          // ignore
        }
        console.info(
          `[realtime] disconnect userId=${userId} durationMs=${Date.now() - startedAt} scopes=${scopes.join("|") || "none"}`
        );
      };
      cleanupRef = close;

      write("ready", {
        userId,
        scopes,
        timestamp: new Date().toISOString(),
      });

      heartbeatTimer = setInterval(() => {
        write("heartbeat", { timestamp: new Date().toISOString() });
      }, HEARTBEAT_INTERVAL_MS);
      hardTimeout = setTimeout(() => {
        close();
      }, MAX_CONNECTION_AGE_MS);

      unsubscribe = createRealtimeSubscription((event) => {
        if (!canReceiveEvent(event, scopeSet)) return;
        write("update", event);
      });

      request.signal.addEventListener("abort", close);
      console.info(
        `[realtime] connect userId=${userId} scopes=${scopes.join("|") || "none"} reconnect=${Number.isFinite(reconnectCount) ? reconnectCount : 0}`
      );
    },
    cancel() {
      if (cleanupRef) cleanupRef();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
