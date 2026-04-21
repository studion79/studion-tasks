"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { getUiLocale } from "@/lib/ui-locale";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createQuickTask, toggleMyTask } from "@/lib/actions";
import { getStatusLabel, toCanonicalStatus } from "@/lib/status";
import { getPriorityLabelByLocale } from "@/lib/constants";
import { normalizeTimeInput } from "@/lib/time-input";
import { trKey } from "@/lib/i18n/client";
import { useClientLocale } from "@/lib/i18n/useClientLocale";
import { dateKeyFromValue, parseDateTimeToDate, parseTimelineValue, splitDateTimeValue } from "@/lib/task-schedule";
import { pickByIsEn, pickByLocale } from "@/lib/i18n/pick";

type MyTask = {
  id: string;
  title: string;
  completedAt: string | null;
  parentId: string | null;
  projectId: string;
  projectName: string;
  groupName: string;
  status: string | null;
  priority: string | null;
  dueDate: string | null;
  timeline?: string | null;
};

type Filter = "all" | "today" | "week" | "late" | "done" | "all_tasks";
type DisplayPrefs = {
  density: "compact" | "comfortable";
  mondayFirst: boolean;
  dateFormat: "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD";
  language: "fr" | "en";
};

type QuickProject = {
  id: string;
  name: string;
  isPersonal?: boolean;
  groups: { id: string; name: string }[];
};

type QuickSelectOption = {
  value: string;
  label: string;
  hint?: string;
};

type HierarchicalTaskRow = {
  task: MyTask;
  depth: number;
  hasChildren: boolean;
};

