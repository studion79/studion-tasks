"use client";

import React, { useState, useMemo, useCallback, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { ProjectWithRelations, TaskWithFields, ProjectColumn } from "@/lib/types";
import { upsertTaskField, updateTaskTitle } from "@/lib/actions";
import { TaskDetailPanel } from "./TaskDetailPanel";
import { useProjectContext } from "./ProjectContext";

// ---- Constants ----
const DAY_PX = 28;      // px per day
const OWNER_H = 48;     // px per owner row (compact)
const TASK_H = 28;      // px per task bar
const TASK_GAP = 4;     // vertical gap between task bars in same row
const LABEL_W = 180;    // px for left label column

// ---- Date helpers ----

function recurrenceLabel(recurrence: string | null): string | null {
  if (!recurrence) return null;
  try {
    const { frequency, interval, endDate } = JSON.parse(recurrence) as {
      frequency: string;
      interval: number;
      endDate?: string | null;
    };
    const labels: Record<string, string> = { daily: "jour", weekly: "semaine", monthly: "mois" };
    const unit = labels[frequency] ?? frequency;
    const base = interval === 1 ? `Récurrent · chaque ${unit}` : `Récurrent · tous les ${interval} ${unit}s`;
    if (!endDate) return base;
    return `${base} (jusqu'au ${new Date(`${endDate}T00:00:00`).toLocaleDateString("fr-FR")})`;
  } catch { return "Récurrent"; }
}

/** Safe local-date serializer — avoids UTC offset shifting YYYY-MM-DD by 1 day */
function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseTimeline(value: string | null): { start: Date; end: Date } | null {
  if (!value) return null;
  try {
    const { start, end } = JSON.parse(value) as { start?: string; end?: string };
    if (!start || !end) return null;
    return {
      start: new Date(start + "T00:00:00"),
      end: new Date(end + "T00:00:00"),
    };
  } catch {
    return null;
  }
}

function parseDueDate(value: string | null): Date | null {
  if (!value) return null;
  return new Date(value + "T00:00:00");
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function diffDays(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

// ---- Recurrence helpers ----
interface RecurrenceConfig { frequency: "daily" | "weekly" | "monthly"; interval: number; endDate?: string | null }
function parseRecurrence(r: string | null): RecurrenceConfig | null {
  if (!r) return null;
  try { return JSON.parse(r) as RecurrenceConfig; } catch { return null; }
}
function shiftByRecurrence(d: Date, cfg: RecurrenceConfig, times: number): Date {
  const result = new Date(d);
  if (cfg.frequency === "daily") result.setDate(result.getDate() + cfg.interval * times);
  else if (cfg.frequency === "weekly") result.setDate(result.getDate() + cfg.interval * 7 * times);
  else result.setMonth(result.getMonth() + cfg.interval * times);
  return result;
}

function isWeekend(d: Date) {
  return d.getDay() === 0 || d.getDay() === 6;
}

function buildWeekGroups(viewStart: Date, totalDays: number) {
  const groups: { label: string; days: number; offset: number }[] = [];
  let offset = 0;
  while (offset < totalDays) {
    const d = addDays(viewStart, offset);
    const monday = new Date(d);
    const dow = d.getDay() === 0 ? 6 : d.getDay() - 1; // days since Monday
    monday.setDate(monday.getDate() - dow);
    // Count days in this week within our range
    const startOfWeek = Math.max(0, offset - dow);
    const endOfWeek = Math.min(totalDays - 1, startOfWeek + 6);
    const daysInGroup = endOfWeek - offset + 1;
    const weekLabel = `Sem. ${getWeekNumber(monday)} — ${monday.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`;
    groups.push({ label: weekLabel, days: daysInGroup, offset });
    offset += daysInGroup;
  }
  return groups;
}

function getWeekNumber(d: Date) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  const week1 = new Date(date.getFullYear(), 0, 4);
  return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
}

// ---- Owner colors ----
const OWNER_COLORS = [
  { bg: "bg-indigo-500", bar: "bg-indigo-400", text: "text-white", light: "bg-indigo-50" },
  { bg: "bg-violet-500", bar: "bg-violet-400", text: "text-white", light: "bg-violet-50" },
  { bg: "bg-sky-500", bar: "bg-sky-400", text: "text-white", light: "bg-sky-50" },
  { bg: "bg-emerald-500", bar: "bg-emerald-400", text: "text-white", light: "bg-emerald-50" },
  { bg: "bg-amber-500", bar: "bg-amber-400", text: "text-white", light: "bg-amber-50" },
  { bg: "bg-rose-500", bar: "bg-rose-400", text: "text-white", light: "bg-rose-50" },
  { bg: "bg-teal-500", bar: "bg-teal-400", text: "text-white", light: "bg-teal-50" },
];

// ---- Period options ----
const PERIOD_OPTIONS = [
  { label: "2 sem.", days: 14 },
  { label: "1 mois", days: 30 },
  { label: "3 mois", days: 90 },
  { label: "6 mois", days: 180 },
  { label: "1 an", days: 365 },
];

// ---- Main component ----
export function ProjectTimelineView({
  project,
  allColumns,
}: {
  project: ProjectWithRelations;
  allColumns: ProjectColumn[];
}) {
  const { memberAvatars } = useProjectContext();
  const [selectedTask, setSelectedTask] = useState<{
    task: TaskWithFields;
    groupName: string;
    groupColor: string;
  } | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  // ---- Drag state ----
  const dragRef = useRef<{
    taskId: string;
    type: "timeline" | "duedate";
    edge?: "left" | "right";
    startClientX: number;
    dragged: boolean;
    lastDays: number; // always in sync with the last rendered dragDelta
    originalTl: { start: Date; end: Date } | null;
    originalDd: Date | null;
  } | null>(null);
  type DeltaState = { taskId: string; days: number; type: "timeline" | "duedate"; edge?: "left" | "right" };
  const [dragDelta, setDragDelta] = useState<DeltaState | null>(null);
  // Keeps the visual offset alive while the server transition is pending
  const [committedDelta, setCommittedDelta] = useState<DeltaState | null>(null);
  const justDragged = useRef(false);

  // Clear committed offset once new project data arrives from the server
  useEffect(() => { setCommittedDelta(null); }, [project]);

  // Unified delta for rendering: live drag takes priority, then committed
  const getDisplayDelta = (taskId: string, type: "timeline" | "duedate"): number => {
    if (dragDelta?.taskId === taskId && dragDelta.type === type) return dragDelta.days;
    if (committedDelta?.taskId === taskId && committedDelta.type === type) return committedDelta.days;
    return 0;
  };

  // Use allColumns (includes inactive) so timeline/due-date bars appear
  // even when those columns are hidden from the spreadsheet view.
  const timelineCol = allColumns.find((c) => c.type === "TIMELINE");
  const dueDateCol = allColumns.find((c) => c.type === "DUE_DATE");
  const ownerCol = allColumns.find((c) => c.type === "OWNER");
  const statusCol = allColumns.find((c) => c.type === "STATUS");

  const fv = useCallback(
    (task: TaskWithFields, colId: string | undefined): string | null => {
      if (!colId) return null;
      return task.fieldValues.find((f) => f.columnId === colId)?.value ?? null;
    },
    []
  );

  // Gather all tasks with date info
  const allTasks = useMemo(
    () => project.groups.flatMap((g) => g.tasks.map((t) => ({ task: t, group: g }))),
    [project]
  );

  // ---- Period / navigation ----
  const autoView = useMemo(() => {
    const dates: Date[] = [new Date()];
    for (const { task } of allTasks) {
      const tl = parseTimeline(fv(task, timelineCol?.id));
      if (tl) { dates.push(tl.start, tl.end); }
      const dd = parseDueDate(fv(task, dueDateCol?.id));
      if (dd) dates.push(dd);
    }
    const minDate = startOfDay(new Date(Math.min(...dates.map((d) => d.getTime()))));
    const maxDate = startOfDay(new Date(Math.max(...dates.map((d) => d.getTime()))));
    const paddedStart = addDays(minDate, -14);
    const paddedEnd = addDays(maxDate, 14);
    const total = Math.max(diffDays(paddedStart, paddedEnd) + 1, 90);
    return { start: paddedStart, days: total };
  }, [allTasks, timelineCol, dueDateCol, fv]);

  const [manualView, setManualView] = useState<{ start: Date; days: number } | null>(null);

  const viewStart = manualView?.start ?? autoView.start;
  const totalDays = manualView?.days ?? autoView.days;
  const viewEnd = addDays(viewStart, totalDays - 1);
  const activePeriodDays = manualView?.days ?? null;

  const handlePeriod = (d: number) => {
    const center = addDays(viewStart, Math.floor(totalDays / 2));
    setManualView({ start: addDays(center, -Math.floor(d / 2)), days: d });
  };
  const handlePrev = () => {
    const d = manualView?.days ?? 90;
    setManualView({ start: addDays(viewStart, -d), days: d });
  };
  const handleNext = () => {
    const d = manualView?.days ?? 90;
    setManualView({ start: addDays(viewStart, d), days: d });
  };
  const handleGoToday = () => {
    const today = startOfDay(new Date());
    const d = manualView?.days ?? 90;
    setManualView({ start: addDays(today, -Math.floor(d / 3)), days: d });
  };

  // Group tasks by owner
  const ownerGroups = useMemo(() => {
    const map = new Map<string, typeof allTasks>();

    for (const entry of allTasks) {
      const owner = fv(entry.task, ownerCol?.id) || "— Sans responsable";
      if (!map.has(owner)) map.set(owner, []);
      map.get(owner)!.push(entry);
    }

    // Sort: named owners first (alphabetically), "Sans responsable" last
    const sorted = Array.from(map.entries()).sort(([a], [b]) => {
      if (a.startsWith("—") && !b.startsWith("—")) return 1;
      if (!a.startsWith("—") && b.startsWith("—")) return -1;
      return a.localeCompare(b, "fr");
    });

    return sorted;
  }, [allTasks, ownerCol, fv]);

  // Today offset
  const todayOffset = diffDays(viewStart, startOfDay(new Date()));

  // Week header groups
  const weekGroups = useMemo(
    () => buildWeekGroups(viewStart, totalDays),
    [viewStart, totalDays]
  );

  // Scroll to today on mount
  const scrollRef = (el: HTMLDivElement | null) => {
    if (el && todayOffset > 0) {
      el.scrollLeft = Math.max(0, todayOffset * DAY_PX - el.clientWidth / 2);
    }
  };

  const handleFieldUpdate = useCallback(
    (columnId: string, value: string | null) => {
      if (!selectedTask) return;
      const taskId = selectedTask.task.id;
      startTransition(async () => {
        await upsertTaskField(taskId, columnId, value);
        router.refresh();
      });
    },
    [selectedTask, router]
  );

  const handleTitleUpdate = useCallback((title: string) => {
    if (!selectedTask) return;
    startTransition(async () => {
      await updateTaskTitle(selectedTask.task.id, title);
      router.refresh();
    });
  }, [selectedTask, router]);

  // ---- Dependency arrows ----
  const { tlArrows, tlTotalH } = useMemo(() => {
    const meta = new Map<string, { x1: number; x2: number; yMid: number }>();
    let yBase = 0;
    for (const [, ownerTasks] of ownerGroups) {
      const packed = packTasksIntoRows(
        ownerTasks.map(({ task }) => ({
          task,
          tl: parseTimeline(task.fieldValues.find((f) => f.columnId === timelineCol?.id)?.value ?? null),
          dd: parseDueDate(task.fieldValues.find((f) => f.columnId === dueDateCol?.id)?.value ?? null),
        })),
        viewStart
      );
      const rowCount = Math.max(...packed.map((r) => r.row + 1), 1);
      const sectionH = Math.max(OWNER_H, rowCount * (TASK_H + TASK_GAP) + 16);
      for (const { task, tl, dd, row } of packed) {
        const barTopY = yBase + 8 + row * (TASK_H + TASK_GAP);
        const yMid = barTopY + TASK_H / 2;
        let x1 = -1, x2 = -1;
        if (tl) {
          const startOff = diffDays(viewStart, tl.start);
          const endOff = diffDays(viewStart, tl.end);
          x1 = startOff * DAY_PX;
          x2 = x1 + Math.max((endOff - startOff + 1) * DAY_PX - 2, DAY_PX);
        } else if (dd) {
          const off = diffDays(viewStart, dd);
          x1 = off * DAY_PX + DAY_PX / 2 - 7;
          x2 = x1 + 14;
        }
        meta.set(task.id, { x1, x2, yMid });
      }
      yBase += sectionH;
    }
    const arrows: { x1: number; y1: number; x2: number; y2: number }[] = [];
    for (const [, ownerTasks] of ownerGroups) {
      for (const { task } of ownerTasks) {
        const from = meta.get(task.id);
        if (!from || from.x2 < 0) continue;
        for (const dep of (task as TaskWithFields).blockerDeps ?? []) {
          const to = meta.get(dep.blockedId);
          if (!to || to.x1 < 0) continue;
          arrows.push({ x1: from.x2, y1: from.yMid, x2: to.x1, y2: to.yMid });
        }
      }
    }
    return { tlArrows: arrows, tlTotalH: yBase };
  }, [ownerGroups, viewStart, timelineCol, dueDateCol]);

  const totalHeight = ownerGroups.reduce((acc, [, tasks]) => {
    const rows = packTasksIntoRows(tasks.map(({ task }) => ({
      task,
      tl: parseTimeline(fv(task, timelineCol?.id)),
      dd: parseDueDate(fv(task, dueDateCol?.id)),
    })), viewStart);
    const rowCount = Math.max(...rows.map((r) => r.row + 1), 1);
    return acc + Math.max(OWNER_H, rowCount * (TASK_H + TASK_GAP) + 16);
  }, 0);

  if (ownerCol === undefined && dueDateCol === undefined && timelineCol === undefined) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-20 text-gray-400">
        <svg className="w-12 h-12 mb-4 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <p className="text-sm font-medium">Aucune colonne de date</p>
        <p className="text-xs mt-1">Activez les colonnes Timeline, Due date ou Owner pour utiliser cette vue.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white dark:bg-gray-900">
      {/* Legend */}
      <div className="flex items-center gap-4 px-4 py-2 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-700 flex-shrink-0 text-xs text-gray-500 dark:text-gray-400">
        <span className="font-medium text-gray-700 dark:text-gray-300">Échéancier par responsable</span>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-2.5 rounded-sm bg-indigo-400" />
          <span>Période (Timeline)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rotate-45 bg-amber-400" style={{ borderRadius: 1 }} />
          <span>Échéance (Due date)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-px h-4 bg-rose-400" />
          <span>Aujourd&apos;hui</span>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-1 px-4 py-2 bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
        <button onClick={handlePrev} title="Période précédente" className="p-1.5 rounded-md text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M15 19l-7-7 7-7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <button onClick={handleGoToday} className="text-xs text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 rounded-md px-2.5 py-1 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer mx-0.5">
          Aujourd&apos;hui
        </button>
        <button onClick={handleNext} title="Période suivante" className="p-1.5 rounded-md text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <div className="w-px h-4 bg-gray-200 dark:bg-gray-600 mx-2 flex-shrink-0" />
        {PERIOD_OPTIONS.map((opt) => (
          <button
            key={opt.days}
            onClick={() => handlePeriod(opt.days)}
            className={`text-xs px-2.5 py-1 rounded-md transition-colors cursor-pointer ${activePeriodDays === opt.days ? "bg-indigo-600 text-white" : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"}`}
          >
            {opt.label}
          </button>
        ))}
        <button
          onClick={() => setManualView(null)}
          title="Ajuster à l'étendue des tâches"
          className={`text-xs px-2.5 py-1 rounded-md transition-colors cursor-pointer ml-1 ${!manualView ? "bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 font-medium" : "text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700"}`}
        >
          Auto
        </button>
      </div>

      {/* Scrollable grid */}
      <div className="flex flex-1 overflow-hidden">
        {/* Fixed left label column */}
        <div className="flex-shrink-0 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800" style={{ width: LABEL_W }}>
          {/* Header spacer */}
          <div className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50" style={{ height: 56 }} />
          {/* Owner labels */}
          {ownerGroups.map(([owner, tasks], idx) => {
            const colorSet = OWNER_COLORS[idx % OWNER_COLORS.length];
            const rows = packTasksIntoRows(tasks.map(({ task }) => ({
              task,
              tl: parseTimeline(fv(task, timelineCol?.id)),
              dd: parseDueDate(fv(task, dueDateCol?.id)),
            })), viewStart);
            const rowCount = Math.max(...rows.map((r) => r.row + 1), 1);
            const rowH = Math.max(OWNER_H, rowCount * (TASK_H + TASK_GAP) + 16);
            const isNoOwner = owner.startsWith("—");

            return (
              <div
                key={owner}
                className="flex items-start gap-2 px-3 py-2 border-b border-gray-100 dark:border-gray-700"
                style={{ height: rowH }}
              >
                <div className="w-6 h-6 rounded-full flex-shrink-0 mt-1 overflow-hidden">
                  {!isNoOwner && memberAvatars[owner] ? (
                    <img src={memberAvatars[owner]!} alt={owner} className="w-full h-full object-cover rounded-full" />
                  ) : (
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center ${isNoOwner ? "bg-gray-200 dark:bg-gray-600" : colorSet.bg}`}>
                      <span className={`text-[9px] font-bold ${isNoOwner ? "text-gray-500 dark:text-gray-300" : colorSet.text}`}>
                        {isNoOwner ? "?" : owner.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate leading-tight mt-1">
                    {isNoOwner ? "Sans responsable" : owner}
                  </p>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500">{tasks.length} tâche{tasks.length !== 1 ? "s" : ""}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Scrollable area */}
        <div ref={scrollRef} className="flex-1 overflow-x-auto overflow-y-auto">
          <div style={{ width: totalDays * DAY_PX, minWidth: "100%" }}>
            {/* ---- Week header row ---- */}
            <div className="flex border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50 sticky top-0 z-10" style={{ height: 28 }}>
              {weekGroups.map((wg) => (
                <div
                  key={wg.offset}
                  className="flex-shrink-0 flex items-center justify-center border-r border-gray-200 dark:border-gray-700 text-[10px] font-medium text-gray-500 dark:text-gray-400 overflow-hidden"
                  style={{ width: wg.days * DAY_PX }}
                >
                  <span className="truncate px-1">{wg.label}</span>
                </div>
              ))}
            </div>

            {/* ---- Day header row ---- */}
            <div className="flex border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 sticky top-7 z-10" style={{ height: 28 }}>
              {Array.from({ length: totalDays }).map((_, i) => {
                const d = addDays(viewStart, i);
                const isToday = i === todayOffset;
                const weekend = isWeekend(d);
                return (
                  <div
                    key={i}
                    className={`flex-shrink-0 flex flex-col items-center justify-center border-r border-gray-100 dark:border-gray-700 ${weekend ? "bg-gray-50 dark:bg-gray-900/40" : ""} ${isToday ? "bg-rose-50 dark:bg-rose-900/20" : ""}`}
                    style={{ width: DAY_PX }}
                  >
                    <span className={`text-[9px] font-medium leading-none ${isToday ? "text-rose-600 dark:text-rose-400" : weekend ? "text-gray-400 dark:text-gray-600" : "text-gray-500 dark:text-gray-400"}`}>
                      {d.getDate()}
                    </span>
                    <span className={`text-[8px] leading-none mt-0.5 ${isToday ? "text-rose-400 dark:text-rose-500" : weekend ? "text-gray-300 dark:text-gray-600" : "text-gray-300 dark:text-gray-600"}`}>
                      {d.toLocaleDateString("fr-FR", { weekday: "short" }).slice(0, 2)}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* ---- Owner rows ---- */}
            <div style={{ position: "relative" }}>
              {/* Today vertical line */}
              {todayOffset >= 0 && todayOffset < totalDays && (
                <div
                  className="absolute top-0 bottom-0 w-px bg-rose-400 z-20 pointer-events-none"
                  style={{ left: todayOffset * DAY_PX + DAY_PX / 2 }}
                />
              )}

              {/* Dependency arrows overlay */}
              {tlArrows.length > 0 && (
                <svg
                  style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none", zIndex: 3 }}
                  width={totalDays * DAY_PX}
                  height={tlTotalH}
                >
                  <defs>
                    <marker id="tl-dep-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                      <path d="M0,0 L8,4 L0,8 L2,4 Z" fill="rgba(99,102,241,0.7)" />
                    </marker>
                  </defs>
                  {tlArrows.map((a, i) => {
                    const mx = (a.x1 + a.x2) / 2;
                    return (
                      <path
                        key={i}
                        d={`M${a.x1},${a.y1} C${mx},${a.y1} ${mx},${a.y2} ${a.x2},${a.y2}`}
                        fill="none"
                        stroke="rgba(99,102,241,0.6)"
                        strokeWidth="1.5"
                        strokeDasharray="5 3"
                        markerEnd="url(#tl-dep-arrow)"
                      />
                    );
                  })}
                </svg>
              )}
              {ownerGroups.map(([owner, tasks], idx) => {
                const colorSet = OWNER_COLORS[idx % OWNER_COLORS.length];
                const packedRows = packTasksIntoRows(
                  tasks.map(({ task }) => ({
                    task,
                    tl: parseTimeline(fv(task, timelineCol?.id)),
                    dd: parseDueDate(fv(task, dueDateCol?.id)),
                  })),
                  viewStart
                );
                const rowCount = Math.max(...packedRows.map((r) => r.row + 1), 1);
                const rowH = Math.max(OWNER_H, rowCount * (TASK_H + TASK_GAP) + 16);

                return (
                  <div
                    key={owner}
                    className="border-b border-gray-100 dark:border-gray-700 relative"
                    style={{ height: rowH }}
                  >
                    {/* Weekend shading */}
                    {Array.from({ length: totalDays }).map((_, i) => {
                      const d = addDays(viewStart, i);
                      if (!isWeekend(d)) return null;
                      return (
                        <div
                          key={i}
                          className="absolute top-0 bottom-0 bg-gray-50 dark:bg-gray-900/30 pointer-events-none"
                          style={{ left: i * DAY_PX, width: DAY_PX }}
                        />
                      );
                    })}

                    {/* Task bars */}
                    {packedRows.flatMap(({ task, tl, dd, row }) => {
                      const group = project.groups.find((g) => g.tasks.some((t) => t.id === task.id))!;
                      const barY = 8 + row * (TASK_H + TASK_GAP);
                      const isDone = fv(task, statusCol?.id) === "DONE";
                      const items: React.ReactNode[] = [];

                      if (tl) {
                        const startOff = diffDays(viewStart, tl.start);
                        const endOff = diffDays(viewStart, tl.end);
                        const tlDelta = getDisplayDelta(task.id, "timeline");
                        const tlDeltaForEdge = dragDelta?.taskId === task.id && dragDelta.type === "timeline" ? dragDelta.edge : undefined;
                        const committedForEdge = committedDelta?.taskId === task.id && committedDelta.type === "timeline" ? committedDelta.edge : undefined;
                        const activeEdge = tlDeltaForEdge ?? committedForEdge;
                        const barX = activeEdge === "right" ? startOff * DAY_PX : (startOff + tlDelta) * DAY_PX;
                        const baseDays = endOff - startOff + 1;
                        const barW = activeEdge === "left"
                          ? Math.max((baseDays - tlDelta) * DAY_PX - 2, DAY_PX)
                          : activeEdge === "right"
                          ? Math.max((baseDays + tlDelta) * DAY_PX - 2, DAY_PX)
                          : Math.max(baseDays * DAY_PX - 2, DAY_PX);
                        const isDraggingBar = dragDelta?.taskId === task.id && dragDelta.type === "timeline";

                        const makeHandlePointerDown = (edge: "left" | "right") => (e: React.PointerEvent) => {
                          if (e.button !== 0) return;
                          e.stopPropagation();
                          e.preventDefault();
                          dragRef.current = {
                            taskId: task.id,
                            type: "timeline",
                            edge,
                            startClientX: e.clientX,
                            dragged: false,
                            lastDays: 0,
                            originalTl: tl,
                            originalDd: null,
                          };
                          (e.currentTarget as Element).setPointerCapture(e.pointerId);
                        };

                        items.push(
                          <div
                            key={task.id + "-bar"}
                            className={`absolute group/bar flex items-center px-2 rounded select-none transition-opacity ${colorSet.bar} ${isDone ? "opacity-40" : ""} ${isDraggingBar ? "opacity-80 shadow-lg" : "hover:opacity-90"}`}
                            style={{
                              left: barX,
                              top: barY,
                              width: barW,
                              height: TASK_H,
                              cursor: isDraggingBar ? "grabbing" : "grab",
                              userSelect: "none",
                            }}
                            title={task.title}
                            onPointerDown={(e) => {
                              if (e.button !== 0) return;
                              e.stopPropagation();
                              dragRef.current = {
                                taskId: task.id,
                                type: "timeline",
                                startClientX: e.clientX,
                                dragged: false,
                                lastDays: 0,
                                originalTl: tl,
                                originalDd: dd,
                              };
                              e.currentTarget.setPointerCapture(e.pointerId);
                            }}
                            onPointerMove={(e) => {
                              const dr = dragRef.current;
                              if (!dr || dr.taskId !== task.id || dr.type !== "timeline") return;
                              const deltaX = e.clientX - dr.startClientX;
                              if (!dr.dragged && Math.abs(deltaX) >= DAY_PX / 2) dr.dragged = true;
                              if (dr.dragged) {
                                const days = Math.round(deltaX / DAY_PX);
                                dr.lastDays = days;
                                setDragDelta({ taskId: task.id, days, type: "timeline", edge: dr.edge });
                              }
                            }}
                            onPointerUp={(e) => {
                              const dr = dragRef.current;
                              if (!dr || dr.taskId !== task.id || dr.type !== "timeline") return;
                              const days = dr.lastDays;
                              const didDrag = dr.dragged;
                              dragRef.current = null;
                              if (!didDrag) { setDragDelta(null); return; }
                              justDragged.current = true;
                              if (days !== 0) setCommittedDelta({ taskId: task.id, days, type: "timeline", edge: dr.edge });
                              setDragDelta(null);
                              if (days === 0 || !dr.originalTl || !timelineCol) return;
                              let ns = dr.originalTl.start, ne = dr.originalTl.end;
                              if (!dr.edge) { ns = addDays(ns, days); ne = addDays(ne, days); }
                              else if (dr.edge === "left") { ns = addDays(ns, days); if (ns >= ne) ns = addDays(ne, -1); }
                              else { ne = addDays(ne, days); if (ne <= ns) ne = addDays(ns, 1); }
                              startTransition(async () => {
                                await upsertTaskField(task.id, timelineCol.id, JSON.stringify({
                                  start: toLocalDateStr(ns),
                                  end: toLocalDateStr(ne),
                                }));
                                router.refresh();
                              });
                            }}
                            onClick={() => {
                              if (justDragged.current) { justDragged.current = false; return; }
                              setSelectedTask({ task, groupName: group.name, groupColor: group.color });
                            }}
                          >
                            {/* Left resize handle */}
                            <div
                              className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize z-30 flex items-center justify-center opacity-0 group-hover/bar:opacity-100 transition-opacity"
                              onPointerDown={makeHandlePointerDown("left")}
                            >
                              <div className="w-0.5 h-3 bg-white/60 rounded-full" />
                            </div>
                            {barW > 40 && (
                              <span className="flex items-center gap-1 pointer-events-none min-w-0">
                                <span className="text-[10px] font-medium text-white truncate leading-tight">
                                  {task.title}
                                </span>
                                {task.recurrence && (
                                  <span title={recurrenceLabel(task.recurrence) ?? undefined} className="flex-shrink-0">
                                    <svg className="w-2.5 h-2.5 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M17 2l4 4-4 4" /><path d="M3 11V9a4 4 0 014-4h14" />
                                      <path d="M7 22l-4-4 4-4" /><path d="M21 13v2a4 4 0 01-4 4H3" />
                                    </svg>
                                  </span>
                                )}
                              </span>
                            )}
                            {/* Right resize handle */}
                            <div
                              className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize z-30 flex items-center justify-center opacity-0 group-hover/bar:opacity-100 transition-opacity"
                              onPointerDown={makeHandlePointerDown("right")}
                            >
                              <div className="w-0.5 h-3 bg-white/60 rounded-full" />
                            </div>
                          </div>
                        );
                      }

                      if (dd) {
                        const ddDelta = getDisplayDelta(task.id, "duedate");
                        const off = diffDays(viewStart, dd) + ddDelta;
                        const isOverdue = dd < new Date() && !isDone;
                        const isDraggingDd = dragDelta?.taskId === task.id && dragDelta.type === "duedate";
                        items.push(
                          <div
                            key={task.id + "-dd"}
                            className={`absolute flex items-center justify-center select-none ${isDraggingDd ? "opacity-80" : ""}`}
                            style={{
                              left: off * DAY_PX + DAY_PX / 2 - 7,
                              top: barY + 2,
                              width: 14,
                              height: 14,
                              transform: "rotate(45deg)",
                              borderRadius: 2,
                              zIndex: 5,
                              cursor: isDraggingDd ? "grabbing" : "grab",
                              userSelect: "none",
                            }}
                            title={`${task.title} — Échéance`}
                            onPointerDown={(e) => {
                              if (e.button !== 0) return;
                              e.stopPropagation();
                              dragRef.current = {
                                taskId: task.id,
                                type: "duedate",
                                startClientX: e.clientX,
                                dragged: false,
                                lastDays: 0,
                                originalTl: tl,
                                originalDd: dd,
                              };
                              e.currentTarget.setPointerCapture(e.pointerId);
                            }}
                            onPointerMove={(e) => {
                              const dr = dragRef.current;
                              if (!dr || dr.taskId !== task.id || dr.type !== "duedate") return;
                              const deltaX = e.clientX - dr.startClientX;
                              if (!dr.dragged && Math.abs(deltaX) >= DAY_PX / 2) dr.dragged = true;
                              if (dr.dragged) {
                                const days = Math.round(deltaX / DAY_PX);
                                dr.lastDays = days;
                                setDragDelta({ taskId: task.id, days, type: "duedate" });
                              }
                            }}
                            onPointerUp={(e) => {
                              const dr = dragRef.current;
                              if (!dr || dr.taskId !== task.id || dr.type !== "duedate") return;
                              const days = dr.lastDays;
                              const didDrag = dr.dragged;
                              dragRef.current = null;
                              if (!didDrag) { setDragDelta(null); return; }
                              justDragged.current = true;
                              if (days !== 0) setCommittedDelta({ taskId: task.id, days, type: "duedate" });
                              setDragDelta(null);
                              if (days === 0 || !dueDateCol) return;
                              const nd = addDays(dd, days);
                              startTransition(async () => {
                                await upsertTaskField(task.id, dueDateCol.id, toLocalDateStr(nd));
                                router.refresh();
                              });
                            }}
                            onClick={() => {
                              if (justDragged.current) { justDragged.current = false; return; }
                              setSelectedTask({ task, groupName: group.name, groupColor: group.color });
                            }}
                          >
                            <div className={`w-full h-full rounded-sm ${isOverdue ? "bg-red-400" : "bg-amber-400"} hover:opacity-80 transition-opacity`} />
                          </div>
                        );
                      }

                      // Ghost recurrence bars
                      if (task.recurrence) {
                        const cfg = parseRecurrence(task.recurrence ?? null);
                        const recurrenceEnd = cfg?.endDate ? new Date(`${cfg.endDate}T00:00:00`) : null;
                        if (cfg) {
                          for (let i = 1; i <= 24; i++) {
                            if (tl) {
                              const gs = shiftByRecurrence(tl.start, cfg, i);
                              if (recurrenceEnd && gs > recurrenceEnd) break;
                              if (gs > viewEnd) break;
                              const ge = shiftByRecurrence(tl.end, cfg, i);
                              const clampedGe = recurrenceEnd && ge > recurrenceEnd ? recurrenceEnd : ge;
                              const gStartOff = diffDays(viewStart, gs);
                              const gEndOff = diffDays(viewStart, clampedGe);
                              const gX = gStartOff * DAY_PX;
                              const gW = Math.max((gEndOff - gStartOff + 1) * DAY_PX - 2, DAY_PX);
                              items.push(
                                <div
                                  key={task.id + `-ghost-tl-${i}`}
                                  className="absolute rounded border border-dashed border-indigo-300 bg-indigo-100/60 pointer-events-none"
                                  style={{ left: gX, top: barY, width: gW, height: TASK_H, zIndex: 4 }}
                                />
                              );
                            } else if (dd) {
                              const gd = shiftByRecurrence(dd, cfg, i);
                              if (recurrenceEnd && gd > recurrenceEnd) break;
                              if (gd > viewEnd) break;
                              const gOff = diffDays(viewStart, gd);
                              items.push(
                                <div
                                  key={task.id + `-ghost-dd-${i}`}
                                  className="absolute pointer-events-none"
                                  style={{
                                    left: gOff * DAY_PX + DAY_PX / 2 - 7,
                                    top: barY + 2,
                                    width: 14,
                                    height: 14,
                                    transform: "rotate(45deg)",
                                    borderRadius: 2,
                                    zIndex: 4,
                                    border: "1px dashed #fbbf24",
                                    backgroundColor: "rgba(251,191,36,0.2)",
                                  }}
                                />
                              );
                            }
                          }
                        }
                      }

                      return items;
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Task detail panel */}
      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask.task}
          columns={allColumns}
          groupName={selectedTask.groupName}
          groupColor={selectedTask.groupColor}
          projectId={project.id}
          onClose={() => setSelectedTask(null)}
          onFieldUpdate={handleFieldUpdate}
          onTitleUpdate={handleTitleUpdate}
        />
      )}
    </div>
  );
}

// ---- Task packing algorithm ----
// Assigns tasks to rows so they don't overlap horizontally
function packTasksIntoRows(
  tasks: { task: TaskWithFields; tl: { start: Date; end: Date } | null; dd: Date | null }[],
  viewStart: Date
) {
  const result: { task: TaskWithFields; tl: { start: Date; end: Date } | null; dd: Date | null; row: number }[] = [];
  const rowEndOffsets: number[] = []; // track where each row ends (in days)

  for (const { task, tl, dd } of tasks) {
    if (!tl && !dd) {
      result.push({ task, tl, dd, row: 0 });
      continue;
    }

    let startOff: number;
    let endOff: number;

    if (tl) {
      startOff = diffDays(viewStart, tl.start);
      endOff = diffDays(viewStart, tl.end);
    } else {
      const off = diffDays(viewStart, dd!);
      startOff = off;
      endOff = off;
    }

    // Find a row that is free at startOff
    let assignedRow = -1;
    for (let r = 0; r < rowEndOffsets.length; r++) {
      if (rowEndOffsets[r] < startOff - 1) {
        assignedRow = r;
        break;
      }
    }
    if (assignedRow === -1) {
      assignedRow = rowEndOffsets.length;
      rowEndOffsets.push(-Infinity);
    }
    rowEndOffsets[assignedRow] = endOff + 1;
    result.push({ task, tl, dd, row: assignedRow });
  }

  return result;
}
