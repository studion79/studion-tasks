"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { getUiLocale } from "@/lib/ui-locale";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createQuickTask, toggleMyTask } from "@/lib/actions";
import { getStatusLabel, toCanonicalStatus } from "@/lib/status";
import { localeFromPathname, tr } from "@/lib/i18n/client";
import { dateKeyFromValue, parseDateTimeToDate, splitDateTimeValue } from "@/lib/task-schedule";

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
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="w-full h-8 px-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-left text-xs text-gray-900 dark:text-gray-50 flex items-center justify-between hover:border-indigo-300 dark:hover:border-indigo-500 transition-colors cursor-pointer"
      >
        <span className={`truncate ${selected ? "text-gray-900 dark:text-gray-50" : "text-gray-400 dark:text-gray-500"}`}>
          {selected?.label ?? placeholder}
        </span>
        <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M19 9l-7 7-7-7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl">
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
        </div>
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
  if (parts.date === todayKey) return isEn ? "Today" : "Aujourd'hui";
  if (parts.date === tomorrowKey) return isEn ? "Tomorrow" : "Demain";
  if (parts.date === yesterdayKey) return isEn ? "Yesterday" : "Hier";
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
  for (const task of tasks) {
    const d = parseDate(task.dueDate);
    if (!d) continue;
    if (d.getFullYear() === viewDate.getFullYear() && d.getMonth() === viewDate.getMonth()) {
      const day = d.getDate();
      if (!tasksByDay[day]) tasksByDay[day] = [];
      tasksByDay[day].push(task);
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
        {(mondayFirst
          ? (locale === "en" ? ["M", "T", "W", "T", "F", "S", "S"] : ["L", "M", "M", "J", "V", "S", "D"])
          : (locale === "en" ? ["S", "M", "T", "W", "T", "F", "S"] : ["D", "L", "M", "M", "J", "V", "S"])
        ).map((d, i) => (
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
              onClick={() => onSelectDate(isSelected ? null : dayKey)}
              className={`flex flex-col items-center rounded-md py-0.5 cursor-pointer transition-colors ${
                isSelected
                  ? "bg-indigo-500/20 dark:bg-indigo-700/40"
                  : shouldHighlightToday
                    ? "bg-indigo-100 dark:bg-indigo-900/40"
                    : "hover:bg-gray-100 dark:hover:bg-gray-700/40"
              }`}
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
    indigo: active ? "bg-indigo-600 text-white" : "bg-white dark:bg-gray-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/20",
    red: active ? "bg-red-500 text-white" : "bg-white dark:bg-gray-800 hover:bg-red-50 dark:hover:bg-red-900/20",
    amber: active ? "bg-amber-500 text-white" : "bg-white dark:bg-gray-800 hover:bg-amber-50 dark:hover:bg-amber-900/20",
    green: active ? "bg-green-600 text-white" : "bg-white dark:bg-gray-800 hover:bg-green-50 dark:hover:bg-green-900/20",
    gray: active ? "bg-gray-500 text-white" : "bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700",
  }[color];
  const val = {
    indigo: active ? "text-white" : "text-indigo-600",
    red: active ? "text-white" : value > 0 ? "text-red-500" : "text-gray-400",
    amber: active ? "text-white" : "text-amber-600",
    green: active ? "text-white" : "text-green-600",
    gray: active ? "text-white" : "text-gray-400",
  }[color];

  return (
    <button onClick={onClick} className={`rounded-xl border border-gray-200 dark:border-gray-700 p-4 text-left transition-all cursor-pointer ${bg}`}>
      <p className={`text-2xl font-bold mb-1 ${val}`}>{value}</p>
      <p className={`text-xs font-medium ${active ? "text-white/80" : "text-gray-500 dark:text-gray-400"}`}>{label}</p>
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
  const locale = localeFromPathname(pathname);
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
  const personalProjectDisplayName = tr(locale, "Personnel", "Personnal");

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

  const LIST_TASK_LIMIT = 8;
  const shouldScrollTaskList = filtered.length > LIST_TASK_LIMIT;
  const expandedGroupCount = grouped.filter((g) => !collapsed.has(g.projectId)).length;
  const groupHeaderHeightPx = 48;
  const taskRowHeightPx = displayPrefs.density === "compact" ? 44 : 54;
  const listMaxHeightPx =
    expandedGroupCount * groupHeaderHeightPx +
    Math.min(filtered.length, LIST_TASK_LIMIT) * taskRowHeightPx;

  const filterTabs: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: tr(locale, "En cours", "In progress"), count: stats.total },
    { key: "today", label: tr(locale, "Aujourd'hui", "Today"), count: stats.today },
    { key: "week", label: tr(locale, "Cette semaine", "This week"), count: stats.week },
    { key: "late", label: tr(locale, "En retard", "Late"), count: stats.late },
    { key: "done", label: tr(locale, "Terminées", "Completed"), count: stats.done },
    { key: "all_tasks", label: tr(locale, "Toutes", "All"), count: tasks.length },
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
        hint: project.isPersonal ? tr(locale, "Projet personnel", "Personnal project") : undefined,
      })),
    [projects, locale, personalProjectDisplayName]
  );
  const groupOptions = useMemo<QuickSelectOption[]>(
    () => [
      { value: "", label: tr(locale, "À trier (auto)", "Inbox (auto)") },
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
      setQuickError(tr(locale, "Choisissez un projet.", "Select a project."));
      return;
    }
    if (!title) {
      setQuickError(tr(locale, "Le titre est requis.", "Title is required."));
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
          dueTime: quickDueTime || undefined,
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
          setQuickError(tr(locale, "Catégorie invalide pour ce projet.", "Invalid category for this project."));
          return;
        }
        setQuickError(tr(locale, "Impossible de créer la tâche.", "Unable to create task."));
      }
    });
  };

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label={tr(locale, "En cours", "In progress")} value={stats.total} color="indigo" active={filter === "all"} onClick={() => setFilter("all")} />
        <StatCard label={tr(locale, "En retard", "Late")} value={stats.late} color={stats.late > 0 ? "red" : "gray"} active={filter === "late"} onClick={() => setFilter("late")} />
        <StatCard label={tr(locale, "Cette semaine", "This week")} value={stats.today + stats.week} color="amber" active={filter === "week"} onClick={() => setFilter("week")} />
        <StatCard label={tr(locale, "Terminées", "Completed")} value={stats.done} color="green" active={filter === "done"} onClick={() => setFilter("done")} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-4 items-start">
      <div>
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">{tr(locale, "Mes tâches", "My tasks")}</h3>
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-visible">
        <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-700/20">
          <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-2">
            <input
              value={quickTitle}
              onChange={(e) => setQuickTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submitQuickTask();
                }
              }}
              placeholder={tr(locale, "Nouvelle tâche rapide…", "Quick task title...")}
              className="h-8 px-2.5 py-1 text-xs text-gray-900 dark:text-gray-50 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100"
            />
            <PrettySelect
              value={quickProjectId}
              onChange={(next) => {
                setQuickProjectId(next);
                setQuickGroupId("");
              }}
              options={projectOptions}
              placeholder={tr(locale, "Choisir un projet", "Choose a project")}
            />
            <PrettySelect
              value={quickGroupId}
              onChange={setQuickGroupId}
              options={groupOptions}
              placeholder={tr(locale, "Choisir une catégorie", "Choose a category")}
            />
            <div className="relative flex items-center gap-1 justify-end" ref={quickScheduleRef}>
              <button
                type="button"
                onClick={() => setShowQuickSchedule((prev) => !prev)}
                className={`h-8 w-8 inline-flex items-center justify-center rounded-xl border transition-colors cursor-pointer ${
                  quickDueDate || quickDueTime
                    ? "border-indigo-400 text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30"
                    : "border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-300 bg-white dark:bg-gray-700 hover:border-indigo-300 dark:hover:border-indigo-500"
                }`}
                title={tr(locale, "Date et heure", "Date and time")}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M8 7V3m8 4V3M5 11h14M7 21h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v12a2 2 0 002 2z" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {showQuickSchedule && (
                <div className="absolute z-[80] top-full right-0 mt-1 w-[min(11.5rem,calc(100vw-1.5rem))] sm:w-[14.5rem] max-w-[calc(100vw-1.5rem)] max-h-[70vh] overflow-y-auto overflow-x-hidden rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl p-2.5 space-y-2">
                  <label className="block">
                    <span className="block text-[11px] text-gray-500 dark:text-gray-400 mb-1">{tr(locale, "Date", "Date")}</span>
                    <input
                      type="date"
                      value={quickDueDate}
                      onChange={(e) => setQuickDueDate(e.target.value)}
                      className="datetime-field mx-auto block w-[9rem] max-w-full min-w-0"
                    />
                  </label>
                  <label className="block">
                    <span className="block text-[11px] text-gray-500 dark:text-gray-400 mb-1">{tr(locale, "Heure", "Time")}</span>
                    <input
                      type="time"
                      value={quickDueTime}
                      onChange={(e) => setQuickDueTime(e.target.value)}
                      className="datetime-field mx-auto block w-[9rem] max-w-full min-w-0"
                    />
                  </label>
                  {quickDueTime && (
                    <label className="block">
                      <span className="block text-[11px] text-gray-500 dark:text-gray-400 mb-1">{tr(locale, "Rappel", "Reminder")}</span>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 min-w-0">
                        <select
                          value={quickReminder}
                          onChange={(e) => setQuickReminder(e.target.value)}
                          className="mx-auto block w-[9rem] max-w-full min-w-0 sm:w-full sm:flex-1 select-unified select-unified-sm"
                        >
                          <option value="0">{tr(locale, "À l'heure", "At time")}</option>
                          <option value="2">{tr(locale, "2 min avant", "2 min before")}</option>
                          <option value="5">{tr(locale, "5 min avant", "5 min before")}</option>
                          <option value="15">{tr(locale, "15 min avant", "15 min before")}</option>
                          <option value="30">{tr(locale, "30 min avant", "30 min before")}</option>
                          <option value="custom">{tr(locale, "Personnalisé", "Custom")}</option>
                        </select>
                        {quickReminder === "custom" && (
                          <input
                            type="number"
                            min={0}
                            max={1440}
                            value={quickReminderCustom}
                            onChange={(e) => setQuickReminderCustom(e.target.value)}
                            className="datetime-field mx-auto block w-[9rem] max-w-full min-w-0 sm:w-20"
                            placeholder="min"
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
                    className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors cursor-pointer"
                  >
                    {tr(locale, "Effacer", "Clear")}
                  </button>
                </div>
              )}
              <button
                type="button"
                onClick={submitQuickTask}
                disabled={isQuickPending || !quickProjectId || !quickTitle.trim()}
                className="h-8 px-2.5 text-xs font-medium rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                {tr(locale, "Ajouter", "Add")}
              </button>
            </div>
          </div>
          {quickError && <p className="mt-2 text-xs text-red-500">{quickError}</p>}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-5 py-3 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-1 overflow-x-auto">
            {filterTabs.map((f) => (
              <button
                key={f.key}
                onClick={() => { setSelectedDate(null); setFilter(f.key); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors cursor-pointer ${
                  filter === f.key ? "bg-indigo-600 text-white" : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                }`}
              >
                {f.label}
                {f.count > 0 && (
                  <span
                    className={`text-[10px] font-semibold rounded-full px-1.5 py-0.5 leading-none ${
                      filter === f.key
                        ? "bg-white/20 text-white"
                        : f.key === "late" && f.count > 0
                          ? "bg-red-100 text-red-600"
                          : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                    }`}
                  >
                    {f.count}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="relative flex-shrink-0 w-full sm:w-auto">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tr(locale, "Rechercher...", "Search...")}
              className="pl-8 pr-3 py-1.5 text-xs text-gray-900 dark:text-gray-50 border border-gray-200 dark:border-gray-600 rounded-lg outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 w-full sm:w-36 bg-gray-50 dark:bg-gray-700 transition-colors placeholder-gray-400 dark:placeholder-gray-500"
            />
          </div>
        </div>

        {grouped.length === 0 ? (
          <div className="py-14 text-center">
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
              {selectedDate
                ? tr(locale, "Aucune tâche sur cette date", "No tasks on this date")
                : filter === "done"
                  ? tr(locale, "Aucune tâche terminée", "No completed tasks")
                  : filter === "late"
                    ? tr(locale, "Aucune tâche en retard", "No late tasks")
                    : tr(locale, "Aucune tâche ici", "No tasks here")}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {selectedDate
                ? tr(locale, "Sélectionnez une autre date dans le calendrier", "Select another date in the calendar")
                : filter === "all"
                  ? tr(locale, "Les tâches qui vous sont assignées apparaîtront ici", "Tasks assigned to you will appear here")
                  : tr(locale, "Modifiez le filtre pour voir d'autres tâches", "Change the filter to see other tasks")}
            </p>
          </div>
        ) : (
          <div
            className={shouldScrollTaskList ? "overflow-y-auto" : ""}
            style={shouldScrollTaskList ? { maxHeight: `${listMaxHeightPx}px` } : undefined}
          >
            {grouped.map((group, gi) => {
              const isCollapsed = collapsed.has(group.projectId);
              return (
                <div key={group.projectId} className={gi > 0 ? "border-t border-gray-100 dark:border-gray-700" : ""}>
                  <button
                    onClick={() =>
                      setCollapsed((prev) => {
                        const next = new Set(prev);
                        if (next.has(group.projectId)) next.delete(group.projectId);
                        else next.add(group.projectId);
                        return next;
                      })
                    }
                    className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center gap-2.5">
                      <svg className={`w-3 h-3 text-gray-400 transition-transform ${isCollapsed ? "-rotate-90" : ""}`} fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                      <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{group.projectName}</span>
                      <span className="text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700 rounded-full px-2 py-0.5">{group.tasks.length}</span>
                    </div>
                    <Link
                      href={`/projects/${group.projectId}`}
                      onClick={(e) => e.stopPropagation()}
                      className="opacity-0 group-hover:opacity-100 text-[11px] text-indigo-500 hover:text-indigo-700 flex items-center gap-1 transition-all"
                    >
                      {tr(locale, "Voir le projet", "Open project")}
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </Link>
                  </button>

                  {!isCollapsed &&
                    group.tasks.map((task, ti) => {
                      const late = isLate(task);
                      const due = fmtDate(task.dueDate, displayPrefs.dateFormat);
                      const done = isDone(task);
                      const isCompleting = completingTaskIds.has(task.id);
                      const displayDone = done || isCompleting;
                      return (
                        <div
                          key={task.id}
                          className={`flex items-center gap-3 px-5 ${displayPrefs.density === "compact" ? "py-2" : "py-3"} hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-all duration-300 group/row ${
                            isCompleting ? "opacity-50 bg-emerald-50/60 dark:bg-emerald-900/10" : ""
                          } ${
                            ti < group.tasks.length - 1 ? "border-b border-gray-50 dark:border-gray-700/50" : ""
                          }`}
                        >
                          <button
                            onClick={(e) => handleToggle(task, e)}
                            className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all duration-300 cursor-pointer hover:scale-110 ${
                              displayDone
                                ? `bg-green-500 border-green-500 ${isCompleting ? "scale-125 shadow-[0_0_0_6px_rgba(34,197,94,0.18)]" : ""}`
                                : late
                                  ? "border-red-400 hover:border-red-500"
                                  : "border-gray-300 hover:border-indigo-400"
                            }`}
                          >
                            {displayDone && (
                              <svg className={`w-2.5 h-2.5 text-white transition-transform duration-300 ${isCompleting ? "scale-110" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path d="M5 13l4 4L19 7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </button>

                          <Link href={`/projects/${task.projectId}`} className="flex-1 min-w-0 flex items-center gap-3">
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm truncate ${displayDone ? "line-through text-gray-400 dark:text-gray-500" : "text-gray-800 dark:text-gray-100"}`}>{task.title}</p>
                              <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 truncate">{task.groupName}</p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {task.priority && <span className={`text-[11px] font-medium ${PRIORITY_COLORS[task.priority] ?? "text-gray-400"}`}>{task.priority}</span>}
                              {task.status && (
                                <span
                                  className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                                    STATUS_COLORS[toCanonicalStatus(task.status) ?? ""] ?? "bg-gray-100 text-gray-500"
                                  }`}
                                >
                                  {getStatusLabel(task.status) ?? task.status}
                                </span>
                              )}
                              {due && (
                                <span className={`text-[11px] tabular-nums ${late ? "text-red-500 font-medium" : isToday(task.dueDate) ? "text-amber-600 font-medium" : "text-gray-400"}`}>
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
      </div>
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-4 xl:mt-8">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{tr(locale, "Calendrier", "Calendar")}</h3>
          {selectedDate && (
            <button
              onClick={() => setSelectedDate(null)}
              className="text-[11px] text-indigo-500 hover:text-indigo-700 transition-colors cursor-pointer"
            >
              {tr(locale, "Réinitialiser", "Reset")}
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
      </div>
    </section>
  );
}
