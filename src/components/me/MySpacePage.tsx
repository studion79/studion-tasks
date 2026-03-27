"use client";

import { useState, useMemo, useRef, useTransition } from "react";
import Link from "next/link";
import { updateMyProfile, updateMyPassword, updateMyAvatar, toggleMyTask } from "@/lib/actions";

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

type MyProject = {
  id: string;
  name: string;
  role: "ADMIN" | "MEMBER";
  memberCount: number;
  totalTaskCount: number;
  myTaskCount: number;
  completedCount: number;
};

type UserInfo = { id: string; name: string; email: string; avatar: string | null };
type Filter = "all" | "today" | "week" | "late" | "done";

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  "Done": "bg-green-100 text-green-700",
  "Working on it": "bg-blue-100 text-blue-700",
  "Stuck": "bg-red-100 text-red-700",
  "Not started": "bg-gray-100 text-gray-500",
  "In review": "bg-purple-100 text-purple-700",
  "Waiting": "bg-orange-100 text-orange-700",
};

const PRIORITY_COLORS: Record<string, string> = {
  "Critical": "text-red-600",
  "High": "text-orange-500",
  "Medium": "text-yellow-500",
  "Low": "text-blue-400",
};

function isToday(d: string | null) {
  if (!d) return false;
  const t = new Date(), v = new Date(d);
  return v.getFullYear() === t.getFullYear() && v.getMonth() === t.getMonth() && v.getDate() === t.getDate();
}

function isThisWeek(d: string | null) {
  if (!d) return false;
  const now = new Date(), v = new Date(d);
  const mon = new Date(now); mon.setDate(now.getDate() - now.getDay() + 1); mon.setHours(0,0,0,0);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6); sun.setHours(23,59,59,999);
  return v >= mon && v <= sun;
}

function isLate(task: MyTask) {
  if (!task.dueDate || task.completedAt) return false;
  return new Date(task.dueDate) < new Date();
}

