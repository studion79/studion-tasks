"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { markAllMyNotificationsRead, markNotificationRead } from "@/lib/actions";

// ── Types ─────────────────────────────────────────────────────────────────────

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

type Notification = {
  id: string;
  type: string;
  message: string;
  isRead: boolean;
  createdAt: Date;
  taskId: string | null;
  projectId: string | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function today() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseDate(s: string | null): Date | null {
  if (!s) return null;
  return new Date(s + (s.includes("T") ? "" : "T00:00:00"));
}

function fmtDate(d: string | null) {
  const v = parseDate(d);
  if (!v) return null;
  const now = today();
  const diff = Math.round((v.getTime() - now.getTime()) / 86400000);
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return "Demain";
  if (diff < 0) return `Retard ${-diff}j`;
  return v.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function isLate(task: MyTask) {
  const d = parseDate(task.dueDate);
  return !!d && d < today() && !task.completedAt;
}

function isToday(task: MyTask) {
  const d = parseDate(task.dueDate);
  if (!d) return false;
  const t = today();
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
}

function isThisWeek(task: MyTask) {
  const d = parseDate(task.dueDate);
  if (!d) return false;
  const now = today();
  const sun = new Date(now); sun.setDate(now.getDate() + (7 - now.getDay()) % 7 + 7);
  return d > now && d <= sun;
}

const STATUS_DOT: Record<string, string> = {
  DONE: "bg-emerald-400",
  WORKING: "bg-blue-400",
  STUCK: "bg-red-400",
  NOT_STARTED: "bg-gray-300",
};

// ── Mini-calendar ─────────────────────────────────────────────────────────────

function MiniCalendar({ tasks }: { tasks: MyTask[] }) {
  const [offset, setOffset] = useState(0);
  const base = new Date();
  const year = base.getFullYear();
  const month = base.getMonth() + offset;
  const viewDate = new Date(year, month, 1);
  const monthLabel = viewDate.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

  const firstDay = viewDate.getDay() === 0 ? 6 : viewDate.getDay() - 1; // Mon=0
  const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();

  // Map of day-of-month → tasks
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

  const todayNum = base.getMonth() === viewDate.getMonth() && base.getFullYear() === viewDate.getFullYear()
    ? base.getDate() : -1;

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // Pad to full weeks
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
      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {["L","M","M","J","V","S","D"].map((d, i) => (
          <div key={i} className="text-center text-[10px] font-medium text-gray-400 dark:text-gray-500">{d}</div>
        ))}
      </div>
      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const dayTasks = tasksByDay[day] ?? [];
          const isT = day === todayNum;
          const hasLate = dayTasks.some((t) => isLate(t));
          return (
            <div
              key={i}
              className={`flex flex-col items-center rounded-md py-0.5 ${isT ? "bg-indigo-100 dark:bg-indigo-900/40" : ""}`}
            >
              <span className={`text-[11px] leading-none ${isT ? "font-bold text-indigo-600 dark:text-indigo-400" : "text-gray-600 dark:text-gray-400"}`}>
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
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Notifications panel ───────────────────────────────────────────────────────

function NotificationsPanel({
  notifications,
  onClose,
}: {
  notifications: Notification[];
  onClose: () => void;
}) {
  const [notifs, setNotifs] = useState(notifications);
  const [, startTransition] = useTransition();
  const unreadCount = notifs.filter((n) => !n.isRead).length;

  const handleMarkAll = () => {
    setNotifs((prev) => prev.map((n) => ({ ...n, isRead: true })));
    startTransition(async () => { await markAllMyNotificationsRead(); });
  };

  const handleMarkOne = (id: string) => {
    setNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    startTransition(async () => { await markNotificationRead(id); });
  };

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-xl z-50 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">Notifications</span>
          {unreadCount > 0 && (
            <button onClick={handleMarkAll} className="text-xs text-indigo-500 hover:text-indigo-700 cursor-pointer">
              Tout marquer lu
            </button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto divide-y divide-gray-50 dark:divide-gray-700/50">
          {notifs.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-6">Aucune notification</p>
          ) : notifs.map((n) => (
            <div
              key={n.id}
              className={`px-4 py-3 flex items-start gap-3 ${!n.isRead ? "bg-indigo-50/60 dark:bg-indigo-900/20" : ""}`}
            >
              <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${!n.isRead ? "bg-indigo-500" : "bg-transparent"}`} />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-700 dark:text-gray-300 leading-snug">{n.message}</p>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
                  {new Date(n.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
              {!n.isRead && (
                <button onClick={() => handleMarkOne(n.id)} className="text-[10px] text-gray-400 hover:text-indigo-500 cursor-pointer flex-shrink-0 mt-0.5">✓</button>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ── Main sidebar ──────────────────────────────────────────────────────────────

export function DashboardSidebar({
  tasks,
  notifications,
}: {
  tasks: MyTask[];
  notifications: Notification[];
}) {
  const [showNotif, setShowNotif] = useState(false);
  const [taskFilter, setTaskFilter] = useState<"today" | "week" | "late" | "all">("today");
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set());

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const activeTasks = tasks.filter((t) => !t.completedAt);

  const lateCount = activeTasks.filter((t) => isLate(t)).length;
  const todayCount = activeTasks.filter((t) => isToday(t)).length;
  const weekCount = activeTasks.filter((t) => isThisWeek(t)).length;

  const filtered = activeTasks.filter((t) => {
    if (taskFilter === "today") return isToday(t);
    if (taskFilter === "week") return isThisWeek(t);
    if (taskFilter === "late") return isLate(t);
    return true;
  });

  // Group filtered tasks by project
  const byProject: { projectId: string; projectName: string; tasks: MyTask[] }[] = [];
  for (const task of filtered) {
    const existing = byProject.find((g) => g.projectId === task.projectId);
    if (existing) { existing.tasks.push(task); }
    else { byProject.push({ projectId: task.projectId, projectName: task.projectName, tasks: [task] }); }
  }

  const toggleProject = (projectId: string) => {
    setCollapsedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId); else next.add(projectId);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Mon tableau de bord</h2>
        <div className="relative">
          <button
            onClick={() => setShowNotif((v) => !v)}
            className="relative p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
            title="Notifications"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
              <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-red-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center leading-none">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
          {showNotif && (
            <NotificationsPanel notifications={notifications} onClose={() => setShowNotif(false)} />
          )}
        </div>
      </div>

      {/* Stat chips */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-3 text-center">
          <p className="text-xl font-bold text-gray-900 dark:text-gray-50">{activeTasks.length}</p>
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">En cours</p>
        </div>
        <div
          className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-3 text-center cursor-pointer hover:border-indigo-200 dark:hover:border-indigo-700 transition-colors"
          onClick={() => setTaskFilter("today")}
        >
          <p className={`text-xl font-bold ${todayCount > 0 ? "text-indigo-600 dark:text-indigo-400" : "text-gray-900 dark:text-gray-50"}`}>{todayCount}</p>
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">Aujourd&apos;hui</p>
        </div>
        <div
          className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-3 text-center cursor-pointer hover:border-red-200 dark:hover:border-red-800 transition-colors"
          onClick={() => setTaskFilter("late")}
        >
          <p className={`text-xl font-bold ${lateCount > 0 ? "text-red-500" : "text-gray-900 dark:text-gray-50"}`}>{lateCount}</p>
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">En retard</p>
        </div>
      </div>

      {/* My tasks - grouped by project */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
        {/* Header + filters */}
        <div className="flex items-center gap-2 px-4 pt-3 pb-2.5 border-b border-gray-100 dark:border-gray-700">
          <p className="text-xs font-semibold text-gray-800 dark:text-gray-100 flex-1">Mes tâches</p>
          <div className="flex gap-0.5">
            {([
              { key: "today", label: "Auj.", count: todayCount },
              { key: "week", label: "Sem.", count: weekCount },
              { key: "late", label: "Retard", count: lateCount },
              { key: "all", label: "Tout", count: activeTasks.length },
            ] as { key: typeof taskFilter; label: string; count: number }[]).map(({ key, label, count }) => (
              <button
                key={key}
                onClick={() => setTaskFilter(key)}
                className={`text-[10px] px-1.5 py-0.5 rounded-md transition-colors cursor-pointer ${taskFilter === key ? "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-semibold" : "text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700"}`}
              >
                {label}{count > 0 ? ` · ${count}` : ""}
              </button>
            ))}
          </div>
        </div>

        {/* Tasks grouped by project */}
        <div className="max-h-[480px] overflow-y-auto">
          {byProject.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-6">
              {taskFilter === "today" ? "Aucune tâche pour aujourd'hui 🎉" : "Aucune tâche"}
            </p>
          ) : (
            <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
              {byProject.map(({ projectId, projectName, tasks: projectTasks }) => {
                const isCollapsed = collapsedProjects.has(projectId);
                return (
                  <div key={projectId}>
                    {/* Project group header */}
                    <button
                      onClick={() => toggleProject(projectId)}
                      className="w-full flex items-center gap-2 px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors cursor-pointer"
                    >
                      <svg className={`w-3 h-3 text-gray-400 flex-shrink-0 transition-transform ${isCollapsed ? "-rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path d="M19 9l-7 7-7-7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <span className="text-[11px] font-semibold text-gray-600 dark:text-gray-400 flex-1 text-left truncate">
                        {projectName}
                      </span>
                      <span className="text-[10px] text-gray-400 dark:text-gray-500 tabular-nums">{projectTasks.length}</span>
                    </button>
                    {/* Tasks */}
                    {!isCollapsed && (
                      <div className="pb-1">
                        {projectTasks.map((task) => {
                          const dateStr = fmtDate(task.dueDate);
                          const late = isLate(task);
                          const statusColor = STATUS_DOT[task.status ?? ""] ?? "bg-gray-300";
                          return (
                            <Link
                              key={task.id}
                              href={`/projects/${task.projectId}`}
                              className="flex items-center gap-2.5 px-4 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors group"
                            >
                              <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusColor}`} />
                              <p className="text-xs text-gray-700 dark:text-gray-300 flex-1 truncate leading-snug group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                                {task.title}
                              </p>
                              {dateStr && (
                                <span className={`text-[10px] flex-shrink-0 font-medium tabular-nums ${late ? "text-red-500" : "text-gray-400 dark:text-gray-500"}`}>
                                  {dateStr}
                                </span>
                              )}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>

      {/* Mini calendar */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4">
        <MiniCalendar tasks={tasks} />
      </div>
    </div>
  );
}
