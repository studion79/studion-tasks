"use client";

import { useState, useTransition, useRef, useEffect, useMemo } from "react";
import { getUiLocale } from "@/lib/ui-locale";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteProject, renameProject, togglePinProject, assignProjectToGroup, archiveProject } from "@/lib/actions";

function DeleteConfirmModal({
  projectName,
  projectId,
  onClose,
}: {
  projectName: string;
  projectId: string;
  onClose: () => void;
}) {
  const isEn = getUiLocale().startsWith("en");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const handleDelete = () => {
    setError("");
    startTransition(async () => {
      try {
        await deleteProject(projectId);
      } catch (e) {
        const message = e instanceof Error ? e.message : "";
        if (message.includes("FORBIDDEN_DELETE_PERSONAL_PROJECT")) {
          setError(isEn ? "Personal projects cannot be deleted." : "Un projet personnel ne peut pas être supprimé.");
          return;
        }
        setError(isEn ? "Unable to delete this project." : "Impossible de supprimer ce projet.");
      }
    });
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/30" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-red-200 dark:border-red-900/50 shadow-xl p-6 w-full max-w-sm pointer-events-auto">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-50">{isEn ? "Delete project" : "Supprimer le projet"}</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{isEn ? "This action is irreversible" : "Cette action est irréversible"}</p>
            </div>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
            {isEn ? "To confirm, type the project name:" : "Pour confirmer, saisissez le nom du projet :"}{" "}
            <span className="font-semibold text-gray-900 dark:text-gray-50">{projectName}</span>
          </p>
          <input
            autoFocus
            type="text"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && confirm === projectName) handleDelete(); if (e.key === "Escape") onClose(); }}
            placeholder={projectName}
            className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-gray-50 bg-white dark:bg-gray-700 outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400 mb-4"
          />
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 border border-gray-200 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-300 rounded-lg py-2 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer">
              {isEn ? "Cancel" : "Annuler"}
            </button>
            <button
              onClick={handleDelete}
              disabled={confirm !== projectName || isPending}
              className="flex-1 bg-red-600 text-white text-sm font-medium rounded-lg py-2 hover:bg-red-700 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isPending ? (isEn ? "Deleting..." : "Suppression…") : (isEn ? "Delete" : "Supprimer")}
            </button>
          </div>
          {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
        </div>
      </div>
    </>
  );
}

type TaskLight = {
  id: string;
  updatedAt: Date;
  fieldValues: { value: string | null; column: { type: string } }[];
};

type ProjectWithStats = {
  id: string;
  name: string;
  avatar?: string | null;
  isPersonal?: boolean;
  createdAt: Date;
  _count: { groups: number; members: number };
  members: { isPinned: boolean; userGroupId: string | null }[];
  groups: {
    _count: { tasks: number };
    tasks: TaskLight[];
  }[];
};

type UserGroup = { id: string; name: string };

