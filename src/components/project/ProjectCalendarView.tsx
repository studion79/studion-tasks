"use client";

import { useState, useTransition } from "react";
import type { ProjectWithRelations, TaskWithFields } from "@/lib/types";
import { STATUS_OPTIONS } from "@/lib/constants";
import { getFieldValue } from "./cells";
import { TaskDetailPanel } from "./TaskDetailPanel";
import {
  updateTaskTitle as updateTaskTitleAction,
  upsertTaskField,
} from "@/lib/actions";

// --- Calendar helpers ---

const WEEKDAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

const MONTHS_FR = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

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

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function toLocalDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// --- Recurrence helpers ---
interface RecurrenceConfig { frequency: "daily" | "weekly" | "monthly"; interval: number }
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
  isGhost,
  onClick,
}: {
  task: TaskWithFields;
  statusColId: string | null;
  isGhost?: boolean;
  onClick: () => void;
}) {
  const statusVal = statusColId
    ? getFieldValue(task.fieldValues, statusColId)
    : null;
  const statusMeta = STATUS_OPTIONS.find((o) => o.value === statusVal);

  // Use a thin left border colored by status
  const borderColor = statusMeta
    ? statusMeta.color.split(" ")[0].replace("bg-", "border-l-")
    : "border-l-gray-300";

  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={`${task.title}${isGhost ? " (récurrent)" : ""}`}
      className={[
        "w-full text-left text-[11px] font-medium rounded px-1.5 py-0.5 truncate transition-colors cursor-pointer",
        "border border-l-2 hover:bg-indigo-50 hover:text-indigo-700",
        isGhost
          ? `bg-indigo-50/40 dark:bg-indigo-900/20 text-gray-400 dark:text-gray-500 border-dashed border-gray-200 dark:border-gray-700 ${borderColor}`
          : `bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-100 dark:border-gray-600 ${borderColor}`,
      ].join(" ")}
    >
      {isGhost && <span className="mr-0.5 opacity-60">↻</span>}
      {task.title}
    </button>
  );
}

// --- Main ---
export function ProjectCalendarView({ project }: { project: ProjectWithRelations }) {
  const { columns } = project;
  const statusCol = columns.find((c) => c.type === "STATUS") ?? null;
  const dueDateCol = columns.find((c) => c.type === "DUE_DATE") ?? null;

  const allTasks = project.groups.flatMap((g) => g.tasks);
  const taskGroupMap = new Map(
    project.groups.flatMap((g) => g.tasks.map((t) => [t.id, g.id]))
  );

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [tasks, setTasks] = useState<TaskWithFields[]>(allTasks);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
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

  // Build a map: dateStr → { task, isGhost }[]
  const tasksByDate = new Map<string, { task: TaskWithFields; isGhost: boolean }[]>();
  if (dueDateCol) {
    // Calendar grid spans from first to last displayed day
    const gridStart = calendarDays[0];
    const gridEnd = calendarDays[calendarDays.length - 1];

    for (const task of tasks) {
      const dueVal = getFieldValue(task.fieldValues, dueDateCol.id);
      if (!dueVal) continue;

      // Original occurrence
      if (!tasksByDate.has(dueVal)) tasksByDate.set(dueVal, []);
      tasksByDate.get(dueVal)!.push({ task, isGhost: false });

      // Ghost recurrences within the visible grid
      const cfg = parseRecurrence(task.recurrence ?? null);
      if (cfg) {
        const baseDate = new Date(dueVal + "T00:00:00");
        for (let i = 1; i <= 366; i++) {
          const ghostDate = shiftByRecurrence(baseDate, cfg, i);
          if (ghostDate > gridEnd) break;
          if (ghostDate < gridStart) continue;
          const ghostKey = toLocalDateStr(ghostDate);
          if (!tasksByDate.has(ghostKey)) tasksByDate.set(ghostKey, []);
          tasksByDate.get(ghostKey)!.push({ task, isGhost: true });
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
  const openGroupId = openTaskId ? (taskGroupMap.get(openTaskId) ?? null) : null;
  const openGroup = openGroupId ? project.groups.find((g) => g.id === openGroupId) ?? null : null;

  const today = toLocalDateStr(now);

  // Split days into weeks
  const weeks: Date[][] = [];
  for (let i = 0; i < calendarDays.length; i += 7) {
    weeks.push(calendarDays.slice(i, i + 7));
  }

  if (!dueDateCol) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-gray-400">
        <p className="text-sm">La colonne "Due date" n'est pas active dans ce projet.</p>
        <p className="text-xs mt-1 text-gray-300">Activez-la depuis les paramètres du projet.</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col h-full">
        {/* Calendar header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={prevMonth}
              className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M15 19l-7-7 7-7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-50 w-36 text-center">
              {MONTHS_FR[month]} {year}
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
          <button
            onClick={goToday}
            className="text-xs text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer"
          >
            Aujourd'hui
          </button>
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
          {WEEKDAYS.map((d) => (
            <div key={d} className="py-2 text-center text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
              {d}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="flex-1 overflow-y-auto">
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
                    className={[
                      "min-h-[100px] p-2",
                      di < 6 ? "border-r border-gray-100 dark:border-gray-700" : "",
                      isCurrentMonth ? "bg-white dark:bg-gray-800" : "bg-gray-50/60 dark:bg-gray-900/50",
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
                      {dayTasks.slice(0, MAX_VISIBLE).map(({ task, isGhost }) => (
                        <TaskChip
                          key={task.id + (isGhost ? "-ghost" : "")}
                          task={task}
                          statusColId={statusCol?.id ?? null}
                          isGhost={isGhost}
                          onClick={() => setOpenTaskId(task.id)}
                        />
                      ))}
                      {overflow > 0 && (
                        <span className="text-[10px] text-gray-400 px-1">
                          +{overflow} autre{overflow > 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
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