function fmtDate(d: string | null) {
  if (!d) return null;
  const v = new Date(d), now = new Date();
  const diff = Math.round((v.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86400000);
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return "Demain";
  if (diff === -1) return "Hier";
  return v.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function initials(name: string) {
  return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

// ── Main component ────────────────────────────────────────────────────────────

export function MySpacePage({ tasks, projects, user }: { tasks: MyTask[]; projects: MyProject[]; user: UserInfo }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [showProfile, setShowProfile] = useState(false);
  const [avatarSrc, setAvatarSrc] = useState(user.avatar);
  // Optimistic toggle: taskId → true (done) | false (not done)
  const [toggleOverrides, setToggleOverrides] = useState<Record<string, boolean>>({});
  const [, startToggle] = useTransition();

  const firstName = user.name.split(" ")[0];

  const isDone = (t: MyTask) =>
    t.id in toggleOverrides ? toggleOverrides[t.id] : !!t.completedAt;

  const handleToggle = (task: MyTask, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const next = !isDone(task);
    setToggleOverrides(prev => ({ ...prev, [task.id]: next }));
    startToggle(async () => {
      try { await toggleMyTask(task.id); }
      catch { setToggleOverrides(prev => ({ ...prev, [task.id]: !next })); }
    });
  };

  const stats = useMemo(() => {
    const active = tasks.filter(t => !isDone(t));
    return {
      total: active.length,
      late: active.filter(isLate).length,
      today: active.filter(t => isToday(t.dueDate)).length,
      week: active.filter(t => isThisWeek(t.dueDate)).length,
      done: tasks.filter(isDone).length,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, toggleOverrides]);

  const filtered = useMemo(() => {
    let r = tasks;
    if (filter === "today") r = tasks.filter(t => !isDone(t) && isToday(t.dueDate));
    else if (filter === "week") r = tasks.filter(t => !isDone(t) && isThisWeek(t.dueDate));
    else if (filter === "late") r = tasks.filter(t => isLate(t) && !isDone(t));
    else if (filter === "done") r = tasks.filter(isDone);
    else r = tasks.filter(t => !isDone(t));
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter(t => t.title.toLowerCase().includes(q) || t.projectName.toLowerCase().includes(q));
    }
    return r;
  }, [tasks, filter, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, { projectId: string; projectName: string; tasks: MyTask[] }>();
    for (const t of filtered) {
      if (!map.has(t.projectId)) map.set(t.projectId, { projectId: t.projectId, projectName: t.projectName, tasks: [] });
      map.get(t.projectId)!.tasks.push(t);
    }
    return Array.from(map.values()).sort((a,b) => a.projectName.localeCompare(b.projectName));
  }, [filtered]);

  const filterTabs: { key: Filter; label: string; count: number }[] = [
    { key: "all",   label: "En cours",       count: stats.total },
    { key: "today", label: "Aujourd'hui",     count: stats.today },
    { key: "week",  label: "Cette semaine",   count: stats.week },
    { key: "late",  label: "En retard",       count: stats.late },
    { key: "done",  label: "Terminées",       count: stats.done },
  ];

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">

      {/* ── Profile card ──────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm px-6 py-5 flex items-center gap-5">
        {/* Avatar */}
        <div className="relative flex-shrink-0">
          {avatarSrc ? (
            <img src={avatarSrc} alt={user.name} className="w-16 h-16 rounded-full object-cover border-2 border-gray-100 dark:border-gray-700" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xl font-bold border-2 border-gray-100 dark:border-gray-700">
              {initials(user.name)}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-50">{user.name}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">{user.email}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            {projects.length} projet{projects.length > 1 ? "s" : ""}
            {projects.filter(p => p.role === "ADMIN").length > 0 &&
              ` · admin sur ${projects.filter(p => p.role === "ADMIN").length}`}
          </p>
        </div>

        {/* Edit button */}
        <button
          onClick={() => setShowProfile(true)}
          className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200 transition-colors cursor-pointer flex-shrink-0"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          Modifier le profil
        </button>
      </div>

      {/* ── Stats ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="En cours"      value={stats.total} color="indigo" active={filter==="all"}   onClick={() => setFilter("all")} />
        <StatCard label="En retard"     value={stats.late}  color={stats.late>0?"red":"gray"} active={filter==="late"}  onClick={() => setFilter("late")} />
        <StatCard label="Cette semaine" value={stats.today+stats.week} color="amber" active={filter==="week"}  onClick={() => setFilter("week")} />
        <StatCard label="Terminées"     value={stats.done}  color="green" active={filter==="done"}  onClick={() => setFilter("done")} />
      </div>

      {/* ── Tasks ─────────────────────────────────────────────────────────── */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">Mes tâches</h3>
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-1 overflow-x-auto">
              {filterTabs.map(f => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors cursor-pointer ${
                    filter === f.key ? "bg-indigo-600 text-white" : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                  }`}
                >
                  {f.label}
                  {f.count > 0 && (
                    <span className={`text-[10px] font-semibold rounded-full px-1.5 py-0.5 leading-none ${
                      filter === f.key ? "bg-white/20 text-white" : f.key === "late" && f.count > 0 ? "bg-red-100 text-red-600" : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                    }`}>{f.count}</span>
                  )}
                </button>
              ))}
            </div>
            <div className="relative flex-shrink-0">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher…"
                className="pl-8 pr-3 py-1.5 text-xs text-gray-900 dark:text-gray-50 border border-gray-200 dark:border-gray-600 rounded-lg outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 w-36 bg-gray-50 dark:bg-gray-700 transition-all focus:w-48 placeholder-gray-400 dark:placeholder-gray-500"
              />
            </div>
          </div>

          {/* List */}
          {grouped.length === 0 ? (
            <div className="py-14 text-center">
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                {filter === "done" ? "Aucune tâche terminée" : filter === "late" ? "Aucune tâche en retard 🎉" : "Aucune tâche ici"}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {filter === "all" ? "Les tâches qui vous sont assignées apparaîtront ici" : "Modifiez le filtre pour voir d'autres tâches"}
              </p>
            </div>
          ) : (
            <div>
              {grouped.map((g, gi) => {
                const isCol = collapsed.has(g.projectId);
                return (
                  <div key={g.projectId} className={gi > 0 ? "border-t border-gray-100 dark:border-gray-700" : ""}>
                    <button
                      onClick={() => setCollapsed(p => { const n = new Set(p); n.has(g.projectId) ? n.delete(g.projectId) : n.add(g.projectId); return n; })}
                      className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer group"
                    >
                      <div className="flex items-center gap-2.5">
                        <svg className={`w-3 h-3 text-gray-400 transition-transform ${isCol ? "-rotate-90" : ""}`} fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                        <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{g.projectName}</span>
                        <span className="text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700 rounded-full px-2 py-0.5">{g.tasks.length}</span>
                      </div>
                      <Link href={`/projects/${g.projectId}`} onClick={e => e.stopPropagation()}
                        className="opacity-0 group-hover:opacity-100 text-[11px] text-indigo-500 hover:text-indigo-700 flex items-center gap-1 transition-all">
                        Voir le projet
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </Link>
                    </button>
                    {!isCol && g.tasks.map((task, ti) => {
                      const late = isLate(task);
                      const due = fmtDate(task.dueDate);
                      const done = isDone(task);
                      return (
                        <div key={task.id}
                          className={`flex items-center gap-3 px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors group/row ${ti < g.tasks.length - 1 ? "border-b border-gray-50 dark:border-gray-700/50" : ""}`}>
                          {/* Checkbox — stops propagation, toggles */}
                          <button
                            onClick={e => handleToggle(task, e)}
                            className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all cursor-pointer hover:scale-110 ${done ? "bg-green-500 border-green-500" : late ? "border-red-400 hover:border-red-500" : "border-gray-300 hover:border-indigo-400"}`}
                          >
                            {done && <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                          </button>
                          {/* Rest of row links to project */}
                          <Link href={`/projects/${task.projectId}`} className="flex-1 min-w-0 flex items-center gap-3">
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm truncate ${done ? "line-through text-gray-400 dark:text-gray-500" : "text-gray-800 dark:text-gray-100"}`}>{task.title}</p>
                              <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 truncate">{task.groupName}</p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {task.priority && <span className={`text-[11px] font-medium ${PRIORITY_COLORS[task.priority] ?? "text-gray-400"}`}>{task.priority}</span>}
                              {task.status && <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[task.status] ?? "bg-gray-100 text-gray-500"}`}>{task.status}</span>}
                              {due && <span className={`text-[11px] tabular-nums ${late ? "text-red-500 font-medium" : isToday(task.dueDate) ? "text-amber-600 font-medium" : "text-gray-400"}`}>{due}</span>}
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
      </section>

      {/* ── Projects ──────────────────────────────────────────────────────── */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">Mes projets</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {projects.map(p => {
            const pct = p.totalTaskCount > 0 ? Math.round((p.completedCount / p.totalTaskCount) * 100) : 0;
            return (
              <Link key={p.id} href={`/projects/${p.id}`}
                className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 hover:border-indigo-300 dark:hover:border-indigo-600 hover:shadow-sm transition-all group"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-900/40 flex items-center justify-center text-indigo-600 font-bold text-sm flex-shrink-0">
                    {p.name.charAt(0).toUpperCase()}
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${p.role === "ADMIN" ? "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300" : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"}`}>
                    {p.role === "ADMIN" ? "Admin" : "Membre"}
                  </span>
                </div>
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate mb-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{p.name}</p>
                <div className="flex items-center gap-3 text-[11px] text-gray-400 dark:text-gray-500 mb-3">
                  <span>{p.memberCount} membre{p.memberCount > 1 ? "s" : ""}</span>
                  {p.myTaskCount > 0 && <span className="text-indigo-500 font-medium">{p.myTaskCount} tâche{p.myTaskCount > 1 ? "s" : ""} assignée{p.myTaskCount > 1 ? "s" : ""}</span>}
                </div>
                {p.totalTaskCount > 0 && (
                  <div>
                    <div className="flex justify-between text-[10px] text-gray-400 dark:text-gray-500 mb-1">
                      <span>{p.completedCount}/{p.totalTaskCount} terminées</span>
                      <span>{pct}%</span>
                    </div>
                    <div className="h-1 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-400 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      </section>

      {/* ── Profile modal ─────────────────────────────────────────────────── */}
      {showProfile && (
        <ProfileModal
          user={{ ...user, avatar: avatarSrc }}
          onClose={() => setShowProfile(false)}
          onAvatarChange={setAvatarSrc}
        />
      )}
    </main>
  );
}

// ── StatCard ──────────────────────────────────────────────────────────────────

function StatCard({ label, value, color, active, onClick }: { label: string; value: number; color: "indigo"|"red"|"amber"|"green"|"gray"; active: boolean; onClick: () => void }) {
  const bg = { indigo: active?"bg-indigo-600 text-white":"bg-white dark:bg-gray-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/20", red: active?"bg-red-500 text-white":"bg-white dark:bg-gray-800 hover:bg-red-50 dark:hover:bg-red-900/20", amber: active?"bg-amber-500 text-white":"bg-white dark:bg-gray-800 hover:bg-amber-50 dark:hover:bg-amber-900/20", green: active?"bg-green-600 text-white":"bg-white dark:bg-gray-800 hover:bg-green-50 dark:hover:bg-green-900/20", gray: active?"bg-gray-500 text-white":"bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700" }[color];
  const val = { indigo: active?"text-white":"text-indigo-600", red: active?"text-white":value>0?"text-red-500":"text-gray-400", amber: active?"text-white":"text-amber-600", green: active?"text-white":"text-green-600", gray: active?"text-white":"text-gray-400" }[color];
  return (
    <button onClick={onClick} className={`rounded-xl border border-gray-200 dark:border-gray-700 p-4 text-left transition-all cursor-pointer ${bg}`}>
      <p className={`text-2xl font-bold mb-1 ${val}`}>{value}</p>
      <p className={`text-xs font-medium ${active?"text-white/80":"text-gray-500 dark:text-gray-400"}`}>{label}</p>
    </button>
  );
}

// ── ProfileModal ──────────────────────────────────────────────────────────────

function ProfileModal({ user, onClose, onAvatarChange }: { user: UserInfo; onClose: () => void; onAvatarChange: (url: string) => void }) {
  const [tab, setTab] = useState<"info"|"password">("info");
  const [name, setName] = useState(user.name);
  const [nameError, setNameError] = useState("");
  const [nameSuccess, setNameSuccess] = useState(false);
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [pwdError, setPwdError] = useState("");
  const [pwdSuccess, setPwdSuccess] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const [avatarPreview, setAvatarPreview] = useState(user.avatar);
  const fileRef = useRef<HTMLInputElement>(null);
  const [, startTransition] = useTransition();

  const handleSaveName = () => {
    setNameError(""); setNameSuccess(false);
    startTransition(async () => {
      try { await updateMyProfile(name); setNameSuccess(true); setTimeout(() => setNameSuccess(false), 3000); }
      catch (e) { setNameError(e instanceof Error ? e.message : "Erreur"); }
    });
  };

  const handleChangePassword = () => {
    setPwdError(""); setPwdSuccess(false);
    if (newPwd !== confirmPwd) { setPwdError("Les mots de passe ne correspondent pas"); return; }
    startTransition(async () => {
      try { await updateMyPassword(currentPwd, newPwd); setPwdSuccess(true); setCurrentPwd(""); setNewPwd(""); setConfirmPwd(""); }
      catch (e) { setPwdError(e instanceof Error ? e.message : "Erreur"); }
    });
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarError("");
    const preview = URL.createObjectURL(file);
    setAvatarPreview(preview);
    const fd = new FormData(); fd.append("avatar", file);
    startTransition(async () => {
      try { const url = await updateMyAvatar(fd); onAvatarChange(url); }
      catch (err) { setAvatarError(err instanceof Error ? err.message : "Erreur upload"); setAvatarPreview(user.avatar); }
    });
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/20" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none px-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xl w-full max-w-md pointer-events-auto">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-50">Mon profil</h2>
            <button onClick={onClose} className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" strokeWidth="1.5" strokeLinecap="round"/></svg>
            </button>
          </div>

          {/* Avatar */}
          <div className="flex flex-col items-center gap-3 px-6 py-5 border-b border-gray-100 dark:border-gray-700">
            <div className="relative group cursor-pointer" onClick={() => fileRef.current?.click()}>
              {avatarPreview ? (
                <img src={avatarPreview} alt={user.name} className="w-20 h-20 rounded-full object-cover border-2 border-gray-100 dark:border-gray-700" />
              ) : (
                <div className="w-20 h-20 rounded-full bg-indigo-600 flex items-center justify-center text-white text-2xl font-bold border-2 border-gray-100 dark:border-gray-700">
                  {initials(user.name)}
                </div>
              )}
              <div className="absolute inset-0 rounded-full bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
            <p className="text-xs text-gray-400 dark:text-gray-500">Cliquez pour changer la photo — toutes tailles acceptées</p>
            {avatarError && <p className="text-xs text-red-600">{avatarError}</p>}
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-100 dark:border-gray-700">
            {(["info", "password"] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`flex-1 py-2.5 text-sm font-medium transition-colors cursor-pointer ${tab===t ? "text-indigo-600 border-b-2 border-indigo-600" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"}`}>
                {t === "info" ? "Informations" : "Mot de passe"}
              </button>
            ))}
          </div>

          <div className="p-6 space-y-4">
            {tab === "info" ? (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Nom complet</label>
                  <input value={name} onChange={e => setName(e.target.value)}
                    className="w-full px-3 py-2 text-sm text-gray-900 dark:text-gray-50 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 transition-colors" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                  <input value={user.email} readOnly
                    className="w-full px-3 py-2 text-sm border border-gray-100 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-700/50 text-gray-400 dark:text-gray-500 cursor-not-allowed" />
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">L&apos;email ne peut pas être modifié</p>
                </div>
                {nameError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{nameError}</p>}
                {nameSuccess && <p className="text-xs text-green-600 bg-green-50 border border-green-200 rounded-lg px-3 py-2">Profil mis à jour ✓</p>}
                <button onClick={handleSaveName}
                  className="w-full bg-indigo-600 text-white text-sm font-medium py-2 rounded-lg hover:bg-indigo-700 transition-colors cursor-pointer">
                  Enregistrer
                </button>
              </>
            ) : (
              <>
                {[
                  { label: "Mot de passe actuel", value: currentPwd, set: setCurrentPwd },
                  { label: "Nouveau mot de passe", value: newPwd, set: setNewPwd },
                  { label: "Confirmer le mot de passe", value: confirmPwd, set: setConfirmPwd },
                ].map(f => (
                  <div key={f.label}>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">{f.label}</label>
                    <input type="password" value={f.value} onChange={e => f.set(e.target.value)}
                      className="w-full px-3 py-2 text-sm text-gray-900 dark:text-gray-50 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 transition-colors" />
                  </div>
                ))}
                {pwdError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{pwdError}</p>}
                {pwdSuccess && <p className="text-xs text-green-600 bg-green-50 border border-green-200 rounded-lg px-3 py-2">Mot de passe modifié ✓</p>}
                <button onClick={handleChangePassword}
                  className="w-full bg-indigo-600 text-white text-sm font-medium py-2 rounded-lg hover:bg-indigo-700 transition-colors cursor-pointer">
                  Changer le mot de passe
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
