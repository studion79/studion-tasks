"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import type { ProjectWithRelations, TaskWithFields } from "@/lib/types";
import { STATUS_OPTIONS } from "@/lib/constants";
import { getFieldValue } from "./cells";
import { TaskDetailPanel } from "./TaskDetailPanel";
import {
  createTask,
  updateTaskTitle as updateTaskTitleAction,
  upsertTaskField,
} from "@/lib/actions";
import { toCanonicalStatus } from "@/lib/status";
import { getUiLocale } from "@/lib/ui-locale";
import { localeFromPathname, tr } from "@/lib/i18n/client";
import { dateKeyFromValue, parseTimelineValue, splitDateTimeValue } from "@/lib/task-schedule";

// --- Calendar helpers ---

function getWeekdays(locale: string): string[] {
  const monday = new Date(Date.UTC(2024, 0, 1)); // Monday
  return Array.from({ length: 7 }).map((_, i) =>
    new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(
      new Date(monday.getTime() + i * 24 * 60 * 60 * 1000)
    )
  );
}

function getMonthLabel(locale: string, year: number, month: number): string {
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" })
    .format(new Date(year, month, 1));
}

function getCalendarDays(year: number, month: number): Date[] {
  // First day of month, convert to Mon-first (0=Mon … 6=Sun)
  const firstDow = new Date(year, month, 1).getDay();
  const offset = firstDow === 0 ? 6 : firstDow - 1;

  const days: Date[] = [];

  // Prev month overflow
  for (let i = offset; i > 0; i--) {
    days.push(new Date(year, month, 1 - i));
  }

  // Current month
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    days.push(new Date(year, month, d));
  }

  // Fill to complete rows (always at least 5 rows)
  let next = 1;
  const target = days.length <= 35 ? 35 : 42;
  while (days.length < target) {
    days.push(new Date(year, month + 1, next++));
  }

  return days;
}

function toLocalDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function minuteOfDay(time: string): number {
  const [h, m] = time.split(":").map((part) => Number.parseInt(part, 10));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

function dateFromKey(key: string): Date {
  return new Date(`${key}T00:00:00`);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function eachDateKeyBetween(startKey: string, endKey: string, maxSpanDays = 366): string[] {
  const start = dateFromKey(startKey);
  const end = dateFromKey(endKey);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
  const from = start <= end ? start : end;
  const to = start <= end ? end : start;
  const keys: string[] = [];
  let cursor = new Date(from);
  let count = 0;
  while (cursor <= to && count <= maxSpanDays) {
    keys.push(toLocalDateStr(cursor));
    cursor = addDays(cursor, 1);
    count += 1;
  }
  return keys;
}

type CalendarEntry = {
  task: TaskWithFields;
  isGhost: boolean;
  source: "due" | "timeline";
  allDay: boolean;
  startMinute: number | null;
  endMinute: number | null;
  label: string;
};

// --- Recurrence helpers ---
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

// --- Task chip ---
function TaskChip({
  task,
  statusColId,
  source,
  isDone,
  isGhost,
  locale,
  onClick,
}: {
  task: TaskWithFields;
  statusColId: string | null;
  source: "due" | "timeline";
  isDone?: boolean;
  isGhost?: boolean;
  locale: "fr" | "en";
  onClick: () => void;
}) {
  const statusVal = statusColId ? toCanonicalStatus(getFieldValue(task.fieldValues, statusColId)) : null;
  const statusMeta = STATUS_OPTIONS.find((o) => o.value === statusVal);

  // Use a thin left border colored by status
  const borderColor = statusMeta
    ? statusMeta.color.split(" ")[0].replace("bg-", "border-l-")
    : "border-l-gray-300";
  const sourceClasses =
    source === "due"
      ? "border-red-200 dark:border-red-800/60 hover:bg-red-50 dark:hover:bg-red-900/20"
      : "border-indigo-100 dark:border-indigo-700/60 hover:bg-indigo-50 dark:hover:bg-indigo-900/20";

  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={`${task.title}${isGhost ? ` (${tr(locale, "récurrent", "recurring")})` : ""}`}
      className={[
        "w-full text-left text-[11px] font-medium rounded px-1.5 py-0.5 truncate transition-colors cursor-pointer",
        "border border-l-2",
        isGhost
          ? `bg-indigo-50/40 dark:bg-indigo-900/20 text-gray-400 dark:text-gray-500 border-dashed border-gray-200 dark:border-gray-700 ${borderColor}`
          : `bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 ${sourceClasses} ${borderColor}`,
        isDone ? "opacity-55" : "",
      ].join(" ")}
    >
      {isGhost && <span className="mr-0.5 opacity-60">↻</span>}
      {task.title}
    </button>
  );
}

// --- Main ---
export function ProjectCalendarView({ project }: { project: ProjectWithRelations }) {
  const pathname = usePathname();
  const appLocale = localeFromPathname(pathname);
  const locale = getUiLocale();
  const isEn = appLocale === "en";
  const weekdays = getWeekdays(locale);
  const { columns } = project;
  const statusCol = columns.find((c) => c.type === "STATUS") ?? null;
  const dueDateCol = columns.find((c) => c.type === "DUE_DATE") ?? null;
  const timelineCol = columns.find((c) => c.type === "TIMELINE") ?? null;

  const allTasks = project.groups.flatMap((g) => g.tasks);
  const taskGroupMap = new Map(
    project.groups.flatMap((g) => g.tasks.map((t) => [t.id, g.id]))
  );

  const now = new Date();
  const nowYear = now.getFullYear();
  const nowMonth = now.getMonth();
  const today = toLocalDateStr(now);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [tasks, setTasks] = useState<TaskWithFields[]>(allTasks);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(true);
  const [mobileSelectedDate, setMobileSelectedDate] = useState(toLocalDateStr(now));
  const [viewMode, setViewMode] = useState<"month" | "day">("month");
  const [dayViewDate, setDayViewDate] = useState(toLocalDateStr(now));
  const [taskGroupOverrides, setTaskGroupOverrides] = useState<Record<string, string>>({});
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [isCreatingTaskFromDay, setIsCreatingTaskFromDay] = useState(false);
  const [, startTransition] = useTransition();

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  };
  const goToday = () => { setYear(now.getFullYear()); setMonth(now.getMonth()); };

  const calendarDays = getCalendarDays(year, month);
  const monthDays = calendarDays.filter((d) => d.getMonth() === month);

  // Build a map: dateStr → agenda entries (due date + timeline ranges)
  const tasksByDate = new Map<string, CalendarEntry[]>();
  const gridStart = calendarDays[0];
  const gridEnd = calendarDays[calendarDays.length - 1];

  for (const task of tasks) {
    const rawStatus = statusCol ? getFieldValue(task.fieldValues, statusCol.id) : null;
    const isDone = toCanonicalStatus(rawStatus) === "DONE";
    if (!showCompleted && isDone) continue;

    if (dueDateCol) {
      const dueVal = getFieldValue(task.fieldValues, dueDateCol.id);
      const dueParts = splitDateTimeValue(dueVal);
      const dueKey = dateKeyFromValue(dueVal);
      if (dueKey) {
        if (!tasksByDate.has(dueKey)) tasksByDate.set(dueKey, []);
        tasksByDate.get(dueKey)!.push({
          task,
          isGhost: false,
          source: "due",
          allDay: !dueParts.hasTime,
          startMinute: dueParts.hasTime ? minuteOfDay(dueParts.time) : null,
          endMinute: dueParts.hasTime ? Math.min(24 * 60, minuteOfDay(dueParts.time) + 30) : null,
          label: dueParts.hasTime ? dueParts.time : tr(appLocale, "Sans heure", "No time"),
        });

        const cfg = parseRecurrence(task.recurrence ?? null);
        if (cfg) {
          const baseDate = new Date(`${dueKey}T00:00:00`);
          const recurrenceEnd = cfg.endDate ? new Date(`${cfg.endDate}T00:00:00`) : null;
          for (let i = 1; i <= 366; i++) {
            const ghostDate = shiftByRecurrence(baseDate, cfg, i);
            if (recurrenceEnd && ghostDate > recurrenceEnd) break;
            if (ghostDate > gridEnd) break;
            if (ghostDate < gridStart) continue;
            const ghostKey = toLocalDateStr(ghostDate);
            if (!tasksByDate.has(ghostKey)) tasksByDate.set(ghostKey, []);
            tasksByDate.get(ghostKey)!.push({
              task,
              isGhost: true,
              source: "due",
              allDay: !dueParts.hasTime,
              startMinute: dueParts.hasTime ? minuteOfDay(dueParts.time) : null,
              endMinute: dueParts.hasTime ? Math.min(24 * 60, minuteOfDay(dueParts.time) + 30) : null,
              label: dueParts.hasTime ? dueParts.time : tr(appLocale, "Sans heure", "No time"),
            });
          }
        }
      }
    }

    if (timelineCol) {
      const timelineVal = getFieldValue(task.fieldValues, timelineCol.id);
      const timeline = parseTimelineValue(timelineVal);
      if (timeline?.start || timeline?.end) {
        const startParts = splitDateTimeValue(timeline.start ?? null);
        const endParts = splitDateTimeValue(timeline.end ?? null);
        const startKey = startParts.date || endParts.date;
        const endKey = endParts.date || startParts.date;
        if (startKey && endKey) {
          const dayKeys = eachDateKeyBetween(startKey, endKey, 180);
          for (const dayKey of dayKeys) {
            if (!tasksByDate.has(dayKey)) tasksByDate.set(dayKey, []);
            const isStart = dayKey === startKey;
            const isEnd = dayKey === endKey;
            const hasAnyTime = startParts.hasTime || endParts.hasTime;
            const startMinute = hasAnyTime
              ? (isStart && startParts.hasTime ? minuteOfDay(startParts.time) : 0)
              : null;
            let endMinute = hasAnyTime
              ? (isEnd && endParts.hasTime ? minuteOfDay(endParts.time) : 24 * 60)
              : null;
            if (startMinute !== null && endMinute !== null && endMinute <= startMinute) {
              endMinute = Math.min(24 * 60, startMinute + 30);
            }
            const labelStart = startParts.hasTime ? startParts.time : tr(appLocale, "Début", "Start");
            const labelEnd = endParts.hasTime ? endParts.time : tr(appLocale, "Fin", "End");
            const label = hasAnyTime ? `${labelStart} → ${labelEnd}` : tr(appLocale, "Période", "Period");
            tasksByDate.get(dayKey)!.push({
              task,
              isGhost: false,
              source: "timeline",
              allDay: !hasAnyTime,
              startMinute,
              endMinute,
              label,
            });
          }
        }
      }
    }
  }

  const handleTitleUpdate = (taskId: string, title: string) => {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, title } : t)));
    startTransition(async () => { await updateTaskTitleAction(taskId, title); });
  };

  const handleFieldUpdate = (taskId: string, columnId: string, value: string | null) => {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== taskId) return t;
        const rest = t.fieldValues.filter((fv) => fv.columnId !== columnId);
        return {
          ...t,
          fieldValues: value !== null
            ? [...rest, { id: `opt-${columnId}`, taskId, columnId, value, updatedAt: new Date() }]
            : rest,
        };
      })
    );
    startTransition(async () => { await upsertTaskField(taskId, columnId, value); });
  };

  const openTask = openTaskId ? tasks.find((t) => t.id === openTaskId) ?? null : null;
  const openGroupId = openTaskId ? (taskGroupOverrides[openTaskId] ?? taskGroupMap.get(openTaskId) ?? null) : null;
  const openGroup = openGroupId ? project.groups.find((g) => g.id === openGroupId) ?? null : null;

  const openCreatePanelForDate = async (dateStr: string) => {
    setMobileSelectedDate(dateStr);
    setDayViewDate(dateStr);
    if (isCreatingTaskFromDay) return;
    const targetGroupId = project.groups[0]?.id;
    if (!targetGroupId) {
      setCalendarError(tr(appLocale, "Aucune catégorie disponible.", "No category available."));
      return;
    }
    setCalendarError(null);
    setIsCreatingTaskFromDay(true);
    try {
      const created = await createTask(targetGroupId, tr(appLocale, "Nouvelle tâche", "New task"), "Calendar");
      if (dueDateCol) {
        await upsertTaskField(created.id, dueDateCol.id, dateStr);
      } else if (timelineCol) {
        await upsertTaskField(created.id, timelineCol.id, JSON.stringify({ start: dateStr }));
      }
      const nextTask: TaskWithFields = {
        ...created,
        fieldValues: dueDateCol
          ? [
              ...created.fieldValues.filter((field) => field.columnId !== dueDateCol.id),
              {
                id: `opt-${created.id}-${dueDateCol.id}`,
                taskId: created.id,
                columnId: dueDateCol.id,
                value: dateStr,
                updatedAt: new Date(),
              },
            ]
          : timelineCol
            ? [
                ...created.fieldValues.filter((field) => field.columnId !== timelineCol.id),
                {
                id: `opt-${created.id}-${timelineCol.id}`,
                taskId: created.id,
                columnId: timelineCol.id,
                value: JSON.stringify({ start: dateStr }),
                updatedAt: new Date(),
              },
            ]
          : created.fieldValues,
        subtasks: created.subtasks ?? [],
      };
      setTasks((prev) => [...prev, nextTask]);
      setTaskGroupOverrides((prev) => ({ ...prev, [created.id]: targetGroupId }));
      setOpenTaskId(created.id);
    } catch {
      setCalendarError(tr(appLocale, "Impossible de créer la tâche.", "Unable to create task."));
    } finally {
      setIsCreatingTaskFromDay(false);
    }
  };

  useEffect(() => {
    const selected = new Date(`${mobileSelectedDate}T00:00:00`);
    if (selected.getFullYear() === year && selected.getMonth() === month) return;
    const fallback = year === nowYear && month === nowMonth
      ? today
      : toLocalDateStr(new Date(year, month, 1));
    setMobileSelectedDate(fallback);
  }, [mobileSelectedDate, month, nowMonth, nowYear, today, year]);

  // Split days into weeks
  const weeks: Date[][] = [];
  for (let i = 0; i < calendarDays.length; i += 7) {
    weeks.push(calendarDays.slice(i, i + 7));
  }

  if (!dueDateCol && !timelineCol) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-gray-400">
        <p className="text-sm">{tr(appLocale, "Les colonnes \"Date d'échéance\" et \"Période\" sont inactives.", "The \"Due date\" and \"Timeline\" columns are not active.")}</p>
        <p className="text-xs mt-1 text-gray-300">{tr(appLocale, "Activez au moins l'une des deux depuis les paramètres du projet.", "Enable at least one of them in project settings.")}</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col h-full">
        {/* Calendar header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-3 sm:px-5 py-3 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
          <div className="flex items-center justify-between sm:justify-start gap-3 w-full sm:w-auto">
            <button
              onClick={prevMonth}
              className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M15 19l-7-7 7-7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-50 w-[10.5rem] sm:w-36 text-center truncate">
              {getMonthLabel(locale, year, month)}
            </h2>
            <button
              onClick={nextMonth}
              className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M9 5l7 7-7 7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 self-end sm:self-auto">
            <div className="inline-flex items-center rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden">
              <button
                onClick={() => setViewMode("month")}
                className={`px-2.5 py-1 text-[11px] sm:text-xs transition-colors cursor-pointer ${
                  viewMode === "month"
                    ? "bg-indigo-600 text-white"
                    : "bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                }`}
              >
                {tr(appLocale, "Mois", "Month")}
              </button>
              <button
                onClick={() => setViewMode("day")}
                className={`px-2.5 py-1 text-[11px] sm:text-xs transition-colors cursor-pointer ${
                  viewMode === "day"
                    ? "bg-indigo-600 text-white"
                    : "bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                }`}
              >
                {tr(appLocale, "Journée", "Day")}
              </button>
            </div>
            <button
              onClick={goToday}
              className="text-[11px] sm:text-xs whitespace-nowrap text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-600 rounded-lg px-2.5 sm:px-3 py-1 sm:py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer"
            >
              {tr(appLocale, "Auj.", "Today")}
            </button>
            <button
              onClick={() => setShowCompleted((prev) => !prev)}
              className={`text-[11px] sm:text-xs whitespace-nowrap px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg transition-colors cursor-pointer ${
                showCompleted
                  ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700"
                  : "text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
              }`}
            >
              {showCompleted ? tr(appLocale, "Masquer cochées", "Hide completed") : tr(appLocale, "Afficher cochées", "Show completed")}
            </button>
          </div>
        </div>

        {/* Mobile agenda */}
        {viewMode === "month" && (
        <div className="sm:hidden flex-1 overflow-y-auto">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {monthDays.map((day) => {
                const dateStr = toLocalDateStr(day);
                const selected = dateStr === mobileSelectedDate;
                const hasTasks = (tasksByDate.get(dateStr)?.length ?? 0) > 0;
                const isToday = dateStr === today;
                return (
                  <button
                    key={dateStr}
                    onClick={() => {
                      setMobileSelectedDate(dateStr);
                      setDayViewDate(dateStr);
                    }}
                    className={[
                      "min-w-[3.4rem] px-2 py-2 rounded-lg border text-center transition-colors cursor-pointer",
                      selected
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200",
                    ].join(" ")}
                  >
                    <p className="text-[10px] uppercase tracking-wide opacity-80">
                      {new Intl.DateTimeFormat(locale, { weekday: "short" }).format(day)}
                    </p>
                    <p className="text-sm font-semibold">{day.getDate()}</p>
                    <p className="text-[10px] opacity-80 leading-none truncate max-w-[3.3rem] mx-auto">
                      {isToday
                        ? tr(appLocale, "Auj.", "Today")
                        : hasTasks
                        ? `${tasksByDate.get(dateStr)!.length}`
                        : "·"}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="p-4 space-y-2">
            {(tasksByDate.get(mobileSelectedDate) ?? []).length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 px-4 py-6 text-center text-sm text-gray-400">
                {tr(appLocale, "Aucune tâche pour cette date", "No task for this date")}
              </div>
            ) : (
              (tasksByDate.get(mobileSelectedDate) ?? []).map(({ task, isGhost, source }) => {
                const rawStatus = statusCol ? getFieldValue(task.fieldValues, statusCol.id) : null;
                const isDone = toCanonicalStatus(rawStatus) === "DONE";
                return (
                  <TaskChip
                    key={`${task.id}-${mobileSelectedDate}-${isGhost ? "ghost" : "normal"}`}
                    task={task}
                    statusColId={statusCol?.id ?? null}
                    source={source}
                    isDone={isDone}
                    isGhost={isGhost}
                    locale={appLocale}
                    onClick={() => setOpenTaskId(task.id)}
                  />
                );
              })
            )}
          </div>
        </div>
        )}

        {/* Day agenda */}
        {viewMode === "day" && (
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dayViewDate}
                onChange={(e) => setDayViewDate(e.target.value)}
                className="datetime-field"
              />
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {new Date(`${dayViewDate}T12:00:00`).toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" })}
              </span>
              <button
                type="button"
                onClick={() => void openCreatePanelForDate(dayViewDate)}
                disabled={isCreatingTaskFromDay}
                className="ml-auto text-xs px-2.5 py-1 rounded-lg border border-indigo-200 dark:border-indigo-700 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors cursor-pointer"
              >
                {isCreatingTaskFromDay ? tr(appLocale, "Création…", "Creating...") : tr(appLocale, "Ajouter une tâche", "Add task")}
              </button>
            </div>
            {calendarError && (
              <p className="text-xs text-red-500">{calendarError}</p>
            )}
            {(tasksByDate.get(dayViewDate) ?? []).length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 px-4 py-8 text-center text-sm text-gray-400">
                {tr(appLocale, "Aucune tâche planifiée", "No scheduled task")}
              </div>
            ) : (
              (() => {
                const dayItems = [...(tasksByDate.get(dayViewDate) ?? [])];
                const timed = dayItems
                  .filter((item) => !item.allDay && item.startMinute !== null)
                  .sort((a, b) => (a.startMinute ?? 0) - (b.startMinute ?? 0));
                const allDay = dayItems
                  .filter((item) => item.allDay || item.startMinute === null)
                  .sort((a, b) => a.task.title.localeCompare(b.task.title));
                const hourHeight = 56;
                const dayHeight = hourHeight * 24;

                return (
                  <div className="space-y-4">
                    {allDay.length > 0 && (
                      <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 space-y-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                          {tr(appLocale, "Toute la journée", "All day")}
                        </p>
                        {allDay.map((item) => (
                          <button
                            key={`${item.task.id}-${item.source}-${item.isGhost ? "ghost" : "normal"}-allday`}
                            onClick={() => setOpenTaskId(item.task.id)}
                            className={`w-full text-left rounded-lg border px-3 py-2 transition-colors cursor-pointer ${
                              item.source === "due"
                                ? "border-red-200 dark:border-red-800/60 hover:bg-red-50 dark:hover:bg-red-900/20"
                                : "border-indigo-200 dark:border-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
                            }`}
                          >
                            <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{item.task.title}</p>
                            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                              {item.source === "timeline"
                                ? tr(appLocale, "Période sans horaire", "Period without time")
                                : tr(appLocale, "Échéance sans horaire", "Due date without time")}
                            </p>
                          </button>
                        ))}
                      </section>
                    )}

                    <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
                      <div className="relative" style={{ height: `${dayHeight}px` }}>
                        {Array.from({ length: 24 }).map((_, hour) => (
                          <div
                            key={`hour-${hour}`}
                            className="absolute left-0 right-0 border-t border-gray-100 dark:border-gray-700"
                            style={{ top: `${hour * hourHeight}px` }}
                          >
                            <span className="absolute -top-2 left-2 text-[10px] text-gray-400 dark:text-gray-500 bg-white dark:bg-gray-800 px-1">
                              {`${String(hour).padStart(2, "0")}:00`}
                            </span>
                          </div>
                        ))}

                        <div className="absolute inset-y-0 left-14 right-2">
                          {timed.map((item, index) => {
                            const start = Math.max(0, item.startMinute ?? 0);
                            const end = Math.max(start + 15, item.endMinute ?? start + 30);
                            const top = (start / 60) * hourHeight;
                            const height = Math.max(34, ((end - start) / 60) * hourHeight);
                            const rawStatus = statusCol ? getFieldValue(item.task.fieldValues, statusCol.id) : null;
                            const isDone = toCanonicalStatus(rawStatus) === "DONE";
                            return (
                              <button
                                key={`${item.task.id}-${item.source}-${item.isGhost ? "ghost" : "normal"}-${index}`}
                                onClick={() => setOpenTaskId(item.task.id)}
                                className={`absolute left-0 right-0 rounded-lg border px-2 py-1 text-left transition-colors cursor-pointer ${
                                  isDone
                                    ? "bg-gray-100 dark:bg-gray-700/70 border-gray-200 dark:border-gray-600 opacity-70"
                                    : item.source === "due"
                                      ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/60 hover:bg-red-100 dark:hover:bg-red-900/30"
                                      : "bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-700 hover:bg-indigo-100 dark:hover:bg-indigo-900/40"
                                }`}
                                style={{ top: `${top}px`, height: `${height}px` }}
                              >
                                <p className="text-xs font-semibold text-gray-800 dark:text-gray-100 truncate">{item.task.title}</p>
                                <p className="text-[10px] text-gray-600 dark:text-gray-300 truncate mt-0.5">{item.label}</p>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </section>
                  </div>
                );
              })()
            )}
          </div>
        )}

        {/* Weekday headers */}
        {viewMode === "month" && (
        <div className="hidden sm:grid grid-cols-7 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
          {weekdays.map((d) => (
            <div key={d} className="py-2 text-center text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
              {d}
            </div>
          ))}
        </div>
        )}

        {/* Calendar grid */}
        {viewMode === "month" && (
        <div className="hidden sm:block flex-1 overflow-y-auto">
          {weeks.map((week, wi) => (
            <div key={wi} className={`grid grid-cols-7 ${wi < weeks.length - 1 ? "border-b border-gray-100 dark:border-gray-700" : ""}`}>
              {week.map((day, di) => {
                const isCurrentMonth = day.getMonth() === month;
                const dateStr = toLocalDateStr(day);
                const isToday = dateStr === today;
                const dayTasks = tasksByDate.get(dateStr) ?? [];
                const MAX_VISIBLE = 3;
                const overflow = dayTasks.length - MAX_VISIBLE;

                return (
                  <div
                    key={di}
                    onClick={() => void openCreatePanelForDate(dateStr)}
                    className={[
                      "min-h-[100px] p-2 cursor-pointer",
                      di < 6 ? "border-r border-gray-100 dark:border-gray-700" : "",
                      isCurrentMonth
                        ? "bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/40"
                        : "bg-gray-50/60 dark:bg-gray-900/50 hover:bg-gray-100/70 dark:hover:bg-gray-800/60",
                    ].join(" ")}
                  >
                    {/* Day number */}
                    <div className="mb-1.5">
                      <span
                        className={[
                          "inline-flex w-6 h-6 items-center justify-center rounded-full text-xs font-medium",
                          isToday
                            ? "bg-indigo-600 text-white"
                            : isCurrentMonth
                            ? "text-gray-700 dark:text-gray-200"
                            : "text-gray-300 dark:text-gray-600",
                        ].join(" ")}
                      >
                        {day.getDate()}
                      </span>
                    </div>

                    {/* Tasks */}
                    <div className="space-y-0.5">
                      {dayTasks.slice(0, MAX_VISIBLE).map(({ task, isGhost, source }) => {
                        // Keep done tasks visible in calendar with reduced visual weight.
                        const rawStatus = statusCol ? getFieldValue(task.fieldValues, statusCol.id) : null;
                        const isDone = toCanonicalStatus(rawStatus) === "DONE";
                        return (
                          <TaskChip
                            key={`${task.id}-${source}-${isGhost ? "ghost" : "normal"}`}
                            task={task}
                            statusColId={statusCol?.id ?? null}
                            source={source}
                            isDone={isDone}
                            isGhost={isGhost}
                            locale={appLocale}
                            onClick={() => setOpenTaskId(task.id)}
                          />
                        );
                      })}
                      {overflow > 0 && (
                        <span className="text-[10px] text-gray-400 px-1">
                          +{overflow} {isEn ? "more" : `autre${overflow > 1 ? "s" : ""}`}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        )}
      </div>

      {/* Task detail panel */}
      {openTask && openGroup && (
        <TaskDetailPanel
          task={openTask}
          groupName={openGroup.name}
          groupColor={openGroup.color}
          columns={columns}
          projectId={project.id}
          onClose={() => setOpenTaskId(null)}
          onTitleUpdate={(title) => handleTitleUpdate(openTask.id, title)}
          onFieldUpdate={(columnId, value) => handleFieldUpdate(openTask.id, columnId, value)}
        />
      )}
    </>
  );
}
