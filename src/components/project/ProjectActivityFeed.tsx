"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getUiLocale } from "@/lib/ui-locale";
import { getProjectActivityLog } from "@/lib/actions";
import { trKey } from "@/lib/i18n/client";
import { useClientLocale } from "@/lib/i18n/useClientLocale";
import { usePathname } from "next/navigation";
import { pickByIsEn, pickByLocale } from "@/lib/i18n/pick";

type ActivityEntry = Awaited<ReturnType<typeof getProjectActivityLog>>[number];

// ── Helpers ────────────────────────────────────────────────────────────────

function relativeTime(date: Date, locale: "fr" | "en"): string {
  const diff = Date.now() - new Date(date).getTime();
  const m = Math.floor(diff / 60_000);
  const h = Math.floor(diff / 3_600_000);
  const d = Math.floor(diff / 86_400_000);
  if (locale === "en") {
    if (m < 1) return "just now";
    if (m < 60) return `${m} min ago`;
    if (h < 24) return `${h}h ago`;
    if (d === 1) return "yesterday";
    if (d < 7) return `${d}d ago`;
  } else {
    if (m < 1) return "a l'instant";
    if (m < 60) return `il y a ${m} min`;
    if (h < 24) return `il y a ${h}h`;
    if (d === 1) return "hier";
    if (d < 7) return `il y a ${d}j`;
  }
  return new Date(date).toLocaleDateString(getUiLocale(), { day: "numeric", month: "short" });
}

function dayLabel(date: Date, locale: "fr" | "en"): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - d.getTime()) / 86_400_000);
  if (diff === 0) return pickByLocale(locale, "Aujourd'hui", "Today");
  if (diff === 1) return pickByLocale(locale, "Hier", "Yesterday");
  if (diff < 7) return d.toLocaleDateString(getUiLocale(), { weekday: "long" });
  return d.toLocaleDateString(getUiLocale(), { day: "numeric", month: "long", year: "numeric" });
}

