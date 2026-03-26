"use client";

import { useState, useRef, useEffect, useMemo, useTransition } from "react";
import type {
  ProjectWithRelations,
  ProjectColumn,
  SpreadsheetFilters,
  SpreadsheetSort,
  SpreadsheetSortColumn,
} from "@/lib/types";
import { STATUS_OPTIONS, PRIORITY_OPTIONS } from "@/lib/constants";
import { setColumnActive, addProjectColumn, inviteMember, removeMember, updateMemberRole, updateProjectDescription, saveProjectAsTemplate, createSavedView, listSavedViews, deleteSavedView, markNotificationRead, markAllNotificationsRead, getProjectLinks, addProjectLink, removeProjectLink, listProjects, getProjectInvitations, cancelInvitation, getNotifPreferences, setNotifPreference, listUserGroups } from "@/lib/actions";
import { GroupsManagerModal } from "./GroupsManagerModal";
import { NOTIF_TYPES } from "@/lib/constants";
import type { NotifType } from "@/lib/constants";
import { AVAILABLE_COLUMNS } from "@/lib/types";
import { ProjectSpreadsheet } from "./ProjectSpreadsheet";
import { ProjectCardsView } from "./ProjectCardsView";
import { ProjectKanbanView } from "./ProjectKanbanView";
import { ProjectCalendarView } from "./ProjectCalendarView";
import { ProjectGanttView } from "./ProjectGanttView";
import { ProjectTimelineView } from "./ProjectTimelineView";
import { ProjectDashboard } from "./ProjectDashboard";
import { ProjectActivityFeed } from "./ProjectActivityFeed";
import { ProjectProvider } from "./ProjectContext";
import { CommandPalette } from "./CommandPalette";
import { TaskDetailPanel } from "./TaskDetailPanel";
import { AutomationsPanel } from "./AutomationsPanel";

type Tab = "spreadsheet" | "cards" | "kanban" | "calendar" | "gantt" | "timeline" | "dashboard" | "activity";

type Member = { id: string; userId: string; role: string; user: { id: string; name: string; email: string; avatar: string | null } };

// --- Invite Modal ---
type PendingInvitation = { id: string; email: string; createdAt: Date; expiresAt: Date };

type UserGroupRow = { id: string; name: string; emails: string };

