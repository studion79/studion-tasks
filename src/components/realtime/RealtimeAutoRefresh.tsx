"use client";

import { useMemo } from "react";
import { useSession } from "next-auth/react";
import { useRealtimeSync } from "@/lib/useRealtimeSync";
import type { RealtimeScope } from "@/lib/realtime";

type RealtimeAutoRefreshProps = {
  projectIds?: string[];
  includeUserScope?: boolean;
  includeAdminScope?: boolean;
  enabled?: boolean;
};

export function RealtimeAutoRefresh({
  projectIds = [],
  includeUserScope = true,
  includeAdminScope = false,
  enabled = true,
}: RealtimeAutoRefreshProps) {
  const { data: session } = useSession();
  const user = session?.user as { id?: string; isSuperAdmin?: boolean } | undefined;
  const userId = user?.id;
  const isSuperAdmin = Boolean(user?.isSuperAdmin);

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

  useRealtimeSync({
    scopes,
    enabled: enabled && scopes.length > 0,
  });

  return null;
}