function PrettySelect({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  options: QuickSelectOption[];
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const selected = options.find((option) => option.value === value);

  const updateMenuPosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const margin = 8;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const width = Math.min(Math.max(rect.width, 180), viewportWidth - margin * 2);
    const left = Math.min(Math.max(rect.left, margin), viewportWidth - width - margin);
    const availableBelow = viewportHeight - rect.bottom - margin;
    const availableAbove = rect.top - margin;
    const openAbove = availableBelow < 180 && availableAbove > availableBelow;
    const maxHeight = Math.max(140, Math.min(260, openAbove ? availableAbove : availableBelow));
    const top = openAbove
      ? Math.max(margin, rect.top - maxHeight - 6)
      : Math.min(viewportHeight - maxHeight - margin, rect.bottom + 6);
    setMenuStyle({ top, left, width, maxHeight });
  }, []);

  useEffect(() => {
    if (!open) return;
    updateMenuPosition();
    const onClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onReposition = () => updateMenuPosition();
    document.addEventListener("mousedown", onClickOutside);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) setMenuStyle(null);
  }, [open]);

  return (
    <div className="relative min-w-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="w-full min-w-0 h-8 px-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-left text-xs text-gray-900 dark:text-gray-50 flex items-center justify-between hover:border-indigo-300 dark:hover:border-indigo-500 transition-colors cursor-pointer"
      >
        <span className={`truncate ${selected ? "text-gray-900 dark:text-gray-50" : "text-gray-400 dark:text-gray-500"}`}>
          {selected?.label ?? placeholder}
        </span>
        <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M19 9l-7 7-7-7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && menuStyle && createPortal(
        <div
          ref={menuRef}
          style={{
            position: "fixed",
            top: `${menuStyle.top}px`,
            left: `${menuStyle.left}px`,
            width: `${menuStyle.width}px`,
            maxHeight: `${menuStyle.maxHeight}px`,
            zIndex: 1200,
          }}
          className="overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-2xl ring-1 ring-black/5 dark:ring-white/10"
        >
          {options.map((option) => (
            <button
              type="button"
              key={option.value}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              className={`w-full text-left px-2.5 py-2 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors cursor-pointer ${
                value === option.value ? "bg-indigo-50 dark:bg-indigo-900/20" : ""
              }`}
            >
              <p className="text-xs text-gray-900 dark:text-gray-50 truncate">{option.label}</p>
              {option.hint && <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 truncate">{option.hint}</p>}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

const DEFAULT_DISPLAY_PREFS: DisplayPrefs = {
  density: "comfortable",
  mondayFirst: true,
  dateFormat: "DD/MM/YYYY",
  language: "fr",
};

const STATUS_COLORS: Record<string, string> = {
  DONE: "bg-green-100 text-green-700",
  WORKING: "bg-blue-100 text-blue-700",
  STUCK: "bg-red-100 text-red-700",
  NOT_STARTED: "bg-gray-100 text-gray-500",
  IN_REVIEW: "bg-purple-100 text-purple-700",
  WAITING: "bg-orange-100 text-orange-700",
};

const PRIORITY_COLORS: Record<string, string> = {
  Critical: "text-red-600",
  High: "text-orange-500",
  Medium: "text-yellow-500",
  Low: "text-blue-400",
};

function buildHierarchicalTaskRows(tasks: MyTask[]): HierarchicalTaskRow[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const order = new Map(tasks.map((task, index) => [task.id, index]));
  const childrenByParent = new Map<string, MyTask[]>();
  const roots: MyTask[] = [];

  for (const task of tasks) {
    if (task.parentId && byId.has(task.parentId)) {
      const children = childrenByParent.get(task.parentId) ?? [];
      children.push(task);
      childrenByParent.set(task.parentId, children);
    } else {
      roots.push(task);
    }
  }

  for (const children of childrenByParent.values()) {
    children.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  }

  const rows: HierarchicalTaskRow[] = [];
  const visited = new Set<string>();
  const visit = (task: MyTask, depth: number) => {
    if (visited.has(task.id)) return;
    visited.add(task.id);
    const children = childrenByParent.get(task.id) ?? [];
    rows.push({ task, depth, hasChildren: children.length > 0 });
    for (const child of children) visit(child, depth + 1);
  };

  roots.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  for (const root of roots) visit(root, 0);

  for (const task of tasks) {
    if (!visited.has(task.id)) visit(task, 0);
  }

  return rows;
}

function isToday(d: string | null) {
  const v = parseDateTimeToDate(d);
  if (!v) return false;
  const t = new Date();
  return v.getFullYear() === t.getFullYear() && v.getMonth() === t.getMonth() && v.getDate() === t.getDate();
}

function parseDate(s: string | null): Date | null {
  return parseDateTimeToDate(s);
}

function toDateKey(s: string | null): string | null {
  return dateKeyFromValue(s);
}

function isThisWeek(d: string | null, mondayFirst: boolean) {
  if (!d) return false;
  const now = new Date();
  const v = new Date(d);
  const weekStart = new Date(now);
  const day = now.getDay();
  const delta = mondayFirst ? (day === 0 ? 6 : day - 1) : day;
  weekStart.setDate(now.getDate() - delta);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);
  return v >= weekStart && v <= weekEnd;
}

function isLate(task: MyTask) {
  const due = parseDate(task.dueDate);
  if (!due || task.completedAt) return false;
  return due < new Date();
}

function isTaskInTodayPlan(task: MyTask): boolean {
  const now = new Date();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const keyToComparable = (value: string) => Number.parseInt(value.replaceAll("-", ""), 10);

  const timeline = parseTimelineValue(task.timeline ?? null);
  const startParts = splitDateTimeValue(timeline?.start ?? null);
  const endParts = splitDateTimeValue(timeline?.end ?? null);
  if (startParts.date || endParts.date) {
    const startDate = startParts.date || endParts.date;
    const endDate = endParts.date || startParts.date;
    if (startDate && endDate) {
      const todayComparable = keyToComparable(todayKey);
      const startComparable = keyToComparable(startDate);
      const endComparable = keyToComparable(endDate);
      if (startComparable <= todayComparable && todayComparable <= endComparable) return true;
    }
  }

  return splitDateTimeValue(task.dueDate).date === todayKey;
}

function fmtDate(d: string | null, format: DisplayPrefs["dateFormat"]) {
  const parts = splitDateTimeValue(d);
  if (!parts.date) return null;
  const v = new Date(`${parts.date}T12:00:00`);
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const tomorrowKey = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const yesterdayKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
  const isEn = getUiLocale().startsWith("en");
  if (parts.date === todayKey) return pickByIsEn(isEn, "Aujourd'hui", "Today");
  if (parts.date === tomorrowKey) return pickByIsEn(isEn, "Demain", "Tomorrow");
  if (parts.date === yesterdayKey) return pickByIsEn(isEn, "Hier", "Yesterday");
  if (format === "YYYY-MM-DD") {
    const yyyy = v.getFullYear();
    const mm = String(v.getMonth() + 1).padStart(2, "0");
    const dd = String(v.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  if (format === "MM/DD/YYYY") {
    return v.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
  }
  return v.toLocaleDateString(getUiLocale(), { day: "2-digit", month: "2-digit", year: "numeric" });
}

function MiniCalendar({
  tasks,
  selectedDate,
  onSelectDate,
  mondayFirst,
  locale,
}: {
  tasks: MyTask[];
  selectedDate: string | null;
  onSelectDate: (value: string | null) => void;
  mondayFirst: boolean;
  locale: "fr" | "en";
}) {
  const [offset, setOffset] = useState(0);
  const [feedbackDayKey, setFeedbackDayKey] = useState<string | null>(null);
  const base = new Date();
  const year = base.getFullYear();
  const month = base.getMonth() + offset;
  const viewDate = new Date(year, month, 1);
  const monthLabel = viewDate.toLocaleDateString(getUiLocale(), { month: "long", year: "numeric" });

  const firstDay = (() => {
    const day = viewDate.getDay();
    return mondayFirst ? (day === 0 ? 6 : day - 1) : day;
  })();
  const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();

  const tasksByDay: Record<number, MyTask[]> = {};
  const pushTaskForDay = (day: number, task: MyTask) => {
    if (!tasksByDay[day]) tasksByDay[day] = [];
    if (!tasksByDay[day].some((candidate) => candidate.id === task.id)) {
      tasksByDay[day].push(task);
    }
  };
  for (const task of tasks) {
    const due = parseDate(task.dueDate);
    if (due && due.getFullYear() === viewDate.getFullYear() && due.getMonth() === viewDate.getMonth()) {
      pushTaskForDay(due.getDate(), task);
    }

    const timeline = parseTimelineValue(task.timeline ?? null);
    const startParts = splitDateTimeValue(timeline?.start ?? null);
    const endParts = splitDateTimeValue(timeline?.end ?? null);
    const startDate = startParts.date || endParts.date;
    const endDate = endParts.date || startParts.date;
    if (!startDate || !endDate) continue;
    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
    const from = start <= end ? start : end;
    const to = start <= end ? end : start;
    let cursor = new Date(from);
    let spanGuard = 0;
    while (cursor <= to && spanGuard <= 120) {
      if (cursor.getFullYear() === viewDate.getFullYear() && cursor.getMonth() === viewDate.getMonth()) {
        pushTaskForDay(cursor.getDate(), task);
      }
      cursor.setDate(cursor.getDate() + 1);
      spanGuard += 1;
    }
  }

  const todayNum =
    base.getMonth() === viewDate.getMonth() && base.getFullYear() === viewDate.getFullYear()
      ? base.getDate()
      : -1;

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  useEffect(() => {
    if (!feedbackDayKey) return;
    const timer = window.setTimeout(() => setFeedbackDayKey((current) => (current === feedbackDayKey ? null : current)), 220);
    return () => window.clearTimeout(timer);
  }, [feedbackDayKey]);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <button onClick={() => setOffset((o) => o - 1)} className="p-1 rounded text-gray-400 hover:text-gray-600 cursor-pointer">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M15 19l-7-7 7-7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 capitalize">{monthLabel}</span>
        <button onClick={() => setOffset((o) => o + 1)} className="p-1 rounded text-gray-400 hover:text-gray-600 cursor-pointer">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>
      <div className="grid grid-cols-7 mb-1">
        {(() => {
          const mondayFirstDaysEn = ["M", "T", "W", "T", "F", "S", "S"];
          const mondayFirstDaysFr = ["L", "M", "M", "J", "V", "S", "D"];
          const sundayFirstDaysEn = ["S", "M", "T", "W", "T", "F", "S"];
          const sundayFirstDaysFr = ["D", "L", "M", "M", "J", "V", "S"];
          const days = mondayFirst
            ? pickByLocale(locale, mondayFirstDaysFr.join(","), mondayFirstDaysEn.join(","))
            : pickByLocale(locale, sundayFirstDaysFr.join(","), sundayFirstDaysEn.join(","));
          return days.split(",");
        })().map((d, i) => (
          <div key={i} className="text-center text-[10px] font-medium text-gray-400 dark:text-gray-500">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const dayTasks = tasksByDay[day] ?? [];
          const isTodayDay = day === todayNum;
          const hasLate = dayTasks.some((t) => isLate(t));
          const dayKey = `${viewDate.getFullYear()}-${String(viewDate.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const isSelected = selectedDate === dayKey;
          const shouldHighlightToday = isTodayDay && !selectedDate;
          return (
            <button
              key={i}
              onClick={() => {
                setFeedbackDayKey(dayKey);
                onSelectDate(isSelected ? null : dayKey);
              }}
              className={`flex flex-col items-center rounded-md py-0.5 cursor-pointer transition-all active:scale-95 ${
                isSelected
                  ? "bg-indigo-500/20 dark:bg-indigo-700/40"
                  : shouldHighlightToday
                    ? "bg-indigo-100 dark:bg-indigo-900/40"
                    : "hover:bg-gray-100 dark:hover:bg-gray-700/40"
              } ${feedbackDayKey === dayKey ? "scale-[0.97] shadow-[0_0_0_2px_rgba(99,102,241,0.2)]" : ""}`}
            >
              <span className={`text-[11px] leading-none ${
                isSelected
                  ? "font-bold text-indigo-700 dark:text-indigo-300"
                  : shouldHighlightToday
                    ? "font-bold text-indigo-600 dark:text-indigo-400"
                    : "text-gray-600 dark:text-gray-400"
              }`}>
                {day}
              </span>
              {dayTasks.length > 0 && (
                <div className="flex gap-0.5 mt-0.5 flex-wrap justify-center">
                  {dayTasks.slice(0, 3).map((t) => (
                    <div
                      key={t.id}
                      className={`w-1 h-1 rounded-full ${hasLate && isLate(t) ? "bg-red-400" : "bg-indigo-400"}`}
                      title={t.title}
                    />
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DailyCompactTimeline({
  tasks,
  locale,
}: {
  tasks: MyTask[];
  locale: "fr" | "en";
}) {
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const toMinuteOfDay = (value: string): number => {
    const [h, m] = value.split(":").map((part) => Number.parseInt(part, 10));
    return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
  };

  const keyToComparable = (value: string): number => Number.parseInt(value.replaceAll("-", ""), 10);

  const pickTimelineTimeForToday = (
    startDate: string,
    startTime: string,
    startHasTime: boolean,
    endDate: string,
    endTime: string,
    endHasTime: boolean
  ): string | null => {
    if (startDate === todayKey && startHasTime) return startTime;
    if (endDate === todayKey && endHasTime) return endTime;
    if (startHasTime) return startTime;
    if (endHasTime) return endTime;
    return null;
  };

  const rows = useMemo(() => {
    const slotRows: Array<{
      key: string;
      task: MyTask;
      minuteOfDay: number;
      timeLabel: string;
      late: boolean;
    }> = [];
    const noSlotRows: Array<{
      key: string;
      task: MyTask;
      label: string;
    }> = [];

    for (const task of tasks) {
      const timeline = parseTimelineValue(task.timeline ?? null);
      const startParts = splitDateTimeValue(timeline?.start ?? null);
      const endParts = splitDateTimeValue(timeline?.end ?? null);
      const hasTimeline = Boolean(startParts.date || endParts.date);

      if (hasTimeline) {
        const startDate = startParts.date || endParts.date;
        const endDate = endParts.date || startParts.date;
        if (startDate && endDate) {
          const todayComparable = keyToComparable(todayKey);
          const startComparable = keyToComparable(startDate);
          const endComparable = keyToComparable(endDate);
          const periodIncludesToday = startComparable <= todayComparable && todayComparable <= endComparable;
          if (periodIncludesToday) {
            const chosenTime = pickTimelineTimeForToday(
              startDate,
              startParts.time,
              startParts.hasTime,
              endDate,
              endParts.time,
              endParts.hasTime
            );
            if (chosenTime) {
              slotRows.push({
                key: `${task.id}-period`,
                task,
                minuteOfDay: toMinuteOfDay(chosenTime),
                timeLabel: chosenTime,
                late: false,
              });
            } else {
              noSlotRows.push({
                key: `${task.id}-period-noslot`,
                task,
                label: trKey(locale, "calendar.periodWithoutTime"),
              });
            }
            continue;
          }
        }
      }

      const dueParts = splitDateTimeValue(task.dueDate);
      if (dueParts.date === todayKey) {
        noSlotRows.push({
          key: `${task.id}-due-noslot`,
          task,
          label: dueParts.hasTime
            ? `${trKey(locale, "common.dueDate")} · ${dueParts.time}`
            : trKey(locale, "calendar.dueDateWithoutTime"),
        });
      }
    }

    return {
      slots: slotRows.sort((a, b) => a.minuteOfDay - b.minuteOfDay).slice(0, 8),
      noSlots: noSlotRows.slice(0, 8),
    };
  }, [tasks, locale]);

  if (rows.slots.length === 0 && rows.noSlots.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 px-3 py-4 text-center text-xs text-gray-400 dark:text-gray-500">
        {pickByLocale(locale, "Aucun créneau planifié aujourd’hui", "No scheduled slots for today")}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {rows.slots.map((row) => (
        <div key={row.key} className="flex items-start gap-2.5">
          <div className={`w-12 text-[11px] font-semibold tabular-nums ${row.late ? "text-red-500" : "text-indigo-600 dark:text-indigo-300"}`}>
            {row.timeLabel}
          </div>
          <Link
            href={`/projects/${row.task.projectId}?taskId=${row.task.id}`}
            className="flex-1 min-w-0 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-700/40 px-2.5 py-1.5 hover:border-indigo-300 dark:hover:border-indigo-600 transition-all hover:-translate-y-0.5 active:translate-y-0"
          >
            <p className="text-xs font-medium text-gray-800 dark:text-gray-100 truncate">{row.task.title}</p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{row.task.projectName}</p>
          </Link>
        </div>
      ))}
      {rows.noSlots.length > 0 && (
        <div className="mt-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-800/40 px-3 py-2.5">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">
            {pickByLocale(locale, "Sans créneau", "No time slot")}
          </p>
          <div className="space-y-2">
            {rows.noSlots.map((row) => (
              <Link
                key={row.key}
                href={`/projects/${row.task.projectId}?taskId=${row.task.id}`}
                className="block rounded-lg border border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-900/50 px-2.5 py-1.5 hover:border-indigo-300 dark:hover:border-indigo-600 transition-all hover:-translate-y-0.5 active:translate-y-0"
              >
                <p className="text-xs font-medium text-gray-800 dark:text-gray-100 truncate">{row.task.title}</p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                  {row.task.projectName} · {row.label}
                </p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
  active,
  onClick,
}: {
  label: string;
  value: number;
  color: "indigo" | "red" | "amber" | "green" | "gray";
  active: boolean;
  onClick: () => void;
}) {
  const bg = {
    indigo: active
      ? "border-indigo-500 bg-indigo-600 text-white shadow-[0_18px_36px_-24px_rgba(79,70,229,0.95)]"
      : "border-white/70 bg-white/85 hover:border-indigo-200 hover:bg-white dark:border-white/10 dark:bg-gray-900/75 dark:hover:border-indigo-500/30 dark:hover:bg-gray-900",
    red: active
      ? "border-red-400 bg-red-500 text-white shadow-[0_18px_36px_-24px_rgba(239,68,68,0.9)]"
      : "border-white/70 bg-white/85 hover:border-red-200 hover:bg-white dark:border-white/10 dark:bg-gray-900/75 dark:hover:border-red-500/30 dark:hover:bg-gray-900",
    amber: active
      ? "border-amber-400 bg-amber-500 text-white shadow-[0_18px_36px_-24px_rgba(245,158,11,0.9)]"
      : "border-white/70 bg-white/85 hover:border-amber-200 hover:bg-white dark:border-white/10 dark:bg-gray-900/75 dark:hover:border-amber-500/30 dark:hover:bg-gray-900",
    green: active
      ? "border-green-500 bg-green-600 text-white shadow-[0_18px_36px_-24px_rgba(34,197,94,0.9)]"
      : "border-white/70 bg-white/85 hover:border-green-200 hover:bg-white dark:border-white/10 dark:bg-gray-900/75 dark:hover:border-green-500/30 dark:hover:bg-gray-900",
    gray: active
      ? "border-gray-400 bg-gray-500 text-white shadow-[0_18px_36px_-24px_rgba(107,114,128,0.85)]"
      : "border-white/70 bg-white/85 hover:border-gray-200 hover:bg-white dark:border-white/10 dark:bg-gray-900/75 dark:hover:border-gray-600 dark:hover:bg-gray-900",
  }[color];
  const val = {
    indigo: active ? "text-white" : "text-indigo-600",
    red: active ? "text-white" : value > 0 ? "text-red-500" : "text-gray-400",
    amber: active ? "text-white" : "text-amber-600",
    green: active ? "text-white" : "text-green-600",
    gray: active ? "text-white" : "text-gray-400",
  }[color];

  return (
    <button
      onClick={onClick}
      className={`rounded-[18px] sm:rounded-[24px] border p-3 sm:p-4 text-left transition-all cursor-pointer ring-1 ring-black/5 hover:-translate-y-0.5 dark:ring-white/10 ${bg}`}
    >
      <p className={`mb-1 text-2xl sm:text-3xl font-semibold tracking-tight ${val}`}>{value}</p>
      <p className={`text-xs font-medium ${active ? "text-white/80" : "text-gray-500 dark:text-gray-400"}`}>{label}</p>
    </button>
  );
}

function MobileStatCard({
  label,
  value,
  color,
  active,
  onClick,
}: {
  label: string;
  value: number;
  color: "indigo" | "red" | "amber" | "green" | "gray";
  active: boolean;
  onClick: () => void;
}) {
  const tone = {
    indigo: active
      ? "border-indigo-500 bg-indigo-600 text-white"
      : "border-indigo-100 bg-white/90 text-indigo-600 dark:border-indigo-500/20 dark:bg-gray-900/70 dark:text-indigo-300",
    red: active
      ? "border-red-400 bg-red-500 text-white"
      : "border-red-100 bg-white/90 text-red-500 dark:border-red-500/20 dark:bg-gray-900/70 dark:text-red-300",
    amber: active
      ? "border-amber-400 bg-amber-500 text-white"
      : "border-amber-100 bg-white/90 text-amber-600 dark:border-amber-500/20 dark:bg-gray-900/70 dark:text-amber-300",
    green: active
      ? "border-green-500 bg-green-600 text-white"
      : "border-green-100 bg-white/90 text-green-600 dark:border-green-500/20 dark:bg-gray-900/70 dark:text-green-300",
    gray: active
      ? "border-gray-400 bg-gray-500 text-white"
      : "border-gray-200 bg-white/90 text-gray-500 dark:border-gray-600 dark:bg-gray-900/70 dark:text-gray-300",
  }[color];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border px-3 py-2.5 text-left transition-all duration-150 cursor-pointer ${tone}`}
    >
      <p className="text-2xl font-semibold leading-tight tracking-tight">{value}</p>
      <p className={`mt-0.5 text-xs font-medium ${active ? "text-white/85" : "text-current/85"}`}>{label}</p>
    </button>
  );
}

export function HomeTasksModule({
  tasks,
  projects,
  initialDisplayPrefs,
}: {
  tasks: MyTask[];
  projects: QuickProject[];
  initialDisplayPrefs?: Partial<DisplayPrefs> | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const locale = useClientLocale(pathname);
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [displayPrefs, setDisplayPrefs] = useState<DisplayPrefs>({
    ...DEFAULT_DISPLAY_PREFS,
    ...(initialDisplayPrefs ?? {}),
  });
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [toggleOverrides, setToggleOverrides] = useState<Record<string, boolean>>({});
  const [completingTaskIds, setCompletingTaskIds] = useState<Set<string>>(new Set());
  const [, startToggle] = useTransition();
  const [quickTitle, setQuickTitle] = useState("");
  const [quickProjectId, setQuickProjectId] = useState(projects[0]?.id ?? "");
  const [quickGroupId, setQuickGroupId] = useState("");
  const [quickDueDate, setQuickDueDate] = useState("");
  const [quickDueTime, setQuickDueTime] = useState("");
  const [quickReminder, setQuickReminder] = useState("0");
  const [quickReminderCustom, setQuickReminderCustom] = useState("");
  const [showQuickSchedule, setShowQuickSchedule] = useState(false);
  const [quickError, setQuickError] = useState("");
  const [isQuickPending, startQuickTransition] = useTransition();
  const quickScheduleRef = useRef<HTMLDivElement>(null);
  const personalProjectDisplayName = trKey(locale, "home.personalProjectName");

  useEffect(() => {
    const loadPrefs = () => {
      try {
        const raw = window.localStorage.getItem("taskapp:display-prefs");
        if (!raw) return;
        setDisplayPrefs({
          ...(initialDisplayPrefs ? { ...DEFAULT_DISPLAY_PREFS, ...initialDisplayPrefs } : DEFAULT_DISPLAY_PREFS),
          ...(JSON.parse(raw) as Partial<DisplayPrefs>),
        });
      } catch {
        // keep currently resolved preferences
      }
    };

    const onUpdate = () => loadPrefs();
    loadPrefs();
    window.addEventListener("taskapp:display-prefs-updated", onUpdate);
    return () => window.removeEventListener("taskapp:display-prefs-updated", onUpdate);
  }, [initialDisplayPrefs]);

  const isDone = useCallback(
    (t: MyTask) =>
      t.id in toggleOverrides
        ? toggleOverrides[t.id]
        : !!t.completedAt || toCanonicalStatus(t.status) === "DONE",
    [toggleOverrides]
  );

  const handleToggle = (task: MyTask, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (completingTaskIds.has(task.id)) return;
    const next = !isDone(task);
    if (next) {
      // Same behavior as spreadsheet: brief "completing" animation before the task disappears.
      setCompletingTaskIds((prev) => new Set(prev).add(task.id));
      setTimeout(() => {
        startToggle(async () => {
          try {
            await toggleMyTask(task.id);
            setToggleOverrides((prev) => ({ ...prev, [task.id]: true }));
          } finally {
            setCompletingTaskIds((prev) => {
              const updated = new Set(prev);
              updated.delete(task.id);
              return updated;
            });
          }
        });
      }, 520);
      return;
    }

    setToggleOverrides((prev) => ({ ...prev, [task.id]: false }));
    startToggle(async () => {
      try {
        await toggleMyTask(task.id);
      } catch {
        setToggleOverrides((prev) => ({ ...prev, [task.id]: true }));
      }
    });
  };

  const stats = useMemo(() => {
    const active = tasks.filter((t) => !isDone(t));
    return {
      total: active.length,
      late: active.filter(isLate).length,
      today: active.filter((t) => isToday(t.dueDate)).length,
      week: active.filter((t) => isThisWeek(t.dueDate, displayPrefs.mondayFirst)).length,
      done: tasks.filter(isDone).length,
    };
  }, [tasks, isDone, displayPrefs.mondayFirst]);

  const filtered = useMemo(() => {
    let result = tasks;
    if (selectedDate) result = tasks.filter((t) => toDateKey(t.dueDate) === selectedDate);
    else if (filter === "all_tasks") result = tasks;
    else if (filter === "today") result = tasks.filter((t) => !isDone(t) && isToday(t.dueDate));
    else if (filter === "week") result = tasks.filter((t) => !isDone(t) && isThisWeek(t.dueDate, displayPrefs.mondayFirst));
    else if (filter === "late") result = tasks.filter((t) => isLate(t) && !isDone(t));
    else if (filter === "done") result = tasks.filter(isDone);
    else result = tasks.filter((t) => !isDone(t));

    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter((t) => t.title.toLowerCase().includes(q) || t.projectName.toLowerCase().includes(q));
    }
    return result;
  }, [tasks, filter, selectedDate, search, isDone, displayPrefs.mondayFirst]);

  const grouped = useMemo(() => {
    const projectMap = new Map(projects.map((project) => [project.id, project]));
    const map = new Map<string, { projectId: string; projectName: string; tasks: MyTask[] }>();
    for (const task of filtered) {
      if (!map.has(task.projectId)) {
        const project = projectMap.get(task.projectId);
        const displayName = project?.isPersonal ? personalProjectDisplayName : task.projectName;
        map.set(task.projectId, { projectId: task.projectId, projectName: displayName, tasks: [] });
      }
      map.get(task.projectId)!.tasks.push(task);
    }
    return Array.from(map.values()).sort((a, b) => a.projectName.localeCompare(b.projectName));
  }, [filtered, personalProjectDisplayName, projects]);

  const LIST_TASK_LIMIT = 6;
  const shouldScrollTaskList = filtered.length > LIST_TASK_LIMIT;
  const expandedGroupCount = grouped.filter((g) => !collapsed.has(g.projectId)).length;
  const groupHeaderHeightPx = 48;
  const taskRowHeightPx = displayPrefs.density === "compact" ? 44 : 54;
  const listMaxHeightPx =
    expandedGroupCount * groupHeaderHeightPx +
    Math.min(filtered.length, LIST_TASK_LIMIT) * taskRowHeightPx;

  const filterTabs: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: trKey(locale, "dashboard.inProgress"), count: stats.total },
    { key: "today", label: trKey(locale, "dashboard.today"), count: stats.today },
    { key: "week", label: trKey(locale, "home.thisWeek"), count: stats.week },
    { key: "late", label: trKey(locale, "dashboard.late"), count: stats.late },
    { key: "done", label: trKey(locale, "home.completed"), count: stats.done },
    { key: "all_tasks", label: trKey(locale, "home.allFem"), count: tasks.length },
  ];
  const selectedQuickProject = useMemo(
    () => projects.find((project) => project.id === quickProjectId) ?? null,
    [projects, quickProjectId]
  );
  const projectOptions = useMemo<QuickSelectOption[]>(
    () =>
      projects.map((project) => ({
        value: project.id,
        label: project.isPersonal ? personalProjectDisplayName : project.name,
        hint: project.isPersonal ? trKey(locale, "home.personalProjectHint") : undefined,
      })),
    [projects, locale, personalProjectDisplayName]
  );
  const groupOptions = useMemo<QuickSelectOption[]>(
    () => [
      { value: "", label: trKey(locale, "home.inboxAuto") },
      ...(selectedQuickProject?.groups ?? []).map((group) => ({ value: group.id, label: group.name })),
    ],
    [selectedQuickProject, locale]
  );

  useEffect(() => {
    if (!projects.length) {
      setQuickProjectId("");
      setQuickGroupId("");
      return;
    }
    if (!quickProjectId || !projects.some((project) => project.id === quickProjectId)) {
      setQuickProjectId(projects[0].id);
      setQuickGroupId("");
    }
  }, [projects, quickProjectId]);

  useEffect(() => {
    if (!showQuickSchedule) return;
    const onClickOutside = (event: MouseEvent) => {
      if (!quickScheduleRef.current?.contains(event.target as Node)) setShowQuickSchedule(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [showQuickSchedule]);

  const submitQuickTask = () => {
    const projectId = quickProjectId;
    const title = quickTitle.trim();
    if (!projectId) {
      setQuickError(trKey(locale, "home.selectProject"));
      return;
    }
    if (!title) {
      setQuickError(trKey(locale, "home.titleRequired"));
      return;
    }
    setQuickError("");
    startQuickTransition(async () => {
      try {
        await createQuickTask({
          projectId,
          title,
          groupId: quickGroupId || undefined,
          dueDate: quickDueDate || undefined,
          dueTime: normalizeTimeInput(quickDueTime, quickDueTime) || undefined,
          reminderMinutes:
            quickDueTime
              ? quickReminder === "custom"
                ? Math.max(0, Math.min(1440, Number.parseInt(quickReminderCustom || "0", 10) || 0))
                : Number.parseInt(quickReminder, 10) || 0
              : null,
        });
        setQuickTitle("");
        setQuickGroupId("");
        setQuickDueDate("");
        setQuickDueTime("");
        setQuickReminder("0");
        setQuickReminderCustom("");
        setShowQuickSchedule(false);
        router.refresh();
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (message.includes("INVALID_GROUP")) {
          setQuickError(trKey(locale, "home.invalidCategory"));
          return;
        }
        setQuickError(trKey(locale, "home.createTaskFailed"));
      }
    });
  };

  return (
    <section className="space-y-4 overflow-x-clip sm:space-y-5">
      <div className="flex flex-col gap-2.5 sm:gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mobile-kicker sm:text-[11px] sm:tracking-[0.28em]">
            {pickByLocale(locale, "Aujourd’hui", "Today")}
          </p>
          <h2 className="mt-1 text-lg sm:text-2xl font-semibold tracking-tight text-gray-950 dark:text-white">
            {trKey(locale, "dashboard.myTasks")}
          </h2>
          <p className="mt-1 text-xs sm:text-sm text-gray-500 dark:text-gray-400">
            {selectedDate
              ? trKey(locale, "dashboard.noTasksOnDate")
              : pickByLocale(locale, "Vue unifiée des tâches, de la création rapide au suivi du jour.", "Unified task view from quick capture to daily follow-up.")}
          </p>
        </div>
        <div className="hidden flex-wrap items-center gap-2 sm:flex">
          <span className="rounded-full border border-white/70 bg-white/80 px-2.5 py-1 text-[11px] sm:text-xs font-medium text-gray-500 shadow-sm ring-1 ring-black/5 dark:border-white/10 dark:bg-gray-900/70 dark:text-gray-300 dark:ring-white/10">
            {stats.total} {trKey(locale, "dashboard.inProgress").toLowerCase()}
          </span>
          <span className="rounded-full border border-white/70 bg-white/80 px-2.5 py-1 text-[11px] sm:text-xs font-medium text-gray-500 shadow-sm ring-1 ring-black/5 dark:border-white/10 dark:bg-gray-900/70 dark:text-gray-300 dark:ring-white/10">
            {stats.done} {trKey(locale, "home.completed").toLowerCase()}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:hidden">
        <MobileStatCard
          label={trKey(locale, "dashboard.inProgress")}
          value={stats.total}
          color="indigo"
          active={filter === "all"}
          onClick={() => setFilter("all")}
        />
        <MobileStatCard
          label={trKey(locale, "dashboard.late")}
          value={stats.late}
          color={stats.late > 0 ? "red" : "gray"}
          active={filter === "late"}
          onClick={() => setFilter("late")}
        />
        <MobileStatCard
          label={trKey(locale, "home.thisWeek")}
          value={stats.today + stats.week}
          color="amber"
          active={filter === "week"}
          onClick={() => setFilter("week")}
        />
        <MobileStatCard
          label={trKey(locale, "home.completed")}
          value={stats.done}
          color="green"
          active={filter === "done"}
          onClick={() => setFilter("done")}
        />
      </div>

      <div className="hidden grid-cols-1 gap-2.5 sm:grid sm:gap-3 min-[430px]:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={trKey(locale, "dashboard.inProgress")}
          value={stats.total}
          color="indigo"
          active={filter === "all"}
          onClick={() => setFilter("all")}
        />
        <StatCard
          label={trKey(locale, "dashboard.late")}
          value={stats.late}
          color={stats.late > 0 ? "red" : "gray"}
          active={filter === "late"}
          onClick={() => setFilter("late")}
        />
        <StatCard
          label={trKey(locale, "home.thisWeek")}
          value={stats.today + stats.week}
          color="amber"
          active={filter === "week"}
          onClick={() => setFilter("week")}
        />
        <StatCard
          label={trKey(locale, "home.completed")}
          value={stats.done}
          color="green"
          active={filter === "done"}
          onClick={() => setFilter("done")}
        />
      </div>

      <div className="grid items-start gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="mobile-surface overflow-x-hidden rounded-[22px] sm:rounded-[28px]">
          <div className="overflow-visible rounded-t-[22px] sm:rounded-t-[28px] border-b border-gray-100/80 bg-[linear-gradient(135deg,rgba(99,102,241,0.08),rgba(255,255,255,0.88))] px-3.5 py-3.5 sm:px-5 sm:py-5 dark:border-white/10 dark:bg-[linear-gradient(135deg,rgba(99,102,241,0.14),rgba(17,24,39,0.55))]">
            <div className="mb-4 flex flex-col gap-1">
              <p className="mobile-kicker sm:text-[11px] sm:tracking-[0.24em]">
                {pickByLocale(locale, "Capture rapide", "Quick capture")}
              </p>
              <h3 className="text-sm sm:text-lg font-semibold text-gray-950 dark:text-white">
                {pickByLocale(locale, "Ajouter une tâche rapide", "Add a quick task")}
              </h3>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
              <input
                value={quickTitle}
                onChange={(e) => setQuickTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submitQuickTask();
                  }
                }}
                placeholder={trKey(locale, "home.quickTaskPlaceholder")}
                className="h-8 rounded-xl border border-white/80 bg-white/90 px-2.5 text-xs text-gray-900 outline-none ring-1 ring-black/5 transition-colors placeholder:text-gray-400 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 dark:border-white/10 dark:bg-gray-950/40 dark:text-white dark:ring-white/10 dark:placeholder:text-gray-500 dark:focus:border-indigo-500 dark:focus:ring-indigo-500/20"
              />
              <PrettySelect
                value={quickProjectId}
                onChange={(next) => {
                  setQuickProjectId(next);
                  setQuickGroupId("");
                }}
                options={projectOptions}
                placeholder={trKey(locale, "home.chooseProject")}
              />
              <PrettySelect
                value={quickGroupId}
                onChange={setQuickGroupId}
                options={groupOptions}
                placeholder={trKey(locale, "home.chooseCategory")}
              />
              <div className="relative flex min-w-0 items-center gap-2 sm:justify-end" ref={quickScheduleRef}>
                <button
                  type="button"
                  onClick={() => setShowQuickSchedule((prev) => !prev)}
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-xl border transition-colors cursor-pointer ${
                    quickDueDate || quickDueTime
                      ? "border-indigo-400 bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30"
                      : "border-white/80 bg-white/90 text-gray-500 ring-1 ring-black/5 hover:border-indigo-300 dark:border-white/10 dark:bg-gray-950/40 dark:text-gray-300 dark:ring-white/10 dark:hover:border-indigo-500"
                  }`}
                  title={trKey(locale, "home.dateAndTime")}
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M8 7V3m8 4V3M5 11h14M7 21h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v12a2 2 0 002 2z" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                {showQuickSchedule && (
                  <div className="absolute left-1/2 top-full z-[80] mt-2 w-[calc(100vw-2rem)] max-w-[16.5rem] max-h-[62vh] -translate-x-1/2 overflow-y-auto rounded-[20px] border border-white/80 bg-white/95 p-3 shadow-[0_28px_60px_-30px_rgba(15,23,42,0.6)] ring-1 ring-black/5 backdrop-blur sm:left-auto sm:right-0 sm:w-[15rem] sm:max-w-none sm:translate-x-0 dark:border-white/10 dark:bg-gray-900/95 dark:ring-white/10">
                    <div className="space-y-3">
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-medium text-gray-500 dark:text-gray-400">{trKey(locale, "home.date")}</span>
                        <input
                          type="date"
                          value={quickDueDate}
                          onChange={(e) => setQuickDueDate(e.target.value)}
                          className="datetime-field mx-auto block w-full min-w-0"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-medium text-gray-500 dark:text-gray-400">{trKey(locale, "home.time")}</span>
                        <input
                          type="time"
                          value={quickDueTime}
                          onChange={(e) => setQuickDueTime(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              setQuickDueTime(normalizeTimeInput((e.currentTarget as HTMLInputElement).value || quickDueTime, quickDueTime));
                              submitQuickTask();
                            }
                          }}
                          className="datetime-field mx-auto block w-full min-w-0"
                        />
                      </label>
                      {quickDueTime && (
                        <label className="block">
                          <span className="mb-1 block text-[11px] font-medium text-gray-500 dark:text-gray-400">{trKey(locale, "home.reminder")}</span>
                          <div className="flex flex-col gap-1.5 min-w-0">
                            <select
                              value={quickReminder}
                              onChange={(e) => setQuickReminder(e.target.value)}
                              className="mx-auto block w-full min-w-0 select-unified select-unified-sm"
                            >
                              <option value="0">{trKey(locale, "home.atTime")}</option>
                              <option value="2">{trKey(locale, "home.minutesBefore2")}</option>
                              <option value="5">{trKey(locale, "home.minutesBefore5")}</option>
                              <option value="15">{trKey(locale, "home.minutesBefore15")}</option>
                              <option value="30">{trKey(locale, "home.minutesBefore30")}</option>
                              <option value="custom">{trKey(locale, "home.custom")}</option>
                            </select>
                            {quickReminder === "custom" && (
                              <input
                                type="number"
                                min={0}
                                max={1440}
                                value={quickReminderCustom}
                                onChange={(e) => setQuickReminderCustom(e.target.value)}
                                className="datetime-field mx-auto block w-full min-w-0"
                                placeholder={pickByLocale(locale, "min", "min")}
                              />
                            )}
                          </div>
                        </label>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setQuickDueDate("");
                          setQuickDueTime("");
                          setQuickReminder("0");
                          setQuickReminderCustom("");
                        }}
                        className="text-xs text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                      >
                        {trKey(locale, "project.reset")}
                      </button>
                    </div>
                  </div>
                )}
                <button
                  type="button"
                  onClick={submitQuickTask}
                  disabled={isQuickPending || !quickProjectId || !quickTitle.trim()}
                  className="inline-flex h-8 min-w-[5.5rem] flex-1 items-center justify-center rounded-xl bg-indigo-600 px-3 text-xs font-medium text-white shadow-[0_18px_40px_-24px_rgba(79,70,229,0.95)] transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
                >
                  {trKey(locale, "common.add")}
                </button>
              </div>
            </div>
            {quickError && <p className="mt-3 text-sm text-red-500">{quickError}</p>}
          </div>

          <div className="border-b border-gray-100/80 px-3.5 py-3 sm:px-5 sm:py-4 dark:border-white/10">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="hidden sm:flex sm:flex-wrap sm:gap-2.5">
                {filterTabs.map((f) => (
                  <button
                    key={f.key}
                    onClick={() => {
                      setSelectedDate(null);
                      setFilter(f.key);
                    }}
                    className={`flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${
                      filter === f.key
                        ? "bg-indigo-600 text-white shadow-[0_14px_28px_-20px_rgba(79,70,229,0.95)]"
                        : "bg-gray-50 text-gray-500 hover:bg-gray-100 dark:bg-gray-800/80 dark:text-gray-400 dark:hover:bg-gray-800"
                    }`}
                  >
                    {f.label}
                    {f.count > 0 && (
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none ${
                          filter === f.key
                            ? "bg-white/20 text-white"
                            : f.key === "late" && f.count > 0
                              ? "bg-red-100 text-red-600"
                              : "bg-white text-gray-500 shadow-sm dark:bg-gray-700 dark:text-gray-300"
                        }`}
                      >
                        {f.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:hidden">
                {filterTabs.map((f) => (
                  <button
                    key={f.key}
                    onClick={() => {
                      setSelectedDate(null);
                      setFilter(f.key);
                    }}
                    className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-xs font-medium transition-colors cursor-pointer ${
                      filter === f.key
                        ? "bg-indigo-600 text-white shadow-[0_14px_28px_-20px_rgba(79,70,229,0.95)]"
                        : "bg-gray-50 text-gray-600 hover:bg-gray-100 dark:bg-gray-800/80 dark:text-gray-300 dark:hover:bg-gray-800"
                    }`}
                  >
                    <span className="truncate">{f.label}</span>
                    {f.count > 0 && (
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none ${
                          filter === f.key
                            ? "bg-white/20 text-white"
                            : f.key === "late" && f.count > 0
                              ? "bg-red-100 text-red-600"
                              : "bg-white text-gray-500 shadow-sm dark:bg-gray-700 dark:text-gray-300"
                        }`}
                      >
                        {f.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              <div className="relative w-full flex-shrink-0 sm:w-auto">
                <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={trKey(locale, "home.search")}
                  className="h-11 w-full rounded-2xl border border-gray-200 bg-gray-50 pl-10 pr-4 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100 sm:w-56 dark:border-white/10 dark:bg-gray-950/40 dark:text-white dark:placeholder:text-gray-500 dark:focus:border-indigo-500 dark:focus:ring-indigo-500/20"
                />
              </div>
            </div>
          </div>

          {grouped.length === 0 ? (
            <div className="px-5 py-16 text-center sm:px-6">
              <p className="mb-1 text-sm font-medium text-gray-500 dark:text-gray-400">
                {selectedDate
                  ? trKey(locale, "dashboard.noTasksOnDate")
                  : filter === "done"
                    ? trKey(locale, "home.noCompletedTasks")
                    : filter === "late"
                      ? trKey(locale, "home.noLateTasks")
                      : trKey(locale, "home.noTasksHere")}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {selectedDate
                  ? trKey(locale, "home.selectAnotherDate")
                  : filter === "all"
                    ? trKey(locale, "home.assignedTasksAppearHere")
                    : trKey(locale, "home.changeFilterToSeeTasks")}
              </p>
            </div>
          ) : (
            <div
              className={shouldScrollTaskList ? "overflow-y-auto overflow-x-hidden" : "overflow-x-hidden"}
              style={shouldScrollTaskList ? { maxHeight: `${listMaxHeightPx}px` } : undefined}
            >
              {grouped.map((group, gi) => {
                const isCollapsed = collapsed.has(group.projectId);
                return (
                  <div key={group.projectId} className={gi > 0 ? "border-t border-gray-100/80 dark:border-white/10" : ""}>
                    <button
                      onClick={() =>
                        setCollapsed((prev) => {
                          const next = new Set(prev);
                          if (next.has(group.projectId)) next.delete(group.projectId);
                          else next.add(group.projectId);
                          return next;
                        })
                      }
                      className="group flex w-full min-w-0 items-center justify-between px-4 sm:px-5 py-3.5 sm:py-4 transition-colors hover:bg-gray-50/80 dark:hover:bg-gray-800/40"
                    >
                      <div className="flex items-center gap-2.5">
                        <svg className={`h-3 w-3 text-gray-400 transition-transform ${isCollapsed ? "-rotate-90" : ""}`} fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                        <span className="text-sm font-semibold text-gray-900 dark:text-white">{group.projectName}</span>
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500 dark:bg-gray-800 dark:text-gray-400">{group.tasks.length}</span>
                      </div>
                      <Link
                        href={`/projects/${group.projectId}`}
                        onClick={(e) => e.stopPropagation()}
                        className="hidden items-center gap-1 text-[11px] text-indigo-500 transition-all group-hover:text-indigo-700 sm:inline-flex"
                      >
                        {trKey(locale, "home.openProject")}
                        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </Link>
                    </button>

                    {!isCollapsed &&
                      buildHierarchicalTaskRows(group.tasks).map(({ task, depth, hasChildren }, ti, rows) => {
                        const late = isLate(task);
                        const due = fmtDate(task.dueDate, displayPrefs.dateFormat);
                        const done = isDone(task);
                        const isCompleting = completingTaskIds.has(task.id);
                        const displayDone = done || isCompleting;
                        const clampedDepth = Math.min(depth, 6);
                        const indentPx = clampedDepth * 18;
                        return (
                          <div
                            key={task.id}
                            className={`flex min-w-0 items-center gap-2.5 sm:gap-3 px-4 sm:px-5 overflow-hidden ${displayPrefs.density === "compact" ? "py-2.5" : "py-3.5"} transition-all duration-300 hover:bg-gray-50/80 dark:hover:bg-gray-800/35 ${
                              isCompleting ? "bg-emerald-50/70 opacity-50 dark:bg-emerald-900/10" : ""
                            } ${ti < rows.length - 1 ? "border-b border-gray-100/60 dark:border-white/10" : ""}`}
                            style={indentPx > 0 ? { paddingLeft: `calc(1rem + ${indentPx}px)` } : undefined}
                          >
                            <div className="flex flex-shrink-0 items-center gap-2">
                              {depth > 0 && (
                                <span
                                  className="hidden h-px w-3 rounded-full bg-gray-200 sm:block dark:bg-gray-700"
                                  aria-hidden="true"
                                />
                              )}
                              <button
                                onClick={(e) => handleToggle(task, e)}
                                className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border-2 transition-all duration-300 hover:scale-110 ${
                                  displayDone
                                    ? `border-green-500 bg-green-500 ${isCompleting ? "scale-125 shadow-[0_0_0_6px_rgba(34,197,94,0.18)]" : ""}`
                                    : late
                                      ? "border-red-400 hover:border-red-500"
                                      : depth > 0
                                        ? "border-indigo-200 hover:border-indigo-400 dark:border-indigo-500/40"
                                        : "border-gray-300 hover:border-indigo-400"
                                }`}
                              >
                                {displayDone && (
                                  <svg className={`h-2.5 w-2.5 text-white transition-transform duration-300 ${isCompleting ? "scale-110" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path d="M5 13l4 4L19 7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                )}
                              </button>
                            </div>

                            <Link
                              href={`/projects/${task.projectId}?taskId=${task.id}`}
                              className="flex w-full min-w-0 flex-1 flex-col items-stretch gap-1.5 sm:flex-row sm:items-center sm:gap-3"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex min-w-0 items-center gap-1.5">
                                  <p className={`truncate text-sm ${displayDone ? "text-gray-400 line-through dark:text-gray-500" : depth > 0 ? "text-gray-700 dark:text-gray-200" : "text-gray-900 dark:text-white"}`}>{task.title}</p>
                                  {hasChildren && (
                                    <span className="hidden h-1.5 w-1.5 flex-shrink-0 rounded-full bg-indigo-300 dark:bg-indigo-500 sm:inline-block" />
                                  )}
                                </div>
                                <p className="mt-0.5 truncate text-[11px] text-gray-400 dark:text-gray-500">
                                  {depth > 0 && <span className="mr-1 text-indigo-400 dark:text-indigo-300">↳</span>}
                                  {task.groupName}
                                </p>
                              </div>
                              <div className="flex w-full min-w-0 flex-wrap items-center gap-1.5 sm:w-auto sm:flex-shrink-0 sm:justify-end sm:gap-2">
                                {task.priority && (
                                  <span className={`text-[11px] font-medium ${PRIORITY_COLORS[task.priority] ?? "text-gray-400"}`}>
                                    {getPriorityLabelByLocale(task.priority, locale)}
                                  </span>
                                )}
                                {task.status && (
                                  <span
                                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                      STATUS_COLORS[toCanonicalStatus(task.status) ?? ""] ?? "bg-gray-100 text-gray-500"
                                    }`}
                                  >
                                    {getStatusLabel(task.status, locale) ?? task.status}
                                  </span>
                                )}
                                {due && (
                                  <span className={`text-[11px] tabular-nums ${late ? "font-medium text-red-500" : isToday(task.dueDate) ? "font-medium text-amber-600" : "text-gray-400"}`}>
                                    {due}
                                  </span>
                                )}
                              </div>
                            </Link>
                          </div>
                        );
                      })}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-4 sm:space-y-5 xl:sticky xl:top-28">
          <div className="mobile-surface rounded-[22px] sm:rounded-[28px] p-3.5 sm:p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{trKey(locale, "home.calendar")}</h3>
              {selectedDate && (
                <button
                  onClick={() => setSelectedDate(null)}
                  className="text-[11px] text-indigo-500 transition-colors hover:text-indigo-700"
                >
                  {trKey(locale, "project.reset")}
                </button>
              )}
            </div>
            <MiniCalendar
              tasks={tasks}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              mondayFirst={displayPrefs.mondayFirst}
              locale={locale}
            />
          </div>

          <div className="mobile-surface rounded-[22px] sm:rounded-[28px] p-3.5 sm:p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-indigo-600 dark:text-indigo-300">
                  {pickByLocale(locale, "Aujourd’hui", "Today")}
                </p>
                <h3 className="mt-1 text-sm font-semibold text-gray-700 dark:text-gray-200">
                  {pickByLocale(locale, "Planning du jour", "Today timeline")}
                </h3>
              </div>
              <span className="rounded-full bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                {tasks.filter((task) => !isDone(task) && isTaskInTodayPlan(task)).length}
              </span>
            </div>
            <DailyCompactTimeline tasks={tasks.filter((task) => !isDone(task))} locale={locale} />
          </div>
        </div>
      </div>
    </section>
  );
}
