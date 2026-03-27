"use client";

import { useState, useEffect, useCallback } from "react";
import { getProjectActivityLog } from "@/lib/actions";

type ActivityEntry = Awaited<ReturnType<typeof getProjectActivityLog>>[number];

// ── Helpers ────────────────────────────────────────────────────────────────

function relativeTime(date: Date): string {
  const diff = Date.now() - new Date(date).getTime();
  const m = Math.floor(diff / 60_000);
  const h = Math.floor(diff / 3_600_000);
  const d = Math.floor(diff / 86_400_000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  if (h < 24) return `il y a ${h}h`;
  if (d === 1) return "hier";
  if (d < 7) return `il y a ${d}j`;
  return new Date(date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function dayLabel(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - d.getTime()) / 86_400_000);
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return "Hier";
  if (diff < 7) return d.toLocaleDateString("fr-FR", { weekday: "long" });
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

function dayKey(date: Date): string {
  const d = new Date(date);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

type ActionMeta = { icon: React.ReactNode; label: string; color: string };

function getActionMeta(action: string, details: string | null): ActionMeta {
  let parsed: Record<string, unknown> = {};
  try { if (details) parsed = JSON.parse(details); } catch {}

  switch (action) {
    case "CREATED":
      return {
        icon: (
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d="M12 4v16m8-8H4" strokeWidth="2" strokeLinecap="round" />
          </svg>
        ),
        label: "Tâche créée",
        color: "bg-emerald-100 text-emerald-600",
      };
    case "ARCHIVED":
      return {
        icon: (
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        ),
        label: "Archivée",
        color: "bg-gray-100 text-gray-500",
      };
    case "RESTORED":
      return {
        icon: (
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d="M4 4v5h5M20 20v-5h-5M4 9a9 9 0 0114.7-3.4M20 15a9 9 0 01-14.7 3.4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ),
        label: "Restaurée",
        color: "bg-blue-100 text-blue-600",
      };
    case "COMMENT_ADDED":
      return {
        icon: (
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        ),
        label: "Commentaire",
        color: "bg-indigo-100 text-indigo-600",
      };
    case "TITLE_UPDATED":
      return {
        icon: (
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        ),
        label: "Titre modifié",
        color: "bg-amber-100 text-amber-700",
      };
    case "FIELD_UPDATED": {
      const field = (parsed.field as string) ?? "champ";
      const val = parsed.value ? ` → ${parsed.value}` : "";
      return {
        icon: (
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d="M4 6h16M4 12h16M4 18h7" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        ),
        label: `${field}${val}`,
        color: "bg-purple-100 text-purple-600",
      };
    }
    default:
      return {
        icon: (
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="9" strokeWidth="1.5" />
          </svg>
        ),
        label: action.toLowerCase().replace(/_/g, " "),
        color: "bg-gray-100 text-gray-500",
      };
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

export function ProjectActivityFeed({
  projectId,
  onOpenTask,
}: {
  projectId: string;
  onOpenTask?: (taskId: string) => void;
}) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getProjectActivityLog(projectId);
      setEntries(data);
    } catch {
      setError("Impossible de charger le journal.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  // Group by day
  const grouped: { dayKey: string; label: string; items: ActivityEntry[] }[] = [];
  for (const entry of entries) {
    const dk = dayKey(entry.createdAt);
    const existing = grouped.find((g) => g.dayKey === dk);
    if (existing) {
      existing.items.push(entry);
    } else {
      grouped.push({ dayKey: dk, label: dayLabel(entry.createdAt), items: [entry] });
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full py-24 text-gray-400">
        <svg className="w-5 h-5 animate-spin mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        Chargement…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
        <p className="text-sm">{error}</p>
        <button onClick={load} className="text-xs text-indigo-500 hover:underline cursor-pointer">
          Réessayer
        </button>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-gray-400">
        <svg className="w-10 h-10 mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <p className="text-sm">Aucune activité enregistrée.</p>
      </div>
    );
  }

  return (
    <div className="p-6 overflow-y-auto h-full">
      <div className="max-w-2xl mx-auto space-y-8">
        {grouped.map((group) => (
          <div key={group.dayKey}>
            {/* Day separator */}
            <div className="flex items-center gap-3 mb-4">
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">
                {group.label}
              </span>
              <div className="flex-1 h-px bg-gray-100 dark:bg-gray-700" />
            </div>

            {/* Entries */}
            <div className="space-y-1">
              {group.items.map((entry) => {
                const meta = getActionMeta(entry.action, entry.details);
                return (
                  <div
                    key={entry.id}
                    className="flex items-start gap-3 py-2.5 px-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors group"
                  >
                    {/* Icon */}
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${meta.color}`}>
                      {meta.icon}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-1.5 flex-wrap">
                        {/* Task name */}
                        <button
                          onClick={() => onOpenTask?.(entry.task.id)}
                          className="text-sm font-medium text-gray-800 dark:text-gray-100 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer truncate text-left"
                        >
                          {entry.task.title}
                        </button>
                        {/* Group badge */}
                        <span className="text-[10px] text-gray-400 flex-shrink-0">
                          dans{" "}
                          <span
                            className="font-medium"
                            style={{ color: entry.task.group.color }}
                          >
                            {entry.task.group.name}
                          </span>
                        </span>
                      </div>

                      {/* Action */}
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                        <span className="font-medium text-gray-600 dark:text-gray-300">{entry.actor}</span>
                        {" — "}
                        {meta.label}
                      </p>
                    </div>

                    {/* Timestamp */}
                    <span className="text-[10px] text-gray-400 flex-shrink-0 mt-1">
                      {relativeTime(entry.createdAt)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {entries.length >= 200 && (
          <p className="text-center text-xs text-gray-400 py-2">
            Affichage limité aux 200 dernières entrées
          </p>
        )}
      </div>
    </div>
  );
}