// Color accents per project (deterministic by name)
const ACCENT_COLORS = [
  { border: "border-l-indigo-500", avatar: "bg-indigo-100 text-indigo-700", dot: "bg-indigo-500" },
  { border: "border-l-emerald-500", avatar: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
  { border: "border-l-amber-500", avatar: "bg-amber-100 text-amber-700", dot: "bg-amber-500" },
  { border: "border-l-rose-500", avatar: "bg-rose-100 text-rose-700", dot: "bg-rose-500" },
  { border: "border-l-sky-500", avatar: "bg-sky-100 text-sky-700", dot: "bg-sky-500" },
  { border: "border-l-violet-500", avatar: "bg-violet-100 text-violet-700", dot: "bg-violet-500" },
  { border: "border-l-orange-500", avatar: "bg-orange-100 text-orange-700", dot: "bg-orange-500" },
  { border: "border-l-teal-500", avatar: "bg-teal-100 text-teal-700", dot: "bg-teal-500" },
];

export function ProjectCard({
  project,
  userGroups,
  onGroupChange,
  canPin = true,
  canGroup = true,
}: {
  project: ProjectWithStats;
  userGroups?: UserGroup[];
  onGroupChange?: () => void;
  canPin?: boolean;
  canGroup?: boolean;
}) {
  const isEn = getUiLocale().startsWith("en");
  const displayProjectName = project.isPersonal && isEn ? "Personal" : project.name;
  const [showMenu, setShowMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [draft, setDraft] = useState(project.name);
  const [pinned, setPinned] = useState(project.members[0]?.isPinned ?? false);
  const [renameError, setRenameError] = useState("");
  const [actionError, setActionError] = useState("");
  const [avatarBroken, setAvatarBroken] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const allTasks = project.groups.flatMap((g) => g.tasks);
  const totalTasks = allTasks.length;
  const doneTasks = allTasks.filter((t) =>
    t.fieldValues.some((fv) => fv.column.type === "STATUS" && fv.value === "DONE")
  ).length;
  const overdueTasks = allTasks.filter((t) => {
    const dueFv = t.fieldValues.find((fv) => fv.column.type === "DUE_DATE");
    if (!dueFv?.value) return false;
    return new Date(dueFv.value) < new Date();
  }).length;
  const pct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
  const lastUpdated =
    allTasks.length > 0
      ? allTasks.reduce((latest, t) => (t.updatedAt > latest ? t.updatedAt : latest), allTasks[0].updatedAt)
      : null;

  const accentIdx = project.name.charCodeAt(0) % ACCENT_COLORS.length;
  const accent = ACCENT_COLORS[accentIdx];

  const avatarSrc = useMemo(() => {
    if (!project.avatar) return null;
    return `/api/projects/${project.id}/avatar`;
  }, [project.avatar, project.id]);

  useEffect(() => {
    if (renaming) {
      setDraft(project.name);
      setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select(); }, 0);
    }
  }, [renaming, project.name]);

  useEffect(() => { setAvatarBroken(false); }, [project.avatar]);

  useEffect(() => {
    if (!showMenu) return;
    const handler = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setShowMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showMenu]);

  const handleRename = () => {
    const name = draft.trim();
    if (!name || name === project.name) { setRenaming(false); return; }
    setRenameError("");
    startTransition(async () => {
      try {
        await renameProject(project.id, name);
        setRenaming(false);
        router.refresh();
      } catch (e) {
        setRenameError(e instanceof Error ? e.message : (isEn ? "Error" : "Erreur"));
      }
    });
  };

  const handlePin = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!canPin) return;
    setPinned((v) => !v);
    startTransition(async () => {
      await togglePinProject(project.id);
      router.refresh();
    });
  };

  return (
    <div
      className={`relative overflow-visible bg-white dark:bg-gray-900 rounded-xl border-l-4 border border-gray-200 dark:border-gray-800 ${accent.border} hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 group ${pinned ? "ring-1 ring-indigo-200 dark:ring-indigo-800" : ""}`}
    >
      {/* Pin button */}
      {canPin && (
        <button
          onClick={handlePin}
          aria-label={pinned ? (isEn ? "Unpin" : "Désépingler") : (isEn ? "Pin" : "Épingler")}
          title={pinned ? (isEn ? "Unpin" : "Désépingler") : (isEn ? "Pin" : "Épingler")}
          className={`absolute top-3 left-3 p-1 rounded transition-all cursor-pointer ${pinned ? "opacity-100 text-indigo-500" : "opacity-0 group-hover:opacity-100 text-gray-300 hover:text-indigo-400"}`}
        >
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
            <path d="M16 4a1 1 0 011 1v1.5l1.5 3H18v4h-5v5a1 1 0 01-2 0v-5H6v-4H6.5L8 6.5V5a1 1 0 011-1h7z" />
          </svg>
        </button>
      )}

      {/* Context menu */}
      <div ref={menuRef} className="absolute top-3 right-3 z-30">
        <button
          onClick={(e) => { e.preventDefault(); setShowMenu((v) => !v); }}
          aria-label={isEn ? "Project actions" : "Actions du projet"}
          className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 p-1.5 rounded-md text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all cursor-pointer"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" />
          </svg>
        </button>

        {showMenu && (
          <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg py-1 z-[60] w-44">
            <button
              onClick={() => { setShowMenu(false); setRenaming(true); }}
              className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer flex items-center gap-2"
            >
              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              {isEn ? "Rename" : "Renommer"}
            </button>
            {canGroup && userGroups && userGroups.length > 0 && (
              <>
                <div className="border-t border-gray-100 dark:border-gray-700 my-1" />
                <p className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{isEn ? "Move to" : "Déplacer vers"}</p>
                {userGroups.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => {
                      setShowMenu(false);
                      startTransition(async () => {
                        await assignProjectToGroup(project.id, g.id);
                        onGroupChange?.();
                        router.refresh();
                      });
                    }}
                    className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer truncate"
                  >
                    {g.name}
                  </button>
                ))}
                {project.members[0]?.userGroupId && (
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      startTransition(async () => {
                        await assignProjectToGroup(project.id, null);
                        onGroupChange?.();
                        router.refresh();
                      });
                    }}
                    className="w-full text-left px-3 py-1.5 text-sm text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer italic"
                  >
                    {isEn ? "Ungrouped" : "Sans groupe"}
                  </button>
                )}
              </>
            )}
            <div className="border-t border-gray-100 dark:border-gray-700 my-1" />
            <button
              onClick={() => {
                setShowMenu(false);
                setActionError("");
                startTransition(async () => {
                  try {
                    await archiveProject(project.id);
                    router.refresh();
                  } catch (e) {
                    const raw = e instanceof Error ? e.message : "";
                    setActionError(raw.includes("FORBIDDEN_ARCHIVE_PROJECT")
                      ? (isEn ? "You are not allowed to archive this project." : "Vous n'êtes pas autorisé à archiver ce projet.")
                      : (isEn ? "Unable to archive this project." : "Impossible d'archiver ce projet."));
                  }
                });
              }}
              className="w-full text-left px-3 py-2 text-sm text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors cursor-pointer flex items-center gap-2"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M20 7v10a2 2 0 01-2 2H6a2 2 0 01-2-2V7m16 0l-2-3H6L4 7m16 0H4m5 4h6" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              {isEn ? "Archive" : "Archiver"}
            </button>
            {!project.isPersonal && (
              <>
                <div className="border-t border-gray-100 dark:border-gray-700 my-1" />
                <button
                  onClick={() => { setShowMenu(false); setShowDeleteModal(true); }}
                  className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors cursor-pointer flex items-center gap-2"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  {isEn ? "Delete" : "Supprimer"}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <Link href={`/projects/${project.id}`} className="block p-4">
        {/* Header: avatar + name */}
        <div className="flex items-start gap-3 mb-3 pr-6">
          {avatarSrc && !avatarBroken ? (
            <img
              src={avatarSrc}
              alt={`${displayProjectName}`}
              className="w-9 h-9 rounded-xl object-cover border border-gray-100 dark:border-gray-700 flex-shrink-0"
              onError={() => setAvatarBroken(true)}
            />
          ) : (
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 font-bold text-sm ${accent.avatar}`}>
              {displayProjectName.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            {renaming ? null : (
              <>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-50 group-hover:text-indigo-700 dark:group-hover:text-indigo-400 transition-colors leading-tight truncate">
                  {displayProjectName}
                </h3>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  {project.isPersonal && (
                    <span className="inline-flex items-center rounded-full bg-indigo-100 dark:bg-indigo-900/40 px-1.5 py-0 text-[10px] font-semibold text-indigo-700 dark:text-indigo-300">
                      {isEn ? "Personal" : "Personnel"}
                    </span>
                  )}
                  {overdueTasks > 0 && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-red-100 dark:bg-red-900/30 px-1.5 py-0 text-[10px] font-semibold text-red-600 dark:text-red-400">
                      <span className="w-1 h-1 rounded-full bg-red-500 inline-block" />
                      {overdueTasks} {isEn ? "late" : "en retard"}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {renaming && (
          <div className="mb-3">
            <input
              ref={inputRef}
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleRename(); if (e.key === "Escape") setRenaming(false); }}
              onBlur={handleRename}
              className="w-full text-sm font-semibold border-b-2 border-indigo-400 outline-none bg-transparent text-gray-900 dark:text-gray-50 pr-2"
            />
            {renameError && <p className="text-[10px] text-red-500 mt-0.5">{renameError}</p>}
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">{isEn ? "Enter to save, Esc to cancel" : "Entrée pour valider, Échap pour annuler"}</p>
          </div>
        )}

        {actionError && <p className="text-[11px] text-red-500 mb-2">{actionError}</p>}

        {/* Progress bar */}
        {totalTasks > 0 ? (
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] text-gray-400 dark:text-gray-500">
                {doneTasks}/{totalTasks} {isEn ? "done" : "terminées"}
              </span>
              <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">{pct}%</span>
            </div>
            <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${pct}%`,
                  background: pct === 100
                    ? "linear-gradient(90deg, #34d399, #10b981)"
                    : "linear-gradient(90deg, #818cf8, #6366f1)",
                }}
              />
            </div>
          </div>
        ) : (
          <div className="mb-3 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full" />
        )}

        {/* Footer stats */}
        <div className="flex items-center gap-3 text-[11px] text-gray-400 dark:text-gray-500">
          <span className="flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            {totalTasks} {isEn ? "task" : "tâche"}{totalTasks !== 1 ? "s" : ""}
          </span>
          {project._count.members > 0 && (
            <span className="flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              {project._count.members}
            </span>
          )}
          <span className="ml-auto text-[10px]">
            {lastUpdated
              ? new Date(lastUpdated).toLocaleDateString(isEn ? "en-US" : "fr-FR", { day: "numeric", month: "short" })
              : new Date(project.createdAt).toLocaleDateString(isEn ? "en-US" : "fr-FR", { day: "numeric", month: "short" })}
          </span>
        </div>
      </Link>

      {showDeleteModal && (
        <DeleteConfirmModal
          projectName={project.name}
          projectId={project.id}
          onClose={() => setShowDeleteModal(false)}
        />
      )}
    </div>
  );
}
