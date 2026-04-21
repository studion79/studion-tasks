"use client";

import { useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useRealtimeSync } from "@/lib/useRealtimeSync";
import type { RealtimeEvent, RealtimeScope } from "@/lib/realtime";

type RealtimeAutoRefreshProps = {
  projectIds?: string[];
  includeUserScope?: boolean;
  includeAdminScope?: boolean;
  enabled?: boolean;
  userId?: string | null;
  isSuperAdmin?: boolean;
};

export function RealtimeAutoRefresh({
  projectIds = [],
  includeUserScope = true,
  includeAdminScope = false,
  enabled = true,
  userId: userIdProp = null,
  isSuperAdmin: isSuperAdminProp = false,
}: RealtimeAutoRefreshProps) {
  const { data: session } = useSession();
  const user = session?.user as { id?: string; isSuperAdmin?: boolean } | undefined;
  const userId = userIdProp ?? user?.id ?? null;
  const isSuperAdmin = Boolean(isSuperAdminProp || user?.isSuperAdmin);

  const scopes = useMemo<RealtimeScope[]>(() => {
    const next = new Set<RealtimeScope>();
    if (includeUserScope && userId) {
      next.add(`user:${userId}`);
    }
    for (const projectId of projectIds) {
      if (!projectId) continue;
      next.add(`project:${projectId}`);
    }
    if (includeAdminScope && isSuperAdmin) {
      next.add("global:admin");
    }
    return Array.from(next);
  }, [includeAdminScope, includeUserScope, isSuperAdmin, projectIds, userId]);

  const reconcileDisplayPrefs = useCallback(async () => {
    try {
      const response = await fetch("/api/me/display-settings", { method: "GET", cache: "no-store" });
      if (!response.ok) return;
      const payload = (await response.json()) as {
        ok: boolean;
        settings?: {
          syncAcrossDevices: boolean;
          defaultView: "SPREADSHEET" | "KANBAN" | "CARDS" | "GANTT" | "TIMELINE" | "CALENDAR";
          density: "compact" | "comfortable";
          mondayFirst: boolean;
          dateFormat: "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD";
          language: "fr" | "en";
          themeMode: "system" | "light" | "dark";
        };
      };
      if (!payload.ok || !payload.settings) return;
      const server = payload.settings;
      const raw = window.localStorage.getItem("taskapp:display-prefs");
      const local = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      const next = server.syncAcrossDevices
        ? { ...local, ...server, syncAcrossDevices: true }
        : { ...local, syncAcrossDevices: false };
      window.localStorage.setItem("taskapp:display-prefs", JSON.stringify(next));
      window.dispatchEvent(new CustomEvent("taskapp:display-prefs-updated", { detail: next }));
    } catch {
      // silent sync
    }
  }, []);

  useRealtimeSync({
    scopes,
    enabled: enabled && scopes.length > 0,
    onEvent: (event: RealtimeEvent) => {
      if (event.type === "PREFERENCES_CHANGED") {
        void reconcileDisplayPrefs();
      }
    },
  });

  return null;
}