function dayKey(date: Date): string {
  const d = new Date(date);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

type ActionMeta = { icon: React.ReactNode; label: string; color: string };

function getActionMeta(action: string, details: string | null, locale: "fr" | "en"): ActionMeta {
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
        label: trKey(locale, "activity.taskCreated"),
        color: "bg-emerald-100 text-emerald-600",
      };
    case "ARCHIVED":
      return {
        icon: (
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        ),
        label: trKey(locale, "activity.archived"),
        color: "bg-gray-100 text-gray-500",
      };
    case "RESTORED":
      return {
        icon: (
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d="M4 4v5h5M20 20v-5h-5M4 9a9 9 0 0114.7-3.4M20 15a9 9 0 01-14.7 3.4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ),
        label: trKey(locale, "activity.restored"),
        color: "bg-blue-100 text-blue-600",
      };
    case "COMMENT_ADDED":
      return {
        icon: (
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        ),
        label: trKey(locale, "activity.comment"),
        color: "bg-indigo-100 text-indigo-600",
      };
    case "TITLE_UPDATED":
      return {
        icon: (
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        ),
        label: trKey(locale, "activity.titleUpdated"),
        color: "bg-amber-100 text-amber-700",
      };
    case "FIELD_UPDATED": {
      const field = (parsed.field as string) ?? trKey(locale, "activity.field");
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
  const pathname = usePathname();
  const locale = useClientLocale(pathname);
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [rangeFilter, setRangeFilter] = useState<"today" | "week" | "all">("all");
  const [visibleCount, setVisibleCount] = useState(120);
  const [pullDistance, setPullDistance] = useState(0);
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pullStartYRef = useRef<number | null>(null);
  const canPullRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getProjectActivityLog(projectId);
      setEntries(data);
    } catch {
      setError(trKey(locale, "activity.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [locale, projectId]);

  useEffect(() => { load(); }, [load]);

  const filteredEntries = entries.filter((entry) => {
    if (rangeFilter === "all") return true;
    const created = new Date(entry.createdAt);
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    if (rangeFilter === "today") return created >= start;
    const weekStart = new Date(start);
    weekStart.setDate(weekStart.getDate() - 6);
    return created >= weekStart;
  });
  const displayedEntries = filteredEntries.slice(0, visibleCount);

  useEffect(() => {
    setVisibleCount(window.innerWidth < 640 ? 80 : 140);
  }, []);

  useEffect(() => {
    setVisibleCount(window.innerWidth < 640 ? 80 : 140);
  }, [rangeFilter, entries]);

  // Group by day
  const grouped: { dayKey: string; label: string; items: ActivityEntry[] }[] = [];
  for (const entry of displayedEntries) {
    const dk = dayKey(entry.createdAt);
    const existing = grouped.find((g) => g.dayKey === dk);
    if (existing) {
      existing.items.push(entry);
    } else {
      grouped.push({ dayKey: dk, label: dayLabel(entry.createdAt, locale), items: [entry] });
    }
  }

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (isPullRefreshing) return;
    canPullRef.current = e.currentTarget.scrollTop <= 0;
    pullStartYRef.current = e.touches[0]?.clientY ?? null;
  };
  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (isPullRefreshing || !canPullRef.current || pullStartYRef.current === null) return;
    const delta = e.touches[0].clientY - pullStartYRef.current;
    if (delta <= 0) {
      setPullDistance(0);
      return;
    }
    setPullDistance(Math.min(88, delta * 0.45));
  };
  const handleTouchEnd = () => {
    const shouldRefresh = pullDistance > 56;
    setPullDistance(0);
    pullStartYRef.current = null;
    canPullRef.current = false;
    if (!shouldRefresh || isPullRefreshing) return;
    setIsPullRefreshing(true);
    load().finally(() => {
      setTimeout(() => setIsPullRefreshing(false), 250);
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full py-24 text-gray-400">
        <svg className="w-5 h-5 animate-spin mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        {trKey(locale, "project.loading")}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
        <p className="text-sm">{error}</p>
        <button onClick={load} className="text-xs text-indigo-500 hover:underline cursor-pointer">
          {trKey(locale, "activity.retry")}
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
        <p className="text-sm">{trKey(locale, "activity.noneRecorded")}</p>
      </div>
    );
  }

  return (
    <div
      className="overflow-y-auto h-full touch-pan-y"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div className="sticky top-0 z-10 bg-white/95 dark:bg-gray-900/95 backdrop-blur border-b border-gray-100 dark:border-gray-700 px-3 sm:px-6 py-2.5">
        <div className="flex justify-center pointer-events-none">
          <div
            className={[
              "text-[11px] px-2.5 py-1 rounded-full border transition-all mb-2",
              isPullRefreshing
                ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                : "bg-white/90 dark:bg-gray-800/90 text-gray-400 border-gray-200 dark:border-gray-700",
              pullDistance > 0 || isPullRefreshing ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-1",
            ].join(" ")}
            style={{ transform: `translateY(${Math.min(pullDistance / 3, 10)}px)` }}
          >
            {isPullRefreshing
              ? trKey(locale, "project.refreshing")
              : pullDistance > 56
              ? trKey(locale, "project.releaseToRefresh")
              : trKey(locale, "project.pullToRefresh")}
          </div>
        </div>
        <div className="max-w-2xl mx-auto flex items-center gap-1.5 sm:gap-2">
          {([
            { key: "today", label: trKey(locale, "dashboard.today") },
            { key: "week", label: trKey(locale, "activity.sevenDays") },
            { key: "all", label: trKey(locale, "dashboard.all") },
          ] as const).map((option) => (
            <button
              key={option.key}
              onClick={() => setRangeFilter(option.key)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                rangeFilter === option.key
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700"
              }`}
            >
              {option.label}
            </button>
          ))}
          <span className="ml-auto text-[11px] text-gray-400 dark:text-gray-500 tabular-nums">
            {displayedEntries.length}/{filteredEntries.length}
          </span>
        </div>
      </div>
      <div className="px-3 sm:px-6 py-4 sm:py-6">
      <div className="max-w-2xl mx-auto space-y-6 sm:space-y-8">
        {filteredEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <svg className="w-9 h-9 mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <p className="text-sm">{trKey(locale, "activity.noneForPeriod")}</p>
          </div>
        ) : (
        <>
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
                const meta = getActionMeta(entry.action, entry.details, locale);
                return (
                  <div
                    key={entry.id}
                    className="flex items-start gap-2.5 sm:gap-3 py-2 px-2.5 sm:px-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors group"
                  >
                    {/* Icon */}
                    <div className={`w-6 h-6 sm:w-7 sm:h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${meta.color}`}>
                      {meta.icon}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-1.5 flex-wrap">
                        {/* Task name */}
                        <button
                          onClick={() => onOpenTask?.(entry.task.id)}
                          className="text-[13px] sm:text-sm font-medium text-gray-800 dark:text-gray-100 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer truncate text-left"
                        >
                          {entry.task.title}
                        </button>
                        {/* Group badge */}
                        <span className="text-[10px] text-gray-400 flex-shrink-0">
                          {trKey(locale, "activity.in")}{" "}
                          <span
                            className="font-medium"
                            style={{ color: entry.task.group.color }}
                          >
                            {entry.task.group.name}
                          </span>
                        </span>
                      </div>

                      {/* Action */}
                      <p className="text-[11px] sm:text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                        <span className="font-medium text-gray-600 dark:text-gray-300">{entry.actor}</span>
                        {" — "}
                        {meta.label}
                      </p>
                    </div>

                    {/* Timestamp */}
                    <span className="text-[10px] text-gray-400 flex-shrink-0 mt-1 whitespace-nowrap">
                      {relativeTime(entry.createdAt, locale)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        </>
        )}

        {entries.length >= 200 && (
          <p className="text-center text-xs text-gray-400 py-2">
            {trKey(locale, "activity.last200")}
          </p>
        )}
        {visibleCount < filteredEntries.length && (
          <div className="flex justify-center pt-1">
            <button
              onClick={() => setVisibleCount((prev) => prev + 80)}
              className="text-xs px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300"
            >
              {trKey(locale, "activity.showMore")}
            </button>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
