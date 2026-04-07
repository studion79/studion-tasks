"use client";

import { useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import type { RealtimeEvent, RealtimeScope } from "@/lib/realtime";

type UseRealtimeSyncParams = {
  scopes: RealtimeScope[];
  enabled?: boolean;
  onEvent?: (event: RealtimeEvent) => void;
};

const RETRY_STEPS_MS = [1000, 2000, 5000, 10000] as const;
const REFRESH_THROTTLE_MS = 500;
const MAX_SEEN_EVENT_IDS = 400;

function uniqueScopes(scopes: RealtimeScope[]): RealtimeScope[] {
  return Array.from(new Set(scopes.map((scope) => scope.trim() as RealtimeScope))).filter(Boolean);
}

export function useRealtimeSync(params: UseRealtimeSyncParams) {
  const { enabled = true, onEvent } = params;
  const router = useRouter();
  const seenIdsRef = useRef<Set<string>>(new Set());
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshQueuedRef = useRef(false);

  const normalizedScopes = useMemo(
    () => uniqueScopes(params.scopes).sort(),
    [params.scopes]
  );
  const scopesParam = useMemo(() => normalizedScopes.join(","), [normalizedScopes]);

  useEffect(() => {
    if (!enabled || normalizedScopes.length === 0) return;

    let cancelled = false;
    let retryIndex = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let eventSource: EventSource | null = null;
    let reconnectCount = 0;

    const clearReconnectTimer = () => {
      if (!reconnectTimer) return;
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    };

    const flushRefresh = () => {
      refreshTimerRef.current = null;
      if (!refreshQueuedRef.current) return;
      refreshQueuedRef.current = false;
      router.refresh();
    };

    const scheduleRefresh = () => {
      refreshQueuedRef.current = true;
      if (refreshTimerRef.current) return;
      refreshTimerRef.current = setTimeout(flushRefresh, REFRESH_THROTTLE_MS);
    };

    const rememberEventId = (id: string) => {
      const seen = seenIdsRef.current;
      if (seen.has(id)) return false;
      seen.add(id);
      if (seen.size > MAX_SEEN_EVENT_IDS) {
        const oldest = seen.values().next().value as string | undefined;
        if (oldest) seen.delete(oldest);
      }
      return true;
    };

    const connect = () => {
      if (cancelled) return;
      const query = new URLSearchParams({
        scopes: scopesParam,
        rc: String(reconnectCount),
      });
      eventSource = new EventSource(`/api/realtime/stream?${query.toString()}`);

      eventSource.addEventListener("ready", () => {
        retryIndex = 0;
      });

      eventSource.addEventListener("update", (message) => {
        const payload = (message as MessageEvent<string>).data;
        if (!payload) return;
        try {
          const event = JSON.parse(payload) as RealtimeEvent;
          if (!event?.id) return;
          if (!rememberEventId(event.id)) return;
          onEvent?.(event);
          scheduleRefresh();
        } catch {
          // ignore malformed event
        }
      });

      eventSource.addEventListener("heartbeat", () => {
        // keep-alive only
      });

      eventSource.onerror = () => {
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }
        if (cancelled) return;
        const delay = RETRY_STEPS_MS[Math.min(retryIndex, RETRY_STEPS_MS.length - 1)];
        retryIndex += 1;
        reconnectCount += 1;
        clearReconnectTimer();
        reconnectTimer = setTimeout(() => {
          connect();
        }, delay);
      };
    };

    connect();

    return () => {
      cancelled = true;
      clearReconnectTimer();
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      refreshQueuedRef.current = false;
    };
  }, [enabled, normalizedScopes.length, onEvent, router, scopesParam]);
}

