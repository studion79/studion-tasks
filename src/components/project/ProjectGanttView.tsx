"use client";

import React, { useState, useMemo, useCallback, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { ProjectWithRelations, TaskWithFields } from "@/lib/types";
import { upsertTaskField, updateTaskTitle } from "@/lib/actions";
import { TaskDetailPanel } from "./TaskDetailPanel";
import { useProjectContext } from "./ProjectContext";

const DAY_PX = 32; // pixels per day
const ROW_H = 36; // px per task row
const LABEL_W = 220; // px for left label column

// ---- helpers ----

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

function formatMonthYear(d: Date) {
  return d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

function formatDay(d: Date) {
  return d.getDate().toString();
}

function formatWeekDay(d: Date) {
  return d.toLocaleDateString("fr-FR", { weekday: "short" }).slice(0, 2);
}

// Group consecutive days by month for the header
function buildMonthGroups(viewStart: Date, totalDays: number) {
  const groups: { label: string; days: number }[] = [];
  let cur = new Date(viewStart);
  let remaining = totalDays;

  while (remaining > 0) {
    const month = cur.getMonth();
    const year = cur.getFullYear();
    let count = 0;
    while (remaining > 0 && cur.getMonth() === month && cur.getFullYear() === year) {
      count++;
      remaining--;
      cur = addDays(cur, 1);
    }
    groups.push({ label: formatMonthYear(new Date(year, month, 1)), days: count });
  }
  return groups;
}

function hexToRgba(hex: string, alpha: number): string {
  if (!hex.startsWith("#") || hex.length !== 7) return `rgba(99,102,241,${alpha})`;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function getGroupBg(color: string) {
  return hexToRgba(color, 0.1);
}

// ---- Period options ----

const PERIOD_OPTIONS = [
  { label: "2 sem.", days: 14 },
  { label: "1 mois", days: 30 },
  { label: "3 mois", days: 90 },
  { label: "6 mois", days: 180 },
  { label: "1 an", days: 365 },
];

// ---- Main component ----

export function ProjectGanttView({ project }: { project: ProjectWithRelations }) {
  const { allColumns } = useProjectContext();
  const [selectedTask, setSelectedTask] = useState<{ task: TaskWithFields; groupName: string; groupColor: string } | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  // ---- Drag state ----
  const dragRef = useRef<{
    taskId: string;
    type: "timeline" | "duedate";
    edge?: "left" | "right"; // undefined = move whole bar
    startClientX: number;
    dragged: boolean;
    lastDays: number;
    originalTl: { start: Date; end: Date } | null;
    originalDd: Date | null;
  } | null>(null);
  type DeltaState = { taskId: string; days: number; type: "timeline" | "duedate"; edge?: "left" | "right" };
  const [dragDelta, setDragDelta] = useState<DeltaState | null>(null);
  const [committedDelta, setCommittedDelta] = useState<DeltaState | null>(null);
  const justDragged = useRef(false);

  useEffect(() => { setCommittedDelta(null); }, [project]);

  const getDisplayDelta = (taskId: string, type: "timeline" | "duedate"): { days: number; edge?: "left" | "right" } => {
    const d = dragDelta?.taskId === taskId && dragDelta.type === type ? dragDelta
              : committedDelta?.taskId === taskId && committedDelta.type === type ? committedDelta
              : null;
    return d ? { days: d.days, edge: d.edge } : { days: 0 };
  };

  // Find relevant columns — use allColumns (includes inactive) so bars appear
  // even when TIMELINE/DUE_DATE are hidden in the spreadsheet view
  const timelineCol = allColumns.find((c) => c.type === "TIMELINE");
  const dueDateCol = allColumns.find((c) => c.type === "DUE_DATE");

  // Flatten all tasks
  const allTasks = useMemo(
    () =>
      project.groups.flatMap((g) =>
        g.tasks.map((t) => ({ task: t as TaskWithFields, group: g }))
      ),
    [project]
  );

  // ---- Period / navigation ----
  const autoView = useMemo(() => {
    const t = startOfDay(new Date());
    const dates: Date[] = [];
    allTasks.forEach(({ task }) => {
      if (timelineCol) {
        const tl = parseTimeline(task.fieldValues.find((f) => f.columnId === timelineCol.id)?.value ?? null);
        if (tl) { dates.push(tl.start, tl.end); }
      }
      if (dueDateCol) {
        const dd = parseDueDate(task.fieldValues.find((f) => f.columnId === dueDateCol.id)?.value ?? null);
        if (dd) dates.push(dd);
      }
    });
    if (dates.length === 0) return { start: addDays(t, -14), days: 90 };
    const min = startOfDay(new Date(Math.min(...dates.map((d) => d.getTime()))));
    const max = startOfDay(new Date(Math.max(...dates.map((d) => d.getTime()))));
    const start = addDays(min, -7);
    const end = addDays(max, 14);
    return { start, days: Math.max(diffDays(start, end), 30) };
  }, [allTasks, timelineCol, dueDateCol]);

  const [manualView, setManualView] = useState<{ start: Date; days: number } | null>(null);

  const viewStart = manualView?.start ?? autoView.start;
  const totalDays = manualView?.days ?? autoView.days;
  const activePeriodDays = manualView?.days ?? null;

  const today = startOfDay(new Date());
  const todayOffset = diffDays(viewStart, today);
  const monthGroups = useMemo(() => buildMonthGroups(viewStart, totalDays), [viewStart, totalDays]);
  const days = useMemo(() => Array.from({ length: totalDays }, (_, i) => addDays(viewStart, i)), [viewStart, totalDays]);

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
    const d = manualView?.days ?? 90;
    setManualView({ start: addDays(today, -Math.floor(d / 3)), days: d });
  };

  const handleFieldUpdate = useCallback(
    (columnId: string, value: string | null) => {
      if (!selectedTask) return;
      startTransition(async () => {
        await upsertTaskField(selectedTask.task.id, columnId, value);
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
  const { ganttArrows, ganttTotalH } = useMemo(() => {
    const meta = new Map<string, { x1: number; x2: number; yMid: number }>();
    let y = 0;
    for (const group of project.groups) {
      y += ROW_H; // group header row
      for (const task of group.tasks) {
        const tField = timelineCol
          ? task.fieldValues.find((f) => f.columnId === timelineCol.id)?.value ?? null
          : null;
        const ddField = dueDateCol
          ? task.fieldValues.find((f) => f.columnId === dueDateCol.id)?.value ?? null
          : null;
        const tl = parseTimeline(tField);
        const dd = parseDueDate(ddField);
        let x1 = -1, x2 = -1;
        if (tl) {
          const s = diffDays(viewStart, tl.start);
          const d = Math.max(diffDays(tl.start, tl.end), 1);
          x1 = s * DAY_PX + 2;
          x2 = x1 + Math.max(d * DAY_PX - 4, 12);
        } else if (dd) {
          const s = diffDays(viewStart, dd);
          x1 = s * DAY_PX + 2;
          x2 = x1 + 12;
        }
        meta.set(task.id, { x1, x2, yMid: y + ROW_H / 2 });
        y += ROW_H;
      }
    }
    const arrows: { x1: number; y1: number; x2: number; y2: number }[] = [];
    for (const group of project.groups) {
      for (const task of group.tasks as TaskWithFields[]) {
        const from = meta.get(task.id);
        if (!from || from.x2 < 0) continue;
        for (const dep of task.blockerDeps ?? []) {
          const to = meta.get(dep.blockedId);
          if (!to || to.x1 < 0) continue;
          arrows.push({ x1: from.x2, y1: from.yMid, x2: to.x1, y2: to.yMid });
        }
      }
    }
    return { ganttArrows: arrows, ganttTotalH: y };
  }, [project, viewStart, timelineCol, dueDateCol]);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white dark:bg-gray-900">
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
      {/* ── Main ── */}
      <div className="flex flex-1 overflow-hidden">
      {/* ── Left label column (fixed) ── */}
      <div
        className="flex-shrink-0 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 z-10"
        style={{ width: LABEL_W }}
      >
        {/* Header spacer */}
        <div className="h-[56px] border-b border-gray-200 dark:border-gray-700" />

        {/* Group rows */}
        {project.groups.map((group) => (
          <div key={group.id}>
            {/* Group header */}
            <div
              className="flex items-center gap-2 px-4 py-2 border-b border-gray-100 dark:border-gray-700"
              style={{ height: ROW_H, background: getGroupBg(group.color) }}
            >
              <div
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: group.color }}
              />
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 truncate">{group.name}</span>
              <span className="ml-auto text-[10px] text-gray-400 dark:text-gray-500">{group.tasks.length}</span>
            </div>

            {/* Task rows */}
            {group.tasks.map((task) => (
              <div
                key={task.id}
                onClick={() => setSelectedTask({ task: task as TaskWithFields, groupName: group.name, groupColor: group.color })}
                className="flex items-center px-4 border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors group"
                style={{ height: ROW_H }}
              >
                <span className="text-xs text-gray-700 dark:text-gray-300 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                  {task.title}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* ── Scrollable timeline ── */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden relative">
        <div style={{ width: totalDays * DAY_PX, minHeight: "100%" }}>
          {/* Month header */}
          <div className="flex border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 sticky top-0 z-10">
            {monthGroups.map((m, i) => (
              <div
                key={i}
                className="border-r border-gray-100 dark:border-gray-700 px-2 py-1.5 flex-shrink-0"
                style={{ width: m.days * DAY_PX }}
              >
                <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {m.label}
                </span>
              </div>
            ))}
          </div>

          {/* Day sub-header */}
          <div className="flex border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 sticky top-[30px] z-10">
            {days.map((d, i) => {
              const isToday = diffDays(viewStart, d) === todayOffset;
              const isWeekend = d.getDay() === 0 || d.getDay() === 6;
              return (
                <div
                  key={i}
                  className={[
                    "flex-shrink-0 flex flex-col items-center justify-center border-r text-[10px] leading-none",
                    isToday
                      ? "bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-700 text-indigo-600 dark:text-indigo-400 font-bold"
                      : isWeekend
                      ? "bg-gray-50 dark:bg-gray-900/40 border-gray-100 dark:border-gray-700 text-gray-400 dark:text-gray-600"
                      : "border-gray-100 dark:border-gray-700 text-gray-400 dark:text-gray-500",
                  ].join(" ")}
                  style={{ width: DAY_PX, height: 26 }}
                >
                  <span>{formatWeekDay(d)}</span>
                  <span className="mt-0.5">{formatDay(d)}</span>
                </div>
              );
            })}
          </div>

          {/* Rows */}
          <div className="relative">
          {project.groups.map((group) => (
            <div key={group.id}>
              {/* Group header row */}
              <div
                className="border-b border-gray-100 dark:border-gray-700 relative"
                style={{ height: ROW_H, background: getGroupBg(group.color) }}
              >
                {/* Weekend shading */}
                {days.map((d, i) =>
                  d.getDay() === 0 || d.getDay() === 6 ? (
                    <div
                      key={i}
                      className="absolute top-0 bottom-0 opacity-30 bg-gray-200 dark:bg-gray-600"
                      style={{ left: i * DAY_PX, width: DAY_PX }}
                    />
                  ) : null
                )}
              </div>

              {/* Task rows */}
              {group.tasks.map((task) => {
                const tField = timelineCol
                  ? task.fieldValues.find((f) => f.columnId === timelineCol.id)?.value ?? null
                  : null;
                const ddField = dueDateCol
                  ? task.fieldValues.find((f) => f.columnId === dueDateCol.id)?.value ?? null
                  : null;

                const tl = parseTimeline(tField);
                const dd = parseDueDate(ddField);

                let barStart: number | null = null;
                let barDays: number | null = null;
                let isMilestone = false;

                if (tl) {
                  barStart = diffDays(viewStart, tl.start);
                  barDays = Math.max(diffDays(tl.start, tl.end), 1);
                } else if (dd) {
                  barStart = diffDays(viewStart, dd);
                  barDays = 1;
                  isMilestone = true;
                }

                return (
                  <div
                    key={task.id}
                    className="border-b border-gray-50 dark:border-gray-700/30 relative hover:bg-indigo-50/30 dark:hover:bg-indigo-900/20 transition-colors cursor-pointer"
                    style={{ height: ROW_H }}
                    onClick={() => {
                      if (justDragged.current) { justDragged.current = false; return; }
                      setSelectedTask({ task: task as TaskWithFields, groupName: group.name, groupColor: group.color });
                    }}
                  >
                    {/* Weekend shading */}
                    {days.map((d, i) =>
                      d.getDay() === 0 || d.getDay() === 6 ? (
                        <div
                          key={i}
                          className="absolute top-0 bottom-0 bg-gray-100/60 dark:bg-gray-700/30"
                          style={{ left: i * DAY_PX, width: DAY_PX }}
                        />
                      ) : null
                    )}

                    {/* Today line */}
                    {todayOffset >= 0 && todayOffset < totalDays && (
                      <div
                        className="absolute top-0 bottom-0 w-px bg-indigo-400/60 z-10"
                        style={{ left: todayOffset * DAY_PX + DAY_PX / 2 }}
                      />
                    )}

                    {/* Task bar */}
                    {barStart !== null && barDays !== null && (() => {
                      const dragType = isMilestone ? "duedate" : "timeline";
                      const { days: deltaDays, edge: deltaEdge } = getDisplayDelta(task.id, dragType);
                      const isDraggingThis = dragDelta?.taskId === task.id && dragDelta.type === dragType;

                      // Compute display position and size based on edge type
                      const displayLeft = deltaEdge === "left" ? (barStart + deltaDays) * DAY_PX + 2 : barStart * DAY_PX + 2;
                      const displayWidth = isMilestone ? 12
                        : deltaEdge === "left" ? Math.max((barDays - deltaDays) * DAY_PX - 4, 12)
                        : deltaEdge === "right" ? Math.max((barDays + deltaDays) * DAY_PX - 4, 12)
                        : Math.max(barDays * DAY_PX - 4, 12);

                      const makeHandlePointerDown = (edge: "left" | "right") => (e: React.PointerEvent) => {
                        if (e.button !== 0) return;
                        e.stopPropagation();
                        e.preventDefault();
                        dragRef.current = { taskId: task.id, type: dragType, edge, startClientX: e.clientX, dragged: false, lastDays: 0, originalTl: tl, originalDd: dd };
                        (e.currentTarget as Element).setPointerCapture(e.pointerId);
                      };

                      return (
                        <div
                          className={[
                            "absolute top-1/2 -translate-y-1/2 rounded z-20 flex items-center select-none group/bar",
                            isMilestone
                              ? "bg-amber-400 border border-amber-500"
                              : "bg-indigo-500 border border-indigo-600 hover:bg-indigo-600",
                            isDraggingThis ? "opacity-80 shadow-lg" : "",
                          ].join(" ")}
                          style={{
                            left: displayLeft + (deltaEdge ? 0 : deltaDays * DAY_PX),
                            width: displayWidth,
                            height: isMilestone ? 12 : 20,
                            borderRadius: isMilestone ? "50%" : undefined,
                            transform: isMilestone ? "translateY(-50%) rotate(45deg)" : undefined,
                            cursor: isDraggingThis ? "grabbing" : "grab",
                            userSelect: "none",
                          }}
                          title={task.title}
                          onPointerDown={(e) => {
                            if (e.button !== 0) return;
                            e.stopPropagation();
                            dragRef.current = { taskId: task.id, type: dragType, startClientX: e.clientX, dragged: false, lastDays: 0, originalTl: tl, originalDd: dd };
                            e.currentTarget.setPointerCapture(e.pointerId);
                          }}
                          onPointerMove={(e) => {
                            const dr = dragRef.current;
                            if (!dr || dr.taskId !== task.id) return;
                            const deltaX = e.clientX - dr.startClientX;
                            if (!dr.dragged && Math.abs(deltaX) >= DAY_PX / 2) dr.dragged = true;
                            if (dr.dragged) {
                              const days = Math.round(deltaX / DAY_PX);
                              dr.lastDays = days;
                              setDragDelta({ taskId: task.id, days, type: dr.type, edge: dr.edge });
                            }
                          }}
                          onPointerUp={(e) => {
                            const dr = dragRef.current;
                            if (!dr || dr.taskId !== task.id) return;
                            const days = dr.lastDays;
                            const didDrag = dr.dragged;
                            dragRef.current = null;
                            if (!didDrag) { setDragDelta(null); return; }
                            justDragged.current = true;
                            if (days !== 0) setCommittedDelta({ taskId: task.id, days, type: dr.type, edge: dr.edge });
                            setDragDelta(null);
                            if (days === 0) return;
                            if (dr.type === "timeline" && dr.originalTl && timelineCol) {
                              let ns = dr.originalTl.start, ne = dr.originalTl.end;
                              if (!dr.edge) { ns = addDays(ns, days); ne = addDays(ne, days); }
                              else if (dr.edge === "left") { ns = addDays(ns, days); if (ns >= ne) ns = addDays(ne, -1); }
                              else { ne = addDays(ne, days); if (ne <= ns) ne = addDays(ns, 1); }
                              startTransition(async () => {
                                await upsertTaskField(task.id, timelineCol.id, JSON.stringify({ start: toLocalDateStr(ns), end: toLocalDateStr(ne) }));
                                router.refresh();
                              });
                            } else if (dr.type === "duedate" && dr.originalDd && dueDateCol) {
                              const nd = addDays(dr.originalDd, days);
                              startTransition(async () => {
                                await upsertTaskField(task.id, dueDateCol.id, toLocalDateStr(nd));
                                router.refresh();
                              });
                            }
                          }}
                        >
                          {/* Left resize handle */}
                          {!isMilestone && (
                            <div
                              className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize z-30 flex items-center justify-center opacity-0 group-hover/bar:opacity-100 transition-opacity"
                              onPointerDown={makeHandlePointerDown("left")}
                            >
                              <div className="w-0.5 h-3 bg-white/60 rounded-full" />
                            </div>
                          )}
                          {!isMilestone && barDays * DAY_PX > 50 && (
                            <span className="flex items-center gap-1 pointer-events-none min-w-0 px-2">
                              <span className="text-[10px] text-white font-medium truncate leading-none">
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
                          {!isMilestone && (
                            <div
                              className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize z-30 flex items-center justify-center opacity-0 group-hover/bar:opacity-100 transition-opacity"
                              onPointerDown={makeHandlePointerDown("right")}
                            >
                              <div className="w-0.5 h-3 bg-white/60 rounded-full" />
                            </div>
                          )}
                        </div>
                      );
                    })()}
                    {/* Ghost recurrence bars */}
                    {task.recurrence && barStart !== null && (() => {
                      const cfg = parseRecurrence(task.recurrence ?? null);
                      if (!cfg) return null;
                      const recurrenceEnd = cfg.endDate ? new Date(`${cfg.endDate}T00:00:00`) : null;
                      const veDate = addDays(viewStart, totalDays - 1);
                      const ghosts: React.ReactNode[] = [];
                      for (let i = 1; i <= 24; i++) {
                        if (tl) {
                          const gs = shiftByRecurrence(tl.start, cfg, i);
                          if (recurrenceEnd && gs > recurrenceEnd) break;
                          if (gs > veDate) break;
                          const ge = shiftByRecurrence(tl.end, cfg, i);
                          const clampedGe = recurrenceEnd && ge > recurrenceEnd ? recurrenceEnd : ge;
                          const gStart = diffDays(viewStart, gs);
                          const gDays = Math.max(diffDays(gs, clampedGe), 1);
                          ghosts.push(
                            <div
                              key={i}
                              className="absolute top-1/2 -translate-y-1/2 rounded border border-dashed border-indigo-300 dark:border-indigo-700 bg-indigo-100/60 dark:bg-indigo-900/40 pointer-events-none"
                              style={{ left: gStart * DAY_PX + 2, width: Math.max(gDays * DAY_PX - 4, 12), height: 20, zIndex: 15 }}
                            />
                          );
                        } else if (dd) {
                          const gd = shiftByRecurrence(dd, cfg, i);
                          if (recurrenceEnd && gd > recurrenceEnd) break;
                          if (gd > veDate) break;
                          const gOff = diffDays(viewStart, gd);
                          ghosts.push(
                            <div
                              key={i}
                              className="absolute border border-dashed border-amber-300 dark:border-amber-700 bg-amber-100/60 dark:bg-amber-900/40 pointer-events-none"
                              style={{ left: gOff * DAY_PX + 2, top: "50%", width: 10, height: 10, transform: "translateY(-50%) rotate(45deg)", borderRadius: 1, zIndex: 15 }}
                            />
                          );
                        }
                      }
                      return ghosts.length > 0 ? <>{ghosts}</> : null;
                    })()}

                    {/* Due date marker (when timeline bar + due date both set) */}
                    {tl && dd && (() => {
                      const { days: ddDeltaDays } = getDisplayDelta(task.id, "duedate");
                      const ddOff = diffDays(viewStart, dd) + ddDeltaDays;
                      const isDraggingDd = dragDelta?.taskId === task.id && dragDelta.type === "duedate";
                      return (
                        <div
                          className={`absolute z-[21] bg-amber-400 border border-amber-500 select-none ${isDraggingDd ? "opacity-80 shadow-lg" : ""}`}
                          style={{
                            left: ddOff * DAY_PX + DAY_PX / 2 - 5,
                            top: "50%",
                            width: 10,
                            height: 10,
                            transform: "translateY(-50%) rotate(45deg)",
                            borderRadius: 1,
                            cursor: isDraggingDd ? "grabbing" : "grab",
                            userSelect: "none",
                          }}
                          title={`Échéance : ${dd.toLocaleDateString("fr-FR")}`}
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
                        />
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          ))}
          {/* Dependency arrows overlay */}
          {ganttArrows.length > 0 && (
            <svg
              style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none", zIndex: 3 }}
              width={totalDays * DAY_PX}
              height={ganttTotalH}
            >
              <defs>
                <marker id="gantt-dep-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                  <path d="M0,0 L8,4 L0,8 L2,4 Z" fill="rgba(99,102,241,0.7)" />
                </marker>
              </defs>
              {ganttArrows.map((a, i) => {
                const mx = (a.x1 + a.x2) / 2;
                return (
                  <path
                    key={i}
                    d={`M${a.x1},${a.y1} C${mx},${a.y1} ${mx},${a.y2} ${a.x2},${a.y2}`}
                    fill="none"
                    stroke="rgba(99,102,241,0.6)"
                    strokeWidth="1.5"
                    strokeDasharray="5 3"
                    markerEnd="url(#gantt-dep-arrow)"
                  />
                );
              })}
            </svg>
          )}
          </div>
        </div>
      </div>
      </div>

      {/* ── Task detail panel ── */}
      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask.task}
          groupName={selectedTask.groupName}
          groupColor={selectedTask.groupColor}
          columns={allColumns}
          projectId={project.id}
          onClose={() => setSelectedTask(null)}
          onFieldUpdate={handleFieldUpdate}
          onTitleUpdate={handleTitleUpdate}
        />
      )}
    </div>
  );
}
