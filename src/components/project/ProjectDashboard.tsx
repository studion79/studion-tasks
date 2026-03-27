"use client";

import { useState, useTransition } from "react";
import type { ProjectWithRelations, TaskWithFields } from "@/lib/types";
import { AVAILABLE_WIDGETS } from "@/lib/types";
import { STATUS_OPTIONS, PRIORITY_OPTIONS } from "@/lib/constants";
import { toggleDashboardWidget } from "@/lib/actions";

// --- Helpers ---
function fv(task: TaskWithFields, colId: string | undefined): string | null {
  if (!colId) return null;
  return task.fieldValues.find((f) => f.columnId === colId)?.value ?? null;
}

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

// --- Widget shells ---
function Widget({
  title,
  children,
  span = 1,
}: {
  title: string;
  children: React.ReactNode;
  span?: 1 | 2;
}) {
  return (
    <div
      className={`bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm ${
        span === 2 ? "col-span-2" : ""
      }`}
    >
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-4">
        {title}
      </p>
      {children}
    </div>
  );
}

// --- Progress bar ---
function Bar({ pct, className }: { pct: number; className: string }) {
  return (
    <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${className}`}
        style={{ width: `${Math.min(pct, 100)}%` }}
      />
    </div>
  );
}

// --- Mini SVG line chart ---
function LineChart({
  points,
  idealPoints,
  width = 300,
  height = 100,
  color = "#6366f1",
}: {
  points: { x: number; y: number }[];
  idealPoints?: { x: number; y: number }[];
  width?: number;
  height?: number;
  color?: string;
}) {
  if (points.length < 2 && (!idealPoints || idealPoints.length < 2)) {
    return (
      <div className="flex items-center justify-center h-24 text-xs text-gray-300 italic">
        Pas encore de données
      </div>
    );
  }

  const pad = { top: 8, right: 8, bottom: 24, left: 28 };
  const w = width - pad.left - pad.right;
  const h = height - pad.top - pad.bottom;

  const allY = [...points.map((p) => p.y), ...(idealPoints ?? []).map((p) => p.y)];
  const maxY = Math.max(...allY, 1);
  const allX = [...points.map((p) => p.x), ...(idealPoints ?? []).map((p) => p.x)];
  const minX = Math.min(...allX);
  const maxX = Math.max(...allX, minX + 1);

  const px = (x: number) => pad.left + ((x - minX) / (maxX - minX)) * w;
  const py = (y: number) => pad.top + h - (y / maxY) * h;

  const toPath = (pts: { x: number; y: number }[]) =>
    pts.map((p, i) => `${i === 0 ? "M" : "L"} ${px(p.x).toFixed(1)} ${py(p.y).toFixed(1)}`).join(" ");

  const yTicks = [0, Math.round(maxY / 2), maxY];
  const xTickCount = Math.min(5, points.length || (idealPoints?.length ?? 0));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }}>
      {/* Y grid lines */}
      {yTicks.map((v) => (
        <g key={v}>
          <line
            x1={pad.left}
            x2={pad.left + w}
            y1={py(v)}
            y2={py(v)}
            stroke="#f3f4f6"
            strokeWidth="1"
          />
          <text x={pad.left - 4} y={py(v) + 3} fontSize="8" fill="#9ca3af" textAnchor="end">
            {v}
          </text>
        </g>
      ))}

      {/* Ideal line */}
      {idealPoints && idealPoints.length >= 2 && (
        <path
          d={toPath(idealPoints)}
          fill="none"
          stroke="#d1d5db"
          strokeWidth="1.5"
          strokeDasharray="4 3"
        />
      )}

      {/* Actual line */}
      {points.length >= 2 && (
        <path d={toPath(points)} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      )}

      {/* Dots for actual */}
      {points.map((p, i) => (
        <circle key={i} cx={px(p.x)} cy={py(p.y)} r="2.5" fill={color} />
      ))}

      {/* X labels */}
      {points.length > 0 &&
        (() => {
          const step = Math.max(1, Math.floor(points.length / xTickCount));
          return points
            .filter((_, i) => i % step === 0 || i === points.length - 1)
            .map((p, i) => (
              <text key={i} x={px(p.x)} y={height - 6} fontSize="7" fill="#9ca3af" textAnchor="middle">
                {new Date(p.x).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}
              </text>
            ));
        })()}
    </svg>
  );
}

// --- Mini SVG bar chart ---
function BarChart({
  bars,
  color = "#6366f1",
  height = 100,
}: {
  bars: { label: string; value: number }[];
  color?: string;
  height?: number;
}) {
  if (bars.length === 0 || bars.every((b) => b.value === 0)) {
    return (
      <div className="flex items-center justify-center h-24 text-xs text-gray-300 italic">
        Pas encore de données
      </div>
    );
  }

  const maxVal = Math.max(...bars.map((b) => b.value), 1);
  const barW = 28;
  const gap = 8;
  const padL = 28;
  const padB = 24;
  const padT = 8;
  const chartH = height - padT - padB;
  const totalW = padL + bars.length * (barW + gap) + gap;

  return (
    <svg viewBox={`0 0 ${totalW} ${height}`} className="w-full" style={{ height }}>
      {[0, Math.round(maxVal / 2), maxVal].map((v) => {
        const y = padT + chartH - (v / maxVal) * chartH;
        return (
          <g key={v}>
            <line x1={padL} x2={totalW} y1={y} y2={y} stroke="#f3f4f6" strokeWidth="1" />
            <text x={padL - 4} y={y + 3} fontSize="8" fill="#9ca3af" textAnchor="end">
              {v}
            </text>
          </g>
        );
      })}
      {bars.map((b, i) => {
        const x = padL + gap + i * (barW + gap);
        const bh = (b.value / maxVal) * chartH;
        const y = padT + chartH - bh;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={bh} rx="3" fill={color} fillOpacity="0.85" />
            {b.value > 0 && (
              <text x={x + barW / 2} y={y - 3} fontSize="8" fill={color} textAnchor="middle" fontWeight="600">
                {b.value}
              </text>
            )}
            <text x={x + barW / 2} y={height - 6} fontSize="8" fill="#9ca3af" textAnchor="middle">
              {b.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// --- Main ---
export function ProjectDashboard({ project }: { project: ProjectWithRelations }) {
  const [widgetStates, setWidgetStates] = useState(
    Object.fromEntries(project.dashboardWidgets.map((w) => [w.id, w.isActive]))
  );
  const [showConfig, setShowConfig] = useState(false);
  const [, startTransition] = useTransition();

  const toggleWidget = (widgetId: string) => {
    const newState = !widgetStates[widgetId];
    setWidgetStates((prev) => ({ ...prev, [widgetId]: newState }));
    startTransition(async () => { await toggleDashboardWidget(widgetId, newState); });
  };

  const activeWidgets = project.dashboardWidgets.filter((w) => widgetStates[w.id]);
  const { groups, columns } = project;
  const allTasks = groups.flatMap((g) => g.tasks);
  const total = allTasks.length;

  const statusCol = columns.find((c) => c.type === "STATUS");
  const dueDateCol = columns.find((c) => c.type === "DUE_DATE");
  const ownerCol = columns.find((c) => c.type === "OWNER");
  const budgetCol = columns.find((c) => c.type === "BUDGET");

  const today = toDateStr(new Date());
  const in7 = toDateStr(addDays(new Date(), 7));
  const in30 = toDateStr(addDays(new Date(), 30));

  // Status distribution
  const statusCounts = STATUS_OPTIONS.map((opt) => ({
    ...opt,
    count: allTasks.filter((t) => fv(t, statusCol?.id) === opt.value).length,
  }));
  const doneCount = statusCounts.find((s) => s.value === "DONE")?.count ?? 0;
  const completionPct = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  // Overdue
  const overdueTasksList = allTasks.filter((t) => {
    const due = fv(t, dueDateCol?.id);
    const status = fv(t, statusCol?.id);
    return due && due < today && status !== "DONE";
  });

  // Owner distribution
  const ownerMap = new Map<string, number>();
  for (const task of allTasks) {
    const o = fv(task, ownerCol?.id);
    if (o) ownerMap.set(o, (ownerMap.get(o) ?? 0) + 1);
  }
  const ownerEntries = Array.from(ownerMap.entries()).sort((a, b) => b[1] - a[1]);

  // By due date proximity
  const withDue = allTasks.filter(
    (t) => fv(t, dueDateCol?.id) && fv(t, statusCol?.id) !== "DONE"
  );
  const dueGroups = {
    overdue: withDue.filter((t) => fv(t, dueDateCol!.id)! < today).length,
    thisWeek: withDue.filter((t) => {
      const d = fv(t, dueDateCol!.id)!;
      return d >= today && d <= in7;
    }).length,
    thisMonth: withDue.filter((t) => {
      const d = fv(t, dueDateCol!.id)!;
      return d > in7 && d <= in30;
    }).length,
    later: withDue.filter((t) => fv(t, dueDateCol!.id)! > in30).length,
  };

  // --- Priority breakdown ---
  const priorityCounts = PRIORITY_OPTIONS.map((opt) => ({
    ...opt,
    count: allTasks.filter((t) => fv(t, columns.find((c) => c.type === "PRIORITY")?.id) === opt.value).length,
  }));
  const noPriority = allTasks.filter((t) => !fv(t, columns.find((c) => c.type === "PRIORITY")?.id)).length;

  // --- Completion by group ---
  const groupProgress = groups.map((g) => {
    const gTotal = g.tasks.length;
    const gDone = g.tasks.filter((t) => fv(t, statusCol?.id) === "DONE").length;
    return { name: g.name, color: g.color, total: gTotal, done: gDone };
  });

  // --- Budget total ---
  const budgetTotal = budgetCol
    ? allTasks.reduce((sum, t) => {
        const val = fv(t, budgetCol.id);
        return sum + (val ? parseFloat(val) || 0 : 0);
      }, 0)
    : 0;
  const budgetDone = budgetCol
    ? allTasks
        .filter((t) => fv(t, statusCol?.id) === "DONE")
        .reduce((sum, t) => {
          const val = fv(t, budgetCol.id);
          return sum + (val ? parseFloat(val) || 0 : 0);
        }, 0)
    : 0;

  // --- Burndown (cumulative completedAt over last 30 days) ---
  const burndownWindow = 30;
  const burndownStart = addDays(new Date(), -burndownWindow);
  const burndownDays: { x: number; y: number }[] = [];
  for (let i = 0; i <= burndownWindow; i++) {
    const d = addDays(burndownStart, i);
    const dStr = toDateStr(d);
    const cumCompleted = allTasks.filter((t) => {
      const ca = (t as TaskWithFields & { completedAt?: Date | null }).completedAt;
      return ca && toDateStr(new Date(ca)) <= dStr;
    }).length;
    burndownDays.push({ x: d.getTime(), y: cumCompleted });
  }
  // Remove trailing zeros at start if no completions yet
  const firstNonZero = burndownDays.findIndex((p) => p.y > 0);
  const burndownPoints = firstNonZero === -1 ? [] : burndownDays.slice(Math.max(0, firstNonZero - 1));
  // Ideal line: 0 at burndownStart → total at today
  const idealBurndown = [
    { x: burndownStart.getTime(), y: 0 },
    { x: new Date().getTime(), y: total },
  ];

  // --- Velocity (tasks completed per week, last 6 weeks) ---
  const velocityWeeks = 6;
  const velocityBars: { label: string; value: number }[] = [];
  for (let i = velocityWeeks - 1; i >= 0; i--) {
    const weekStart = addDays(new Date(), -(i + 1) * 7);
    const weekEnd = addDays(new Date(), -i * 7 - 1);
    const weekStartStr = toDateStr(weekStart);
    const weekEndStr = toDateStr(weekEnd);
    const count = allTasks.filter((t) => {
      const ca = (t as TaskWithFields & { completedAt?: Date | null }).completedAt;
      if (!ca) return false;
      const caStr = toDateStr(new Date(ca));
      return caStr >= weekStartStr && caStr <= weekEndStr;
    }).length;
    const label = weekStart.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
    velocityBars.push({ label, value: count });
  }

  const widgetLabels: Record<string, string> = {
    TASK_OVERVIEW: "Vue d'ensemble",
    BY_STATUS: "Répartition par statut",
    BY_OWNER: "Par responsable",
    OVERDUE: "Tâches en retard",
    BY_DUE_DATE: "Par échéance",
    PRIORITY_BREAKDOWN: "Par priorité",
    COMPLETION_BY_GROUP: "Avancement par groupe",
    BUDGET_TOTAL: "Budget total",
    BURNDOWN: "Burndown — tâches complétées",
    VELOCITY: "Vélocité — tâches/semaine",
  };

  // Widget span (some charts need 2 cols)
  const widgetSpan: Record<string, 1 | 2> = {
    BURNDOWN: 2,
    VELOCITY: 2,
  };

  const widgets: Record<string, React.ReactNode> = {
    TASK_OVERVIEW: (
      <div>
        <div className="flex items-end justify-between mb-4">
          <div>
            <p className="text-4xl font-bold text-gray-900 leading-none">{total}</p>
            <p className="text-sm text-gray-500 mt-1">tâche{total !== 1 ? "s" : ""} au total</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-indigo-600 leading-none">{completionPct}%</p>
            <p className="text-xs text-gray-400 mt-1">complétées</p>
          </div>
        </div>
        <Bar pct={completionPct} className="bg-indigo-500" />
        <div className="flex items-center justify-between mt-3 text-xs text-gray-500">
          <span>{doneCount} terminées</span>
          <span>{total - doneCount} restantes</span>
        </div>
      </div>
    ),

    BY_STATUS: (
      <div className="space-y-3">
        {statusCounts.map((s) => (
          <div key={s.value}>
            <div className="flex items-center justify-between mb-1">
              <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${s.color}`}>
                {s.label}
              </span>
              <span className="text-xs font-semibold text-gray-700 tabular-nums">
                {s.count}
                {total > 0 && (
                  <span className="font-normal text-gray-400 ml-1">
                    ({Math.round((s.count / total) * 100)}%)
                  </span>
                )}
              </span>
            </div>
            <Bar
              pct={total > 0 ? (s.count / total) * 100 : 0}
              className={s.color.split(" ")[0].replace("bg-", "bg-")}
            />
          </div>
        ))}
        {total === 0 && <p className="text-sm text-gray-400 italic">Aucune tâche</p>}
      </div>
    ),

    BY_OWNER: (
      <div>
        {ownerEntries.length === 0 ? (
          <p className="text-sm text-gray-400 italic">Aucun responsable assigné</p>
        ) : (
          <div className="space-y-2.5">
            {ownerEntries.slice(0, 6).map(([name, count]) => (
              <div key={name} className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-[10px] font-bold text-indigo-600 uppercase">
                    {name.charAt(0)}
                  </span>
                </div>
                <span className="text-sm text-gray-700 flex-1 truncate">{name}</span>
                <div className="flex items-center gap-2">
                  <div className="w-16 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="h-full bg-indigo-400 rounded-full"
                      style={{ width: `${(count / total) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-gray-700 tabular-nums w-4 text-right">
                    {count}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    ),

    OVERDUE: (
      <div>
        <div className="flex items-center gap-3 mb-3">
          <div
            className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${
              overdueTasksList.length > 0 ? "bg-red-50" : "bg-gray-50"
            }`}
          >
            <svg
              className={`w-5 h-5 ${overdueTasksList.length > 0 ? "text-red-500" : "text-gray-400"}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 9v4m0 4h.01M12 3a9 9 0 100 18A9 9 0 0012 3z" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <p
              className={`text-3xl font-bold leading-none ${
                overdueTasksList.length > 0 ? "text-red-600" : "text-gray-300"
              }`}
            >
              {overdueTasksList.length}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">tâche{overdueTasksList.length !== 1 ? "s" : ""} en retard</p>
          </div>
        </div>
        {overdueTasksList.length > 0 && (
          <div className="space-y-1 mt-2 border-t border-gray-100 pt-2">
            {overdueTasksList.slice(0, 4).map((t) => (
              <p key={t.id} className="text-xs text-gray-600 truncate">
                <span className="text-red-400 mr-1.5">·</span>
                {t.title}
              </p>
            ))}
            {overdueTasksList.length > 4 && (
              <p className="text-xs text-gray-400">+{overdueTasksList.length - 4} autres</p>
            )}
          </div>
        )}
      </div>
    ),

    BY_DUE_DATE: (
      <div>
        {!dueDateCol ? (
          <p className="text-sm text-gray-400 italic">Colonne "Due date" inactive</p>
        ) : (
          <div className="space-y-2">
            {[
              { label: "En retard", count: dueGroups.overdue, color: "text-red-600", dot: "bg-red-400" },
              { label: "Cette semaine", count: dueGroups.thisWeek, color: "text-amber-700", dot: "bg-amber-400" },
              { label: "Ce mois", count: dueGroups.thisMonth, color: "text-blue-700", dot: "bg-blue-400" },
              { label: "Plus tard", count: dueGroups.later, color: "text-gray-600", dot: "bg-gray-300" },
            ].map(({ label, count, color, dot }) => (
              <div key={label} className="flex items-center gap-2.5 py-0.5">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />
                <span className="text-sm text-gray-600 flex-1">{label}</span>
                <span className={`text-sm font-semibold tabular-nums ${count > 0 ? color : "text-gray-300"}`}>
                  {count}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    ),

    PRIORITY_BREAKDOWN: (
      <div className="space-y-2.5">
        {priorityCounts.map((p) => (
          <div key={p.value}>
            <div className="flex items-center justify-between mb-1">
              <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${p.color}`}>
                {p.label}
              </span>
              <span className="text-xs font-semibold text-gray-700 tabular-nums">
                {p.count}
                {total > 0 && <span className="font-normal text-gray-400 ml-1">({Math.round((p.count / total) * 100)}%)</span>}
              </span>
            </div>
            <Bar pct={total > 0 ? (p.count / total) * 100 : 0} className="bg-gray-400" />
          </div>
        ))}
        {noPriority > 0 && (
          <div className="flex items-center justify-between text-xs text-gray-400 pt-1 border-t border-gray-100">
            <span>Sans priorité</span>
            <span>{noPriority}</span>
          </div>
        )}
        {total === 0 && <p className="text-sm text-gray-400 italic">Aucune tâche</p>}
      </div>
    ),

    COMPLETION_BY_GROUP: (
      <div className="space-y-3">
        {groupProgress.length === 0 ? (
          <p className="text-sm text-gray-400 italic">Aucun groupe</p>
        ) : (
          groupProgress.map((g) => (
            <div key={g.name}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: g.color }} />
                  <span className="text-xs text-gray-700 truncate">{g.name}</span>
                </div>
                <span className="text-xs font-semibold text-gray-700 tabular-nums ml-2 flex-shrink-0">
                  {g.done}/{g.total}
                  <span className="font-normal text-gray-400 ml-1">
                    ({g.total > 0 ? Math.round((g.done / g.total) * 100) : 0}%)
                  </span>
                </span>
              </div>
              <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${g.total > 0 ? Math.min((g.done / g.total) * 100, 100) : 0}%`,
                    backgroundColor: g.color,
                  }}
                />
              </div>
            </div>
          ))
        )}
      </div>
    ),

    BUDGET_TOTAL: (
      <div>
        {!budgetCol ? (
          <p className="text-sm text-gray-400 italic">Colonne "Budget" inactive</p>
        ) : (
          <>
            <div className="flex items-end justify-between mb-4">
              <div>
                <p className="text-3xl font-bold text-gray-900 leading-none">
                  {budgetTotal.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })}
                </p>
                <p className="text-xs text-gray-500 mt-1">budget total alloué</p>
              </div>
              {budgetTotal > 0 && (
                <div className="text-right">
                  <p className="text-xl font-bold text-emerald-600 leading-none">
                    {budgetDone.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">tâches terminées</p>
                </div>
              )}
            </div>
            {budgetTotal > 0 && (
              <>
                <Bar pct={(budgetDone / budgetTotal) * 100} className="bg-emerald-500" />
                <div className="flex items-center justify-between mt-2 text-xs text-gray-400">
                  <span>{Math.round((budgetDone / budgetTotal) * 100)}% du budget complété</span>
                  <span>{(budgetTotal - budgetDone).toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })} restant</span>
                </div>
              </>
            )}
          </>
        )}
      </div>
    ),

    BURNDOWN: (
      <div>
        <div className="flex items-center gap-4 mb-3 text-xs text-gray-400">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-6 border-t-2 border-dashed border-gray-300" />
            Idéal (linéaire)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-6 border-t-2 border-indigo-500" />
            Réel
          </span>
        </div>
        <LineChart
          points={burndownPoints}
          idealPoints={idealBurndown}
          width={580}
          height={120}
          color="#6366f1"
        />
        {burndownPoints.length === 0 && total === 0 && (
          <p className="text-xs text-gray-400 italic text-center -mt-2">Aucune tâche dans ce projet</p>
        )}
      </div>
    ),

    VELOCITY: (
      <div>
        <p className="text-xs text-gray-400 mb-2">Tâches complétées par semaine (6 dernières semaines)</p>
        <BarChart bars={velocityBars} color="#6366f1" height={120} />
      </div>
    ),
  };

  return (
    <div className="p-6 overflow-y-auto relative">
      {/* Config button */}
      <div className="flex justify-end mb-4">
        <button
          onClick={() => setShowConfig((v) => !v)}
          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors cursor-pointer ${showConfig ? "bg-indigo-50 border-indigo-300 text-indigo-600" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" strokeWidth="1.5" />
            <circle cx="12" cy="12" r="3" strokeWidth="1.5" />
          </svg>
          Configurer
        </button>
      </div>

      {/* Config panel */}
      {showConfig && (
        <div className="mb-5 bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Widgets affichés</p>
          <div className="grid grid-cols-2 gap-2">
            {project.dashboardWidgets.map((w) => {
              const meta = AVAILABLE_WIDGETS.find((m) => m.type === w.type);
              const active = widgetStates[w.id];
              return (
                <button
                  key={w.id}
                  onClick={() => toggleWidget(w.id)}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left transition-colors cursor-pointer ${active ? "border-indigo-200 bg-indigo-50" : "border-gray-200 hover:bg-gray-50"}`}
                >
                  <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${active ? "bg-indigo-500 border-indigo-500" : "border-gray-300"}`}>
                    {active && (
                      <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path d="M5 13l4 4L19 7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                  <span className={`text-xs font-medium ${active ? "text-indigo-700" : "text-gray-600"}`}>
                    {meta?.label ?? widgetLabels[w.type] ?? w.type}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {activeWidgets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <svg className="w-10 h-10 mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <rect x="3" y="3" width="8" height="5" rx="1" strokeWidth="1.5" />
            <rect x="13" y="3" width="8" height="9" rx="1" strokeWidth="1.5" />
            <rect x="3" y="10" width="8" height="11" rx="1" strokeWidth="1.5" />
            <rect x="13" y="14" width="8" height="7" rx="1" strokeWidth="1.5" />
          </svg>
          <p className="text-sm">Aucun widget actif.</p>
          <button onClick={() => setShowConfig(true)} className="mt-2 text-xs text-indigo-600 hover:underline cursor-pointer">
            Configurer le dashboard
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {activeWidgets.map((widget) => (
            <Widget
              key={widget.id}
              title={widgetLabels[widget.type] ?? widget.type}
              span={widgetSpan[widget.type] ?? 1}
            >
              {widgets[widget.type] ?? (
                <p className="text-sm text-gray-400 italic">Widget non disponible</p>
              )}
            </Widget>
          ))}
        </div>
      )}
    </div>
  );
}