function InviteModal({
  projectId,
  members,
  isAdmin,
  onClose,
  onMemberRemoved,
  onMemberUpdated,
}: {
  projectId: string;
  members: Member[];
  isAdmin: boolean;
  onClose: () => void;
  onMemberRemoved: (userId: string) => void;
  onMemberUpdated: (m: Member) => void;
}) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isPending, startTransition] = useTransition();
  const [pendingInvitations, setPendingInvitations] = useState<PendingInvitation[]>([]);
  const [userGroups, setUserGroups] = useState<UserGroupRow[]>([]);
  const [showGroupsManager, setShowGroupsManager] = useState(false);
  const [groupInviteStatus, setGroupInviteStatus] = useState<Record<string, string>>({});

  useEffect(() => {
    getProjectInvitations(projectId).then((data) => setPendingInvitations(data as PendingInvitation[]));
    listUserGroups().then((rows) => setUserGroups(rows as UserGroupRow[]));
  }, [projectId]);

  const handleInviteGroup = (group: UserGroupRow) => {
    const emails: string[] = JSON.parse(group.emails);
    setGroupInviteStatus((s) => ({ ...s, [group.id]: "loading" }));
    startTransition(async () => {
      let sent = 0;
      for (const e of emails) {
        try { await inviteMember(projectId, e); sent++; } catch { /* already member or pending */ }
      }
      const updated = await getProjectInvitations(projectId);
      setPendingInvitations(updated as PendingInvitation[]);
      const msg = sent === 0 ? "Déjà membres" : `${sent} invitation${sent > 1 ? "s" : ""} envoyée${sent > 1 ? "s" : ""}`;
      setGroupInviteStatus((s) => ({ ...s, [group.id]: msg }));
      setTimeout(() => setGroupInviteStatus((s) => { const n = { ...s }; delete n[group.id]; return n; }), 3000);
    });
  };

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    startTransition(async () => {
      try {
        await inviteMember(projectId, email.trim());
        setSuccess(`Invitation envoyée à ${email.trim()}`);
        setEmail("");
        // Refresh pending invitations
        const updated = await getProjectInvitations(projectId);
        setPendingInvitations(updated as PendingInvitation[]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur");
      }
    });
  };

  const handleRemoveMember = (userId: string) => {
    startTransition(async () => {
      await removeMember(projectId, userId);
      onMemberRemoved(userId);
    });
  };

  const handleToggleRole = (m: Member) => {
    const newRole = m.role === "ADMIN" ? "MEMBER" : "ADMIN";
    startTransition(async () => {
      const updated = await updateMemberRole(projectId, m.userId, newRole);
      onMemberUpdated(updated as Member);
    });
  };

  const handleCancelInvitation = (invId: string) => {
    startTransition(async () => {
      await cancelInvitation(invId);
      setPendingInvitations((prev) => prev.filter((i) => i.id !== invId));
    });
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/20" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-xl p-6 w-full max-w-sm pointer-events-auto max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900">Membres du projet</h2>
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 cursor-pointer">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M6 18L18 6M6 6l12 12" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {/* Active members list */}
          {members.length > 0 && (
            <div className="mb-4 space-y-2">
              {members.map((m) => (
                <div key={m.userId} className="flex items-center gap-2.5 group">
                  <div className="w-8 h-8 rounded-full flex-shrink-0 overflow-hidden">
                    {m.user.avatar ? (
                      <img src={m.user.avatar} alt={m.user.name} className="w-full h-full object-cover rounded-full" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
                        <span className="text-xs font-bold text-indigo-600">{m.user.name.charAt(0).toUpperCase()}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{m.user.name}</p>
                    <p className="text-xs text-gray-400 truncate">{m.user.email}</p>
                  </div>
                  {isAdmin ? (
                    <button
                      onClick={() => handleToggleRole(m)}
                      title={m.role === "ADMIN" ? "Rétrograder en membre" : "Promouvoir admin"}
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-all cursor-pointer ${
                        m.role === "ADMIN"
                          ? "border-indigo-200 bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
                          : "border-gray-200 text-gray-400 hover:border-indigo-200 hover:text-indigo-500"
                      }`}
                    >
                      {m.role === "ADMIN" ? "Admin" : "Membre"}
                    </button>
                  ) : (
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                      m.role === "ADMIN"
                        ? "border-indigo-200 bg-indigo-50 text-indigo-600"
                        : "border-gray-200 text-gray-400"
                    }`}>
                      {m.role === "ADMIN" ? "Admin" : "Membre"}
                    </span>
                  )}
                  {isAdmin && (
                    <button
                      onClick={() => handleRemoveMember(m.userId)}
                      className="opacity-0 group-hover:opacity-100 text-xs text-gray-400 hover:text-red-500 transition-all cursor-pointer ml-1"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Pending invitations */}
          {pendingInvitations.length > 0 && (
            <div className="mb-4">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">En attente</p>
              <div className="space-y-1.5">
                {pendingInvitations.map((inv) => (
                  <div key={inv.id} className="flex items-center gap-2.5 group py-1">
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-600 truncate">{inv.email}</p>
                      <p className="text-[10px] text-gray-400">Invitation envoyée</p>
                    </div>
                    {isAdmin && (
                      <button
                        onClick={() => handleCancelInvitation(inv.id)}
                        className="opacity-0 group-hover:opacity-100 text-xs text-gray-400 hover:text-red-500 transition-all cursor-pointer"
                        title="Annuler l'invitation"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Groups section — visible for all, actions for admins only */}
          {userGroups.length > 0 && (
            <div className="mb-4 border-t border-gray-100 pt-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Groupes</p>
                {isAdmin && (
                  <button
                    onClick={() => setShowGroupsManager(true)}
                    className="text-[11px] text-gray-400 hover:text-indigo-500 transition-colors cursor-pointer"
                  >
                    Gérer
                  </button>
                )}
              </div>
              <div className="space-y-2">
                {userGroups.map((g) => {
                  const emails: string[] = JSON.parse(g.emails);
                  const status = groupInviteStatus[g.id];
                  return (
                    <div key={g.id} className="flex items-center justify-between gap-2 py-1">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800">{g.name}</p>
                        <p className="text-[11px] text-gray-400">
                          {emails.length} membre{emails.length > 1 ? "s" : ""}
                        </p>
                      </div>
                      {isAdmin && (
                        status === "loading" ? (
                          <span className="text-[11px] text-gray-400">Envoi…</span>
                        ) : status ? (
                          <span className={`text-[11px] ${status === "Déjà membres" ? "text-gray-400" : "text-green-600"}`}>{status}</span>
                        ) : (
                          <button
                            onClick={() => handleInviteGroup(g)}
                            className="text-[11px] font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 px-2.5 py-1 rounded-lg transition-colors cursor-pointer flex-shrink-0"
                          >
                            Inviter le groupe
                          </button>
                        )
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* "Gérer les groupes" shortcut when no group exists yet — admin only */}
          {isAdmin && userGroups.length === 0 && (
            <div className="mb-4 border-t border-gray-100 pt-4">
              <button
                onClick={() => setShowGroupsManager(true)}
                className="w-full flex items-center justify-center gap-1.5 text-[12px] text-gray-400 hover:text-indigo-500 transition-colors cursor-pointer py-1"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Configurer des groupes d&apos;invitation
              </button>
            </div>
          )}

          {isAdmin && (
            <div className="border-t border-gray-100 pt-4">
              {/* Invite form */}
              <form onSubmit={handleInvite} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">Inviter par email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setSuccess(""); setError(""); }}
                    required
                    autoFocus
                    placeholder="user@exemple.com"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 transition-colors"
                  />
                </div>
                {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
                {success && (
                  <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path d="M5 13l4 4L19 7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {success}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={isPending}
                  className="w-full bg-indigo-600 text-white text-sm font-medium py-2 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-60 cursor-pointer"
                >
                  {isPending ? "Envoi…" : "Envoyer l'invitation"}
                </button>
              </form>
              <p className="mt-3 text-[11px] text-gray-400 text-center">
                Un email avec un lien d&apos;invitation sera envoyé. Sans compte, un lien de création sera proposé.
              </p>
            </div>
          )}
        </div>
      </div>
      {showGroupsManager && (
        <GroupsManagerModal
          onClose={() => {
            setShowGroupsManager(false);
            listUserGroups().then((rows) => setUserGroups(rows as UserGroupRow[]));
          }}
        />
      )}
    </>
  );
}

// --- Save Template Modal ---
function SaveTemplateModal({
  projectId,
  projectName,
  onClose,
}: {
  projectId: string;
  projectName: string;
  onClose: () => void;
}) {
  const [name, setName] = useState(projectName);
  const [includeTasks, setIncludeTasks] = useState(false);
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      await saveProjectAsTemplate(projectId, name.trim(), includeTasks);
      setDone(true);
    });
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/20" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-xl p-6 w-full max-w-sm pointer-events-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900">Sauvegarder comme template</h2>
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 cursor-pointer">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M6 18L18 6M6 6l12 12" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          {done ? (
            <div className="flex flex-col items-center py-4 gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M5 13l4 4L19 7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <p className="text-sm font-medium text-gray-700">Template sauvegardé !</p>
              <div className="flex gap-2 w-full">
                <button onClick={onClose} className="flex-1 border border-gray-200 text-sm text-gray-600 rounded-lg py-2 hover:bg-gray-50 cursor-pointer">
                  Fermer
                </button>
                <a href="/templates" className="flex-1 text-center bg-indigo-600 text-white text-sm font-medium rounded-lg py-2 hover:bg-indigo-700 transition-colors">
                  Voir les templates
                </a>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Nom du template</label>
              <input
                autoFocus
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 mb-4"
                placeholder="Nom du template"
              />
              <label className="flex items-center gap-2.5 py-2 mb-3 cursor-pointer select-none">
                <div
                  onClick={() => setIncludeTasks((v) => !v)}
                  className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${includeTasks ? "bg-indigo-500" : "bg-gray-200"}`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${includeTasks ? "translate-x-4" : ""}`}
                  />
                </div>
                <span className="text-sm text-gray-700">Inclure les tâches</span>
              </label>
              <button
                type="submit"
                disabled={isPending || !name.trim()}
                className="w-full bg-indigo-600 text-white text-sm font-medium py-2 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-60 cursor-pointer"
              >
                {isPending ? "Sauvegarde…" : "Sauvegarder"}
              </button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}

const VIEW_ICONS: Record<string, React.ReactNode> = {
  SPREADSHEET: (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <rect x="3" y="3" width="7" height="7" rx="1" strokeWidth="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1" strokeWidth="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1" strokeWidth="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1" strokeWidth="1.5" />
    </svg>
  ),
  CARDS: (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <rect x="3" y="5" width="8" height="10" rx="1.5" strokeWidth="1.5" />
      <rect x="13" y="5" width="8" height="10" rx="1.5" strokeWidth="1.5" />
    </svg>
  ),
  KANBAN: (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <rect x="3" y="4" width="5" height="14" rx="1" strokeWidth="1.5" />
      <rect x="9.5" y="4" width="5" height="9" rx="1" strokeWidth="1.5" />
      <rect x="16" y="4" width="5" height="6" rx="1" strokeWidth="1.5" />
    </svg>
  ),
  CALENDAR: (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <rect x="3" y="5" width="18" height="16" rx="2" strokeWidth="1.5" />
      <path d="M3 10h18M8 3v4M16 3v4" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  GANTT: (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path d="M3 6h8M3 12h14M3 18h10" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="3" y="4.5" width="8" height="3" rx="1" strokeWidth="0" fill="currentColor" opacity="0.3" />
      <rect x="3" y="10.5" width="14" height="3" rx="1" strokeWidth="0" fill="currentColor" opacity="0.3" />
      <rect x="3" y="16.5" width="10" height="3" rx="1" strokeWidth="0" fill="currentColor" opacity="0.3" />
    </svg>
  ),
  TIMELINE: (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <circle cx="6" cy="7" r="1.5" fill="currentColor" strokeWidth="0" />
      <circle cx="6" cy="12" r="1.5" fill="currentColor" strokeWidth="0" />
      <circle cx="6" cy="17" r="1.5" fill="currentColor" strokeWidth="0" />
      <rect x="9" y="5.5" width="7" height="3" rx="1.5" strokeWidth="0" fill="currentColor" opacity="0.5" />
      <rect x="9" y="10.5" width="11" height="3" rx="1.5" strokeWidth="0" fill="currentColor" opacity="0.5" />
      <rect x="9" y="15.5" width="5" height="3" rx="1.5" strokeWidth="0" fill="currentColor" opacity="0.5" />
    </svg>
  ),
};

const VIEW_LABELS: Record<string, string> = {
  SPREADSHEET: "Tableur",
  CARDS: "Fiches",
  KANBAN: "Kanban",
  CALENDAR: "Calendrier",
};

const SORT_OPTIONS: { key: SpreadsheetSortColumn; label: string }[] = [
  { key: "TITLE", label: "Tâche (A→Z)" },
  { key: "STATUS", label: "Status" },
  { key: "PRIORITY", label: "Priorité" },
  { key: "DUE_DATE", label: "Date d'échéance" },
];

type NotificationItem = {
  id: string;
  type: string;
  message: string;
  taskId: string | null;
  projectId: string | null;
  isRead: boolean;
  createdAt: Date;
};

export function ProjectPageClient({
  project,
  allColumns,
  initialMembers,
  currentUserId,
  initialNotifications,
  initialUnreadCount,
}: {
  project: ProjectWithRelations;
  allColumns: ProjectColumn[];
  initialMembers: Member[];
  currentUserId: string | null;
  initialNotifications: NotificationItem[];
  initialUnreadCount: number;
}) {
  const [activeTab, setActiveTab] = useState<Tab>("spreadsheet");
  const [activeColumnIds, setActiveColumnIds] = useState<Set<string>>(
    () => new Set(project.columns.map((c) => c.id))
  );
  const [, startColumnTransition] = useTransition();
  const [members, setMembers] = useState<Member[]>(initialMembers);
  const isAdmin = members.find((m) => m.userId === currentUserId)?.role === "ADMIN";
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>(initialNotifications);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const [showNotifPrefs, setShowNotifPrefs] = useState(false);
  const [notifPrefs, setNotifPrefs] = useState<{ type: string; enabled: boolean }[]>([]);
  const notifRef = useRef<HTMLDivElement>(null);
  const [cmdPaletteTask, setCmdPaletteTask] = useState<{ task: import("@/lib/types").TaskWithFields; groupName: string; groupColor: string } | null>(null);
  const [description, setDescription] = useState(project.description ?? "");
  const [editingDesc, setEditingDesc] = useState(false);
  const [, startDescTransition] = useTransition();
  const defaultView = project.views.find((v) => v.isDefault) ?? project.views[0];

  // --- Filter / sort / search / column visibility state ---
  const [filters, setFilters] = useState<SpreadsheetFilters>({
    status: [],
    priority: [],
    owner: [],
  });
  const [sort, setSort] = useState<SpreadsheetSort>(null);
  const [search, setSearch] = useState("");
  const [hiddenColumnIds, setHiddenColumnIds] = useState<string[]>([]);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [showSortPanel, setShowSortPanel] = useState(false);
  const [showColumnsPanel, setShowColumnsPanel] = useState(false);
  const [showViewsPanel, setShowViewsPanel] = useState(false);
  const [savedViews, setSavedViews] = useState<{ id: string; name: string; snapshot: string }[]>([]);
  const [viewsLoaded, setViewsLoaded] = useState(false);
  const [showAutomationsPanel, setShowAutomationsPanel] = useState(false);
  const [showLinksPanel, setShowLinksPanel] = useState(false);
  const [linkedProjects, setLinkedProjects] = useState<{ id: string; project: { id: string; name: string } }[]>([]);
  const [linksLoaded, setLinksLoaded] = useState(false);
  const [allProjects, setAllProjects] = useState<{ id: string; name: string }[]>([]);
  const linksRef = useRef<HTMLDivElement>(null);
  const [saveViewName, setSaveViewName] = useState("");
  const [savingView, setSavingView] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const filterBtnRef = useRef<HTMLDivElement>(null);
  const sortBtnRef = useRef<HTMLDivElement>(null);
  const columnsBtnRef = useRef<HTMLDivElement>(null);
  const viewsBtnRef = useRef<HTMLDivElement>(null);
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0 });

  // Close panels on outside click
  useEffect(() => {
    if (!showFilterPanel && !showSortPanel && !showColumnsPanel && !showViewsPanel && !showNotifPanel && !showLinksPanel) return;
    const handler = (e: MouseEvent) => {
      // Toolbar dropdowns: use single toolbarRef (covers buttons + panels)
      if ((showFilterPanel || showSortPanel || showColumnsPanel || showViewsPanel) &&
          toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setShowFilterPanel(false);
        setShowSortPanel(false);
        setShowColumnsPanel(false);
        setShowViewsPanel(false);
      }
      if (showNotifPanel && notifRef.current && !notifRef.current.contains(e.target as Node))
        setShowNotifPanel(false);
      if (showLinksPanel && linksRef.current && !linksRef.current.contains(e.target as Node))
        setShowLinksPanel(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showFilterPanel, showSortPanel, showColumnsPanel, showViewsPanel, showNotifPanel, showLinksPanel]);

  // Effective active columns: DB active + locally toggled
  const effectiveColumns = useMemo(
    () => allColumns.filter((c) => activeColumnIds.has(c.id)),
    [allColumns, activeColumnIds]
  );

  const visibleColumns = useMemo(
    () => effectiveColumns.filter((c: ProjectColumn) => !hiddenColumnIds.includes(c.id)),
    [effectiveColumns, hiddenColumnIds]
  );

  const toggleColumn = (colId: string) => {
    setHiddenColumnIds((prev) =>
      prev.includes(colId) ? prev.filter((id) => id !== colId) : [...prev, colId]
    );
  };

  const toggleColumnActive = (colId: string) => {
    const isActive = activeColumnIds.has(colId);
    setActiveColumnIds((prev) => {
      const next = new Set(prev);
      if (isActive) next.delete(colId); else next.add(colId);
      return next;
    });
    startColumnTransition(async () => { await setColumnActive(colId, !isActive); });
  };

  const handleAddMissingColumn = (type: string, label: string) => {
    startColumnTransition(async () => {
      const created = await addProjectColumn(project.id, type, label);
      setActiveColumnIds((prev) => new Set([...prev, created.id]));
      // Force reload to get the new column in allColumns
      window.location.reload();
    });
  };

  // Keyboard shortcuts
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const isInput = tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement).isContentEditable;
      // / or Cmd+F → focus search (spreadsheet only)
      if (!isInput && (e.key === "/" || (e.metaKey && e.key === "f")) && activeTab === "spreadsheet") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
      // ⌘K / Ctrl+K → command palette
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowCommandPalette((v) => !v);
        return;
      }
      // Escape → close all panels
      if (e.key === "Escape") {
        setShowFilterPanel(false);
        setShowSortPanel(false);
        setShowColumnsPanel(false);
        setShowInviteModal(false);
        setShowCommandPalette(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeTab]);

  // Unique owners across all tasks (for filter panel)
  const ownerCol = project.columns.find((c) => c.type === "OWNER");
  const uniqueOwners = useMemo(() => {
    if (!ownerCol) return [];
    const set = new Set<string>();
    project.groups.forEach((g) =>
      g.tasks.forEach((t) => {
        const v = t.fieldValues.find((f) => f.columnId === ownerCol.id)?.value;
        if (v) set.add(v);
      })
    );
    return Array.from(set).sort();
  }, [project, ownerCol]);

  const activeFilterCount =
    filters.status.length + filters.priority.length + filters.owner.length;

  const toggleFilter = (key: keyof SpreadsheetFilters, value: string) => {
    setFilters((prev) => ({
      ...prev,
      [key]: prev[key].includes(value)
        ? prev[key].filter((v) => v !== value)
        : [...prev[key], value],
    }));
  };

  const clearFilters = () =>
    setFilters({ status: [], priority: [], owner: [] });

  const handleSortPick = (key: SpreadsheetSortColumn) => {
    setSort((prev) => {
      if (!prev || prev.columnType !== key) return { columnType: key, dir: "asc" };
      if (prev.dir === "asc") return { columnType: key, dir: "desc" };
      return null;
    });
    setShowSortPanel(false);
  };

  const sortLabel = sort
    ? SORT_OPTIONS.find((o) => o.key === sort.columnType)?.label +
      (sort.dir === "asc" ? " ↑" : " ↓")
    : null;

  const exportCSV = () => {
    const cols = project.columns;
    const headers = ["Groupe", "Tâche", ...cols.map((c) => c.label)];
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const rows: string[] = [headers.map(escape).join(",")];
    for (const group of project.groups) {
      for (const task of group.tasks) {
        const cells = [group.name, task.title, ...cols.map((c) => {
          const raw = task.fieldValues.find((f) => f.columnId === c.id)?.value ?? "";
          if (c.type === "TIMELINE") {
            try { const p = JSON.parse(raw); return `${p.start ?? ""}→${p.end ?? ""}`; } catch { return raw; }
          }
          return raw;
        })];
        rows.push(cells.map(escape).join(","));
      }
    }
    const blob = new Blob(["\uFEFF" + rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.name}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <ProjectProvider
      memberNames={members.map((m) => m.user.name)}
      memberAvatars={Object.fromEntries(members.map((m) => [m.user.name, m.user.avatar]))}
    >
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* ── Top bar ── */}
      <header className="bg-white border-b border-gray-200 px-4 sm:px-6 flex-shrink-0">
        <div className="flex items-center justify-between h-14">
          <div className="flex items-center gap-2.5 min-w-0">
            <a
              href="/"
              className="text-gray-400 hover:text-gray-600 transition-colors text-sm flex items-center gap-1 flex-shrink-0"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M15 19l-7-7 7-7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Projets
            </a>
            <a
              href="/me"
              className="hidden sm:flex items-center gap-1 text-gray-400 hover:text-indigo-500 transition-colors text-xs border border-gray-200 hover:border-indigo-200 rounded-md px-2 py-1 flex-shrink-0"
              title="Mon espace"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Mon espace
            </a>
            <span className="text-gray-200">/</span>
            <h1 className="text-sm font-semibold text-gray-900">{project.name}</h1>
            {/* Description inline */}
            <span className="text-gray-200 hidden sm:block">·</span>
            {editingDesc ? (
              <input
                autoFocus
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={() => {
                  setEditingDesc(false);
                  startDescTransition(async () => {
                    await updateProjectDescription(project.id, description);
                  });
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  if (e.key === "Escape") { setDescription(project.description ?? ""); setEditingDesc(false); }
                }}
                className="hidden sm:block text-xs text-gray-500 bg-transparent border-b border-indigo-400 outline-none w-48"
                placeholder="Ajouter une description…"
              />
            ) : isAdmin ? (
              <button
                onClick={() => setEditingDesc(true)}
                className="hidden sm:block text-xs text-gray-400 hover:text-gray-600 transition-colors cursor-pointer truncate max-w-[200px]"
              >
                {description || <span className="italic text-gray-300">Ajouter une description…</span>}
              </button>
            ) : (
              <span className="hidden sm:block text-xs text-gray-400 truncate max-w-[200px]">
                {description}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Notification bell */}
            {currentUserId && (
              <div className="relative" ref={notifRef}>
                <button
                  onClick={() => {
                    setShowNotifPanel((v) => !v);
                    setShowNotifPrefs(false);
                    if (!showNotifPanel && notifPrefs.length === 0) {
                      getNotifPreferences().then(setNotifPrefs);
                    }
                  }}
                  className="relative p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
                  title="Notifications"
                >
                  <svg className="w-4.5 h-4.5 w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </button>

                {showNotifPanel && (
                  <div className="absolute top-full mt-1.5 right-0 bg-white border border-gray-200 rounded-xl shadow-xl z-30 w-80 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                      <h3 className="text-sm font-semibold text-gray-800">Notifications</h3>
                      <div className="flex items-center gap-2">
                        {unreadCount > 0 && !showNotifPrefs && (
                          <button
                            onClick={async () => {
                              setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
                              setUnreadCount(0);
                              await markAllNotificationsRead(currentUserId);
                            }}
                            className="text-xs text-indigo-500 hover:text-indigo-700 transition-colors cursor-pointer"
                          >
                            Tout marquer lu
                          </button>
                        )}
                        <button
                          onClick={() => setShowNotifPrefs((v) => !v)}
                          title="Préférences de notifications"
                          className={`p-1 rounded-md transition-colors cursor-pointer ${showNotifPrefs ? "bg-gray-100 text-gray-700" : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"}`}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" strokeWidth="1.5" />
                            <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" strokeWidth="1.5" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {showNotifPrefs ? (
                      <div className="px-4 py-3 space-y-3">
                        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Recevoir des notifications pour</p>
                        {NOTIF_TYPES.map(({ type, label }) => {
                          const pref = notifPrefs.find((p) => p.type === type);
                          const enabled = pref?.enabled ?? true;
                          return (
                            <label key={type} className="flex items-center justify-between gap-3 cursor-pointer">
                              <span className="text-sm text-gray-700">{label}</span>
                              <button
                                role="switch"
                                aria-checked={enabled}
                                onClick={async () => {
                                  const next = !enabled;
                                  setNotifPrefs((prev) =>
                                    prev.some((p) => p.type === type)
                                      ? prev.map((p) => p.type === type ? { ...p, enabled: next } : p)
                                      : [...prev, { type, enabled: next }]
                                  );
                                  await setNotifPreference(type as NotifType, next);
                                }}
                                className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer flex-shrink-0 ${enabled ? "bg-indigo-500" : "bg-gray-200"}`}
                              >
                                <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-4" : "translate-x-0"}`} />
                              </button>
                            </label>
                          );
                        })}
                      </div>
                    ) : (
                    <div className="max-h-96 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="px-4 py-8 text-center">
                          <svg className="w-8 h-8 text-gray-200 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" strokeWidth="1.5" strokeLinecap="round" />
                          </svg>
                          <p className="text-xs text-gray-400">Aucune notification</p>
                        </div>
                      ) : (
                        notifications.map((notif) => (
                          <div
                            key={notif.id}
                            className={`flex items-start gap-3 px-4 py-3 border-b border-gray-50 hover:bg-gray-50/60 transition-colors cursor-pointer ${!notif.isRead ? "bg-indigo-50/40" : ""}`}
                            onClick={async () => {
                              if (!notif.isRead) {
                                setNotifications((prev) =>
                                  prev.map((n) => n.id === notif.id ? { ...n, isRead: true } : n)
                                );
                                setUnreadCount((c) => Math.max(0, c - 1));
                                await markNotificationRead(notif.id);
                              }
                              if (notif.taskId) {
                                setShowNotifPanel(false);
                                const group = project.groups.find((g) =>
                                  g.tasks.some((t) => t.id === notif.taskId)
                                );
                                const task = group?.tasks.find((t) => t.id === notif.taskId);
                                if (task && group) {
                                  setActiveTab("spreadsheet");
                                  setCmdPaletteTask({ task, groupName: group.name, groupColor: group.color });
                                }
                              }
                            }}
                          >
                            <div className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${!notif.isRead ? "bg-indigo-500" : "bg-transparent"}`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-gray-700 leading-relaxed">{notif.message}</p>
                              <p className="text-[11px] text-gray-400 mt-0.5">
                                {new Date(notif.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                              </p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Member avatars — hidden on mobile */}
            {members.length > 0 && (
              <div className="hidden sm:flex items-center -space-x-1.5">
                {members.slice(0, 5).map((m) => (
                  <div
                    key={m.userId}
                    title={m.user.name}
                    className="w-7 h-7 rounded-full border-2 border-white flex-shrink-0 overflow-hidden"
                  >
                    {m.user.avatar ? (
                      <img src={m.user.avatar} alt={m.user.name} className="w-full h-full object-cover rounded-full" />
                    ) : (
                      <div className="w-full h-full rounded-full bg-indigo-100 flex items-center justify-center">
                        <span className="text-[10px] font-bold text-indigo-600">{m.user.name.charAt(0).toUpperCase()}</span>
                      </div>
                    )}
                  </div>
                ))}
                {members.length > 5 && (
                  <div className="w-7 h-7 rounded-full bg-gray-100 border-2 border-white flex items-center justify-center flex-shrink-0">
                    <span className="text-[10px] font-bold text-gray-500">+{members.length - 5}</span>
                  </div>
                )}
              </div>
            )}
            {isAdmin && (
              <button
                onClick={() => setShowAutomationsPanel(true)}
                className="flex items-center gap-1.5 text-xs text-gray-500 bg-white border border-gray-200 rounded-lg px-2.5 sm:px-3 py-1.5 hover:bg-gray-50 transition-colors cursor-pointer"
                title="Automatisations"
              >
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M13 10V3L4 14h7v7l9-11h-7z" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="hidden sm:inline">Règles</span>
              </button>
            )}
            <button
              onClick={() => setShowInviteModal(true)}
              className="flex items-center gap-1.5 text-xs text-gray-600 bg-white border border-gray-200 rounded-lg px-2.5 sm:px-3 py-1.5 hover:bg-gray-50 transition-colors cursor-pointer"
              title={isAdmin ? "Inviter des membres" : "Voir les membres"}
            >
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M12 4v16m8-8H4" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <span className="hidden sm:inline">{isAdmin ? "Inviter" : "Membres"}</span>
            </button>
            {isAdmin && (
              <button
                onClick={() => setShowSaveTemplate(true)}
                className="flex items-center gap-1.5 text-xs text-gray-500 bg-white border border-gray-200 rounded-lg px-2.5 sm:px-3 py-1.5 hover:bg-gray-50 transition-colors cursor-pointer"
                title="Sauvegarder comme template"
              >
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="hidden sm:inline">Template</span>
              </button>
            )}

            {/* Project links */}
            <div className="relative" ref={linksRef}>
              <button
                onClick={async () => {
                  setShowLinksPanel((v) => !v);
                  if (!linksLoaded) {
                    const [links, projects] = await Promise.all([
                      getProjectLinks(project.id),
                      listProjects(),
                    ]);
                    setLinkedProjects(links);
                    setAllProjects(projects.filter((p) => p.id !== project.id).map((p) => ({ id: p.id, name: p.name })));
                    setLinksLoaded(true);
                  }
                }}
                className="flex items-center gap-1.5 text-xs text-gray-500 bg-white border border-gray-200 rounded-lg px-2.5 sm:px-3 py-1.5 hover:bg-gray-50 transition-colors cursor-pointer"
                title="Lier des projets"
              >
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="hidden sm:inline">Lier</span>
                {linkedProjects.length > 0 && (
                  <span className="ml-0.5 text-[10px] bg-indigo-100 text-indigo-600 rounded-full px-1.5 py-0.5 leading-none">
                    {linkedProjects.length}
                  </span>
                )}
              </button>

              {showLinksPanel && (
                <div className="absolute top-full mt-1.5 right-0 bg-white border border-gray-200 rounded-xl shadow-xl z-30 w-72 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100">
                    <h3 className="text-sm font-semibold text-gray-800">Projets liés</h3>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {linkedProjects.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center py-6">Aucun projet lié</p>
                    ) : (
                      linkedProjects.map((lp) => (
                        <div key={lp.id} className="flex items-center justify-between px-4 py-2.5 border-b border-gray-50 hover:bg-gray-50/50">
                          <a href={`/projects/${lp.project.id}`} className="text-sm text-indigo-600 hover:text-indigo-800 font-medium truncate">
                            {lp.project.name}
                          </a>
                          <button
                            onClick={async () => {
                              await removeProjectLink(lp.id, project.id);
                              setLinkedProjects((prev) => prev.filter((x) => x.id !== lp.id));
                            }}
                            className="ml-2 text-gray-300 hover:text-red-400 transition-colors cursor-pointer flex-shrink-0"
                            title="Dissocier"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path d="M6 18L18 6M6 6l12 12" strokeWidth="1.5" strokeLinecap="round" />
                            </svg>
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                  {allProjects.filter((p) => !linkedProjects.some((lp) => lp.project.id === p.id)).length > 0 && (
                    <div className="px-4 py-3 border-t border-gray-100">
                      <p className="text-[11px] text-gray-400 mb-2 font-medium uppercase tracking-wider">Lier un projet</p>
                      <div className="space-y-1 max-h-40 overflow-y-auto">
                        {allProjects
                          .filter((p) => !linkedProjects.some((lp) => lp.project.id === p.id))
                          .map((p) => (
                            <button
                              key={p.id}
                              onClick={async () => {
                                await addProjectLink(project.id, p.id);
                                const updated = await getProjectLinks(project.id);
                                setLinkedProjects(updated);
                              }}
                              className="w-full text-left text-sm text-gray-700 hover:text-indigo-600 hover:bg-indigo-50/50 px-2 py-1.5 rounded-lg transition-colors cursor-pointer"
                            >
                              {p.name}
                            </button>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── View tabs ── */}
        <div className="flex items-center gap-0.5 -mb-px overflow-x-auto scrollbar-none">
          <TabButton
            active={activeTab === "spreadsheet"}
            onClick={() => setActiveTab("spreadsheet")}
            icon={VIEW_ICONS[defaultView?.type ?? "SPREADSHEET"]}
          >
            {VIEW_LABELS[defaultView?.type ?? "SPREADSHEET"] ?? "Tableur"}
          </TabButton>

          <TabButton
            active={activeTab === "cards"}
            onClick={() => setActiveTab("cards")}
            icon={VIEW_ICONS["CARDS"]}
          >
            Fiches
          </TabButton>

          <TabButton
            active={activeTab === "kanban"}
            onClick={() => setActiveTab("kanban")}
            icon={VIEW_ICONS["KANBAN"]}
          >
            Kanban
          </TabButton>

          <TabButton
            active={activeTab === "calendar"}
            onClick={() => setActiveTab("calendar")}
            icon={VIEW_ICONS["CALENDAR"]}
          >
            Calendrier
          </TabButton>

          <TabButton
            active={activeTab === "gantt"}
            onClick={() => setActiveTab("gantt")}
            icon={VIEW_ICONS["GANTT"]}
          >
            Gantt
          </TabButton>

          <TabButton
            active={activeTab === "timeline"}
            onClick={() => setActiveTab("timeline")}
            icon={VIEW_ICONS["TIMELINE"]}
          >
            Échéancier
          </TabButton>

          <div className="mx-2 h-4 w-px bg-gray-200" />

          <TabButton
            active={activeTab === "dashboard"}
            onClick={() => setActiveTab("dashboard")}
            icon={
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <rect x="3" y="3" width="8" height="5" rx="1" strokeWidth="1.5" />
                <rect x="13" y="3" width="8" height="9" rx="1" strokeWidth="1.5" />
                <rect x="3" y="10" width="8" height="11" rx="1" strokeWidth="1.5" />
                <rect x="13" y="14" width="8" height="7" rx="1" strokeWidth="1.5" />
              </svg>
            }
          >
            Dashboard
          </TabButton>

          <TabButton
            active={activeTab === "activity"}
            onClick={() => setActiveTab("activity")}
            icon={
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            }
          >
            Activité
          </TabButton>
        </div>
      </header>

      {/* ── Toolbar (spreadsheet only) ── */}
      {activeTab === "spreadsheet" && (
        <div ref={toolbarRef} className="bg-white border-b border-gray-100 flex-shrink-0">
          {/* Scrollable button row */}
          <div className="px-4 sm:px-6 py-1.5 flex items-center gap-1 overflow-x-auto scrollbar-none">
          {/* Search input */}
          <div className="relative mr-1 flex-shrink-0">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher… (/)"
              className="pl-8 pr-3 py-1.5 text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-indigo-400 focus:bg-white transition-colors w-28 sm:w-44"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M6 18L18 6M6 6l12 12" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>

          <div className="w-px h-4 bg-gray-200 mx-1 flex-shrink-0" />

          {/* Filter button */}
          <div ref={filterBtnRef} className="flex-shrink-0">
            <button
              onClick={() => {
                const rect = filterBtnRef.current?.getBoundingClientRect();
                if (rect) setPanelPos({ top: rect.bottom + 4, left: rect.left });
                setShowFilterPanel((v) => !v);
                setShowSortPanel(false);
                setShowColumnsPanel(false);
                setShowViewsPanel(false);
              }}
              className={[
                "flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md transition-colors cursor-pointer",
                activeFilterCount > 0
                  ? "text-indigo-600 bg-indigo-50 hover:bg-indigo-100"
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-100",
              ].join(" ")}
            >
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M3 6h18M3 12h12M3 18h6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="hidden sm:inline">Filtrer</span>
              {activeFilterCount > 0 && (
                <span className="ml-0.5 bg-indigo-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>

          </div>

          {/* Sort button */}
          <div ref={sortBtnRef} className="flex-shrink-0">
            <button
              onClick={() => {
                const rect = sortBtnRef.current?.getBoundingClientRect();
                if (rect) setPanelPos({ top: rect.bottom + 4, left: rect.left });
                setShowSortPanel((v) => !v);
                setShowFilterPanel(false);
                setShowColumnsPanel(false);
                setShowViewsPanel(false);
              }}
              className={[
                "flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md transition-colors cursor-pointer",
                sort
                  ? "text-indigo-600 bg-indigo-50 hover:bg-indigo-100"
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-100",
              ].join(" ")}
            >
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="hidden sm:inline">{sortLabel ?? "Trier"}</span>
              <span className="sm:hidden">{sort ? "↕" : ""}</span>
              {sort && (
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    setSort(null);
                  }}
                  className="ml-0.5 text-indigo-400 hover:text-indigo-700 leading-none"
                  title="Supprimer le tri"
                >
                  ×
                </span>
              )}
            </button>

          </div>

          {/* Columns button */}
          <div ref={columnsBtnRef} className="flex-shrink-0">
            <button
              onClick={() => {
                const rect = columnsBtnRef.current?.getBoundingClientRect();
                if (rect) setPanelPos({ top: rect.bottom + 4, left: rect.left });
                setShowColumnsPanel((v) => !v);
                setShowFilterPanel(false);
                setShowSortPanel(false);
                setShowViewsPanel(false);
              }}
              className={[
                "flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md transition-colors cursor-pointer",
                hiddenColumnIds.length > 0
                  ? "text-indigo-600 bg-indigo-50 hover:bg-indigo-100"
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-100",
              ].join(" ")}
            >
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <span className="hidden sm:inline">Colonnes</span>
              {hiddenColumnIds.length > 0 && (
                <span className="ml-0.5 bg-indigo-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                  {hiddenColumnIds.length}
                </span>
              )}
            </button>

          </div>

          {/* Saved views */}
          <div ref={viewsBtnRef} className="flex-shrink-0">
            <button
              onClick={() => {
                const rect = viewsBtnRef.current?.getBoundingClientRect();
                if (rect) setPanelPos({ top: rect.bottom + 4, left: rect.left });
                setShowViewsPanel((v) => !v);
                setShowFilterPanel(false);
                setShowSortPanel(false);
                setShowColumnsPanel(false);
                if (!viewsLoaded) {
                  listSavedViews(project.id).then((vs) => {
                    setSavedViews(vs);
                    setViewsLoaded(true);
                  });
                }
              }}
              className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md transition-colors cursor-pointer ${showViewsPanel ? "bg-indigo-50 text-indigo-600" : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"}`}
            >
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="hidden sm:inline">Vues</span>
              {savedViews.length > 0 && (
                <span className="ml-0.5 text-[10px] bg-indigo-100 text-indigo-600 rounded-full px-1.5 py-0.5 font-medium">
                  {savedViews.length}
                </span>
              )}
            </button>

          </div>

          {/* Export CSV + command palette */}
          <div className="ml-auto flex items-center gap-1 flex-shrink-0">
            <button
              onClick={exportCSV}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 px-2.5 py-1.5 rounded-md transition-colors cursor-pointer"
              title="Exporter en CSV"
            >
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M12 15V3m0 12l-4-4m4 4l4-4M3 17v2a2 2 0 002 2h14a2 2 0 002-2v-2" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="hidden sm:inline">CSV</span>
            </button>
            <button
              onClick={() => setShowCommandPalette(true)}
              className="hidden sm:flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-100 px-2 py-1.5 rounded-md transition-colors cursor-pointer"
              title="Command palette (⌘K)"
            >
              <kbd className="text-[10px] border border-gray-200 rounded px-1 font-mono">⌘K</kbd>
            </button>
          </div>

          {/* Active filter chips */}
          {activeFilterCount > 0 && (
            <div className="flex items-center gap-1 ml-2">
              {filters.status.map((v) => {
                const opt = STATUS_OPTIONS.find((o) => o.value === v);
                return (
                  <span
                    key={v}
                    className="inline-flex items-center gap-1 text-[11px] bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full px-2 py-0.5"
                  >
                    {opt?.label ?? v}
                    <button
                      onClick={() => toggleFilter("status", v)}
                      className="text-indigo-400 hover:text-indigo-700 cursor-pointer leading-none"
                    >
                      ×
                    </button>
                  </span>
                );
              })}
              {filters.priority.map((v) => {
                const opt = PRIORITY_OPTIONS.find((o) => o.value === v);
                return (
                  <span
                    key={v}
                    className="inline-flex items-center gap-1 text-[11px] bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full px-2 py-0.5"
                  >
                    {opt?.label ?? v}
                    <button
                      onClick={() => toggleFilter("priority", v)}
                      className="text-indigo-400 hover:text-indigo-700 cursor-pointer leading-none"
                    >
                      ×
                    </button>
                  </span>
                );
              })}
              {filters.owner.map((v) => (
                <span
                  key={v}
                  className="inline-flex items-center gap-1 text-[11px] bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full px-2 py-0.5"
                >
                  {v}
                  <button
                    onClick={() => toggleFilter("owner", v)}
                    className="text-indigo-400 hover:text-indigo-700 cursor-pointer leading-none"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          </div>{/* end scrollable row */}

          {/* ── Dropdown panels — hors du div overflow pour éviter le clipping ── */}
          {showFilterPanel && (
            <div style={{ position: "fixed", top: panelPos.top, left: panelPos.left, zIndex: 50 }} className="bg-white border border-gray-200 rounded-xl shadow-lg p-4 w-72">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Status</p>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {STATUS_OPTIONS.map((opt) => (
                  <button key={opt.value} onClick={() => toggleFilter("status", opt.value)}
                    className={["text-xs px-2 py-0.5 rounded-full border transition-colors cursor-pointer", filters.status.includes(opt.value) ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-gray-200 text-gray-600 hover:border-gray-300"].join(" ")}
                  >{opt.label}</button>
                ))}
              </div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Priorité</p>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {PRIORITY_OPTIONS.map((opt) => (
                  <button key={opt.value} onClick={() => toggleFilter("priority", opt.value)}
                    className={["text-xs px-2 py-0.5 rounded-full border transition-colors cursor-pointer", filters.priority.includes(opt.value) ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-gray-200 text-gray-600 hover:border-gray-300"].join(" ")}
                  >{opt.label}</button>
                ))}
              </div>
              {uniqueOwners.length > 0 && (
                <>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Responsable</p>
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {uniqueOwners.map((name) => (
                      <button key={name} onClick={() => toggleFilter("owner", name)}
                        className={["text-xs px-2 py-0.5 rounded-full border transition-colors cursor-pointer", filters.owner.includes(name) ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-gray-200 text-gray-600 hover:border-gray-300"].join(" ")}
                      >{name}</button>
                    ))}
                  </div>
                </>
              )}
              {activeFilterCount > 0 && (
                <button onClick={clearFilters} className="text-xs text-red-500 hover:text-red-700 transition-colors cursor-pointer">Tout effacer</button>
              )}
            </div>
          )}

          {showSortPanel && (
            <div style={{ position: "fixed", top: panelPos.top, left: panelPos.left, zIndex: 50 }} className="bg-white border border-gray-200 rounded-xl shadow-lg py-1 w-48">
              {SORT_OPTIONS.map((opt) => {
                const active = sort?.columnType === opt.key;
                return (
                  <button key={opt.key} onClick={() => handleSortPick(opt.key)}
                    className={["w-full text-left flex items-center justify-between px-3 py-2 text-sm transition-colors cursor-pointer", active ? "text-indigo-600 bg-indigo-50" : "text-gray-700 hover:bg-gray-50"].join(" ")}
                  >
                    {opt.label}
                    {active && <span className="text-indigo-500 text-xs">{sort?.dir === "asc" ? "↑" : "↓"}</span>}
                  </button>
                );
              })}
            </div>
          )}

          {showColumnsPanel && (
            <div style={{ position: "fixed", top: panelPos.top, left: panelPos.left, zIndex: 50 }} className="bg-white border border-gray-200 rounded-xl shadow-lg p-4 w-60">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Colonnes actives</p>
              <div className="space-y-0.5 mb-3">
                {effectiveColumns.map((col) => {
                  const visible = !hiddenColumnIds.includes(col.id);
                  return (
                    <button key={col.id} onClick={() => toggleColumn(col.id)}
                      className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer text-left"
                    >
                      <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${visible ? "bg-indigo-500 border-indigo-500" : "border-gray-300"}`}>
                        {visible && <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                      </div>
                      <span className="text-sm text-gray-700">{col.label}</span>
                    </button>
                  );
                })}
              </div>
              {(() => {
                const inactiveDbCols = allColumns.filter((c) => !activeColumnIds.has(c.id));
                const existingTypes = new Set(allColumns.map((c) => c.type));
                const missingMeta = AVAILABLE_COLUMNS.filter((m) => !existingTypes.has(m.type));
                if (inactiveDbCols.length === 0 && missingMeta.length === 0) return null;
                return (
                  <>
                    <div className="border-t border-gray-100 my-2" />
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Ajouter une colonne</p>
                    <div className="space-y-0.5">
                      {inactiveDbCols.map((col) => (
                        <button key={col.id} onClick={() => toggleColumnActive(col.id)}
                          className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors cursor-pointer text-left group"
                        >
                          <div className="w-4 h-4 rounded border border-dashed border-gray-300 flex items-center justify-center flex-shrink-0 group-hover:border-indigo-400">
                            <svg className="w-2.5 h-2.5 text-gray-300 group-hover:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4" strokeWidth="2" strokeLinecap="round" /></svg>
                          </div>
                          <span className="text-sm text-gray-400 group-hover:text-indigo-600">{col.label}</span>
                        </button>
                      ))}
                      {missingMeta.map((meta) => (
                        <button key={meta.type} onClick={() => handleAddMissingColumn(meta.type, meta.label)}
                          className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors cursor-pointer text-left group"
                        >
                          <div className="w-4 h-4 rounded border border-dashed border-gray-300 flex items-center justify-center flex-shrink-0 group-hover:border-indigo-400">
                            <svg className="w-2.5 h-2.5 text-gray-300 group-hover:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4" strokeWidth="2" strokeLinecap="round" /></svg>
                          </div>
                          <span className="text-sm text-gray-400 group-hover:text-indigo-600">{meta.label}</span>
                        </button>
                      ))}
                    </div>
                  </>
                );
              })()}
              {hiddenColumnIds.length > 0 && (
                <button onClick={() => setHiddenColumnIds([])} className="mt-3 text-xs text-indigo-500 hover:text-indigo-700 transition-colors cursor-pointer">Tout afficher</button>
              )}
            </div>
          )}

          {showViewsPanel && (
            <div style={{ position: "fixed", top: panelPos.top, left: panelPos.left, zIndex: 50 }} className="bg-white border border-gray-200 rounded-xl shadow-xl w-72 py-2">
              <div className="px-3 pb-2 border-b border-gray-100">
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Sauvegarder la vue actuelle</p>
                <div className="flex gap-2">
                  <input type="text" value={saveViewName} onChange={(e) => setSaveViewName(e.target.value)} placeholder="Nom de la vue…"
                    className="flex-1 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200"
                    onKeyDown={(e) => { if (e.key === "Enter") document.getElementById("save-view-btn")?.click(); }}
                  />
                  <button id="save-view-btn" disabled={savingView || !saveViewName.trim()}
                    onClick={async () => {
                      if (!saveViewName.trim()) return;
                      setSavingView(true);
                      try {
                        const snap = { tab: activeTab, filters, sort: sort ?? null, visibleColumnIds: visibleColumns.map((c) => c.id), search };
                        const created = await createSavedView(project.id, saveViewName, snap);
                        setSavedViews((prev) => [...prev, { id: created.id, name: created.name, snapshot: created.snapshot }]);
                        setSaveViewName("");
                      } finally { setSavingView(false); }
                    }}
                    className="text-xs bg-indigo-500 hover:bg-indigo-600 disabled:opacity-40 text-white rounded-lg px-2.5 py-1.5 transition-colors cursor-pointer disabled:cursor-default"
                  >{savingView ? "…" : "Sauvegarder"}</button>
                </div>
              </div>
              <div className="px-3 pt-2">
                {!viewsLoaded ? (
                  <p className="text-xs text-gray-400 py-1">Chargement…</p>
                ) : savedViews.length === 0 ? (
                  <p className="text-xs text-gray-400 italic py-1">Aucune vue sauvegardée.</p>
                ) : (
                  <div className="space-y-0.5">
                    {savedViews.map((sv) => {
                      const snap = JSON.parse(sv.snapshot) as { tab: string; filters: { status: string[]; priority: string[]; owner: string[] }; sort: { columnType: string; dir: "asc" | "desc" } | null; visibleColumnIds: string[]; search: string };
                      return (
                        <div key={sv.id} className="flex items-center gap-1 group/sv">
                          <button
                            onClick={() => {
                              setActiveTab(snap.tab as typeof activeTab);
                              setFilters(snap.filters);
                              setSort(snap.sort ? { columnType: snap.sort.columnType as import("@/lib/types").SpreadsheetSortColumn, dir: snap.sort.dir } : null);
                              setSearch(snap.search);
                              const visIds = new Set(snap.visibleColumnIds);
                              setHiddenColumnIds(project.columns.filter((c) => !visIds.has(c.id)).map((c) => c.id));
                              setShowViewsPanel(false);
                            }}
                            className="flex-1 text-left text-xs text-gray-700 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg px-2.5 py-1.5 transition-colors cursor-pointer"
                          >
                            {sv.name}
                            <span className="ml-1.5 text-[10px] text-gray-400">{snap.tab}</span>
                          </button>
                          <button
                            onClick={async () => { setSavedViews((prev) => prev.filter((v) => v.id !== sv.id)); await deleteSavedView(sv.id); }}
                            className="opacity-0 group-hover/sv:opacity-100 p-1 rounded text-gray-400 hover:text-red-500 transition-all cursor-pointer"
                            title="Supprimer cette vue"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" strokeWidth="2" strokeLinecap="round" /></svg>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Content ── */}
      <main className="flex-1 bg-white mx-6 mt-4 mb-6 rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {activeTab === "spreadsheet" && (
          <ProjectSpreadsheet
            project={project}
            filters={filters}
            sort={sort}
            visibleColumns={visibleColumns}
            search={search}
            memberNames={members.map((m) => m.user.name)}
          />
        )}
        {activeTab === "cards" && (
          <ProjectCardsView project={project} />
        )}
        {activeTab === "kanban" && (
          <ProjectKanbanView project={project} />
        )}
        {activeTab === "calendar" && (
          <ProjectCalendarView project={project} />
        )}
        {activeTab === "gantt" && (
          <ProjectGanttView project={project} />
        )}
        {activeTab === "timeline" && (
          <ProjectTimelineView project={project} />
        )}
        {activeTab === "dashboard" && (
          <ProjectDashboard project={project} />
        )}
        {activeTab === "activity" && (
          <ProjectActivityFeed
            projectId={project.id}
            onOpenTask={(taskId) => {
              const task = project.groups.flatMap((g) => g.tasks).find((t) => t.id === taskId);
              const group = project.groups.find((g) => g.tasks.some((t) => t.id === taskId));
              if (task && group) {
                setCmdPaletteTask({ task, groupName: group.name, groupColor: group.color });
              }
            }}
          />
        )}
      </main>

      {showInviteModal && (
        <InviteModal
          projectId={project.id}
          members={members}
          isAdmin={isAdmin}
          onClose={() => setShowInviteModal(false)}
          onMemberRemoved={(uid) => setMembers((prev) => prev.filter((m) => m.userId !== uid))}
          onMemberUpdated={(m) => setMembers((prev) => prev.map((x) => x.userId === m.userId ? m : x))}
        />
      )}
      {showSaveTemplate && (
        <SaveTemplateModal
          projectId={project.id}
          projectName={project.name}
          onClose={() => setShowSaveTemplate(false)}
        />
      )}
      {showAutomationsPanel && (
        <AutomationsPanel
          projectId={project.id}
          onClose={() => setShowAutomationsPanel(false)}
        />
      )}
      {showCommandPalette && (
        <CommandPalette
          project={project}
          onClose={() => setShowCommandPalette(false)}
          onOpenTask={(task, groupName, groupColor) => setCmdPaletteTask({ task, groupName, groupColor })}
          onSwitchTab={(tab) => setActiveTab(tab as typeof activeTab)}
          onAddTask={(groupId) => {
            setActiveTab("spreadsheet");
            // Signal the spreadsheet to focus the new task row for that group
            // (handled by setting a pending group in state)
          }}
        />
      )}
      {cmdPaletteTask && (
        <TaskDetailPanel
          task={cmdPaletteTask.task}
          columns={project.columns}
          groupName={cmdPaletteTask.groupName}
          groupColor={cmdPaletteTask.groupColor}
          projectId={project.id}
          onClose={() => setCmdPaletteTask(null)}
          onFieldUpdate={(columnId, value) => {
            import("@/lib/actions").then(({ upsertTaskField }) =>
              upsertTaskField(cmdPaletteTask.task.id, columnId, value)
            );
          }}
          onTitleUpdate={(title) => {
            import("@/lib/actions").then(({ updateTaskTitle }) =>
              updateTaskTitle(cmdPaletteTask.task.id, title)
            );
          }}
        />
      )}
    </div>
    </ProjectProvider>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={[
        "flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors",
        disabled
          ? "border-transparent text-gray-300 cursor-default"
          : active
          ? "border-indigo-600 text-indigo-600 cursor-pointer"
          : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 cursor-pointer",
      ].join(" ")}
    >
      {icon}
      {children}
    </button>
  );
}
