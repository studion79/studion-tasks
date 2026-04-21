type RealtimeEventType =
  | "PROJECT_CHANGED"
  | "TASK_CHANGED"
  | "ARCHIVE_CHANGED"
  | "NOTIFICATION_CHANGED"
  | "PROFILE_CHANGED"
  | "PREFERENCES_CHANGED"
  | "ADMIN_DATA_CHANGED";

export type RealtimeScope = `project:${string}` | `user:${string}` | "global:admin";

export type RealtimeEvent = {
  id: string;
  type: RealtimeEventType;
  scope: RealtimeScope;
  projectId?: string;
  taskId?: string;
  userId?: string;
  timestamp: string;
};

type RealtimeSubscriber = (event: RealtimeEvent) => void;

type RealtimeBusState = {
  subscribers: Map<string, RealtimeSubscriber>;
};

declare global {
  var __taskAppRealtimeBus: RealtimeBusState | undefined;
}

function getRealtimeBus(): RealtimeBusState {
  if (!globalThis.__taskAppRealtimeBus) {
    globalThis.__taskAppRealtimeBus = {
      subscribers: new Map<string, RealtimeSubscriber>(),
    };
  }
  return globalThis.__taskAppRealtimeBus;
}

function toIsoNow() {
  return new Date().toISOString();
}

function newEventId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function subscribeRealtime(listener: RealtimeSubscriber): () => void {
  const bus = getRealtimeBus();
  const id = newEventId();
  bus.subscribers.set(id, listener);
  return () => {
    bus.subscribers.delete(id);
  };
}

export function publishRealtimeEvent(
  event: Omit<RealtimeEvent, "id" | "timestamp"> & Partial<Pick<RealtimeEvent, "id" | "timestamp">>
) {
  const bus = getRealtimeBus();
  const normalized: RealtimeEvent = {
    id: event.id ?? newEventId(),
    timestamp: event.timestamp ?? toIsoNow(),
    type: event.type,
    scope: event.scope,
    projectId: event.projectId,
    taskId: event.taskId,
    userId: event.userId,
  };

  for (const listener of bus.subscribers.values()) {
    try {
      listener(normalized);
    } catch {
      // never break publish flow because of one subscriber
    }
  }
}

export function createRealtimeSubscription(listener: RealtimeSubscriber): () => void {
  return subscribeRealtime(listener);
}

export function parseRequestedScopes(raw: string | null | undefined): RealtimeScope[] {
  if (!raw) return [];
  const parts = raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const unique = new Set<RealtimeScope>();
  for (const part of parts) {
    if (part === "global:admin") {
      unique.add("global:admin");
      continue;
    }
    if (part.startsWith("project:")) {
      unique.add(`project:${part.slice("project:".length)}`);
      continue;
    }
    if (part.startsWith("user:")) {
      unique.add(`user:${part.slice("user:".length)}`);
      continue;
    }
  }
  return Array.from(unique);
}
