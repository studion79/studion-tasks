"use client";

import { useState, useEffect, useTransition } from "react";
import { inviteMember, removeMember, updateMemberRole, getProjectInvitations, cancelInvitation, listUserGroups } from "@/lib/actions";
import { GroupsManagerModal } from "./GroupsManagerModal";

type Member = { id: string; userId: string; role: string; user: { id: string; name: string; email: string; avatar: string | null } };

type PendingInvitation = { id: string; email: string; createdAt: Date; expiresAt: Date };

type UserGroupRow = { id: string; name: string; emails: string };

export function InviteModal({
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
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xl p-6 w-full max-w-sm pointer-events-auto max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-50">Membres du projet</h2>
            <button onClick={onClose} className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">
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
                      <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
                        <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">{m.user.name.charAt(0).toUpperCase()}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{m.user.name}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{m.user.email}</p>
                  </div>
                  {isAdmin ? (
                    <button
                      onClick={() => handleToggleRole(m)}
                      title={m.role === "ADMIN" ? "Rétrograder en membre" : "Promouvoir admin"}
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-all cursor-pointer ${
                        m.role === "ADMIN"
                          ? "border-indigo-200 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 hover:bg-indigo-100 dark:hover:bg-indigo-900/40"
                          : "border-gray-200 dark:border-gray-600 text-gray-400 dark:text-gray-500 hover:border-indigo-200 hover:text-indigo-500"
                      }`}
                    >
                      {m.role === "ADMIN" ? "Admin" : "Membre"}
                    </button>
                  ) : (
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                      m.role === "ADMIN"
                        ? "border-indigo-200 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600"
                        : "border-gray-200 dark:border-gray-600 text-gray-400 dark:text-gray-500"
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
              <p className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">En attente</p>
              <div className="space-y-1.5">
                {pendingInvitations.map((inv) => (
                  <div key={inv.id} className="flex items-center gap-2.5 group py-1">
                    <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-600 dark:text-gray-300 truncate">{inv.email}</p>
                      <p className="text-[10px] text-gray-400 dark:text-gray-500">Invitation envoyée</p>
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
            <div className="mb-4 border-t border-gray-100 dark:border-gray-700 pt-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Groupes</p>
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
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{g.name}</p>
                        <p className="text-[11px] text-gray-400 dark:text-gray-500">
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
                            className="text-[11px] font-medium text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 border border-indigo-100 dark:border-indigo-700 px-2.5 py-1 rounded-lg transition-colors cursor-pointer flex-shrink-0"
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
            <div className="mb-4 border-t border-gray-100 dark:border-gray-700 pt-4">
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
            <div className="border-t border-gray-100 dark:border-gray-700 pt-4">
              {/* Invite form */}
              <form onSubmit={handleInvite} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Inviter par email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setSuccess(""); setError(""); }}
                    required
                    autoFocus
                    placeholder="user@exemple.com"
                    className="w-full px-3 py-2 text-sm text-gray-900 dark:text-gray-50 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 transition-colors placeholder-gray-400 dark:placeholder-gray-500"
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
              <p className="mt-3 text-[11px] text-gray-400 dark:text-gray-500 text-center">
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
