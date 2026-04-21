"use client";

import { useState, useTransition, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { getUiLocale } from "@/lib/ui-locale";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteProject, renameProject, togglePinProject, assignProjectToGroup, archiveProject } from "@/lib/actions";
import { pickByIsEn, pickByLocale } from "@/lib/i18n/pick";

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
          setError(pickByIsEn(isEn, "Un projet personnel ne peut pas être supprimé.", "Personal projects cannot be deleted."));
          return;
        }
        setError(pickByIsEn(isEn, "Impossible de supprimer ce projet.", "Unable to delete this project."));
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
                <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-50">{pickByIsEn(isEn, "Supprimer le projet", "Delete project")}</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{pickByIsEn(isEn, "Cette action est irréversible", "This action is irreversible")}</p>
            </div>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
            {pickByIsEn(isEn, "Pour confirmer, saisissez le nom du projet :", "To confirm, type the project name:")}{" "}
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
            <button
              onClick={onClose}
              className="flex-1 border border-gray-200 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-300 rounded-lg py-2 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
            >
              {pickByIsEn(isEn, "Annuler", "Cancel")}
            </button>
            <button
              onClick={handleDelete}
              disabled={confirm !== projectName || isPending}
              className="flex-1 bg-red-600 text-white text-sm font-medium rounded-lg py-2 hover:bg-red-700 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isPending ? (pickByIsEn(isEn, "Suppression…", "Deleting...")) : (pickByIsEn(isEn, "Supprimer", "Delete"))}
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
  const displayProjectName = project.isPersonal ? pickByIsEn(isEn, project.name, "Personnal") : project.name;
  const [showMenu, setShowMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [draft, setDraft] = useState(project.name);
  const [pinned, setPinned] = useState(project.members[0]?.isPinned ?? false);
  const [renameError, setRenameError] = useState("");
  const [actionError, setActionError] = useState("");
  const [avatarBroken, setAvatarBroken] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);
  const menuPanelRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
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
  const lastUpdated = allTasks.length > 0
    ? allTasks.reduce((latest, t) => t.updatedAt > latest ? t.updatedAt : latest, allTasks[0].updatedAt)
    : null;

  useEffect(() => {
    if (renaming) {
      setDraft(project.name);
      setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select(); }, 0);
    }
  }, [renaming, project.name]);

  useEffect(() => {
    setAvatarBroken(false);
  }, [project.avatar]);

  useEffect(() => {
    if (!showMenu) return;
    const updatePos = () => {
      const rect = menuButtonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = 176;
      const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
      const top = rect.bottom + 8;
      setMenuPos({ top, left });
    };
    updatePos();
    window.addEventListener("resize", updatePos);
    window.addEventListener("scroll", updatePos, true);
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target)) return;
      if (menuPanelRef.current?.contains(target)) return;
      setShowMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      window.removeEventListener("resize", updatePos);
      window.removeEventListener("scroll", updatePos, true);
    };
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
        setRenameError(e instanceof Error ? e.message : (pickByIsEn(isEn, "Erreur", "Error")));
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

  const COLORS = ["bg-indigo-100 text-indigo-600", "bg-emerald-100 text-emerald-600", "bg-amber-100 text-amber-700", "bg-rose-100 text-rose-600", "bg-sky-100 text-sky-600", "bg-purple-100 text-purple-600"];
  const colorIdx = project.name.charCodeAt(0) % COLORS.length;
  const avatarSrc = useMemo(() => {
    if (!project.avatar) return null;
    return `/api/projects/${project.id}/avatar`;
  }, [project.avatar, project.id]);

  return (
    <div
      className={`relative overflow-visible rounded-xl border bg-white p-5 transition-all group hover:border-indigo-300 hover:shadow-sm dark:bg-gray-800 dark:hover:border-indigo-600 ${showMenu ? "z-[120]" : "z-0"} ${pinned ? "border-indigo-200 dark:border-indigo-700" : "border-gray-200 dark:border-gray-700"}`}
    >
      {/* Pin button */}
      {canPin && (
        <button
          onClick={handlePin}
          aria-label={pinned ? (pickByIsEn(isEn, "Désépingler le projet", "Unpin project")) : (pickByIsEn(isEn, "Épingler le projet", "Pin project"))}
          title={pinned ? (pickByIsEn(isEn, "Désépingler", "Unpin")) : (pickByIsEn(isEn, "Épingler", "Pin"))}
          className={`absolute top-3 left-3 p-1 rounded transition-all cursor-pointer ${pinned ? "opacity-100 text-indigo-500" : "opacity-0 group-hover:opacity-100 text-gray-300 hover:text-indigo-400"}`}
        >
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
            <path d="M16 4a1 1 0 011 1v1.5l1.5 3H18v4h-5v5a1 1 0 01-2 0v-5H6v-4H6.5L8 6.5V5a1 1 0 011-1h7z"/>
          </svg>
        </button>
      )}
      {/* Context menu trigger */}
      <div ref={menuRef} className="absolute top-3 right-3 z-[130]">
        <button
          ref={menuButtonRef}
          onClick={(e) => {
            e.preventDefault();
            const next = !showMenu;
            if (!next) {
              setShowMenu(false);
              return;
            }
            const rect = menuButtonRef.current?.getBoundingClientRect();
            if (rect) {
              const width = 176;
              const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
              const top = rect.bottom + 8;
              setMenuPos({ top, left });
            }
            setShowMenu(true);
          }}
          aria-label={pickByIsEn(isEn, "Actions du projet", "Project actions")}
          className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 p-1.5 rounded-md text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all cursor-pointer"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" />
          </svg>
        </button>

        {showMenu && menuPos && createPortal(
          <div
            ref={menuPanelRef}
            className="fixed w-44 rounded-xl border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800 z-[2147483647]"
            style={{ top: menuPos.top, left: menuPos.left }}
          >
            <button
              onClick={() => { setShowMenu(false); setRenaming(true); }}
              className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer flex items-center gap-2"
            >
              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              {pickByIsEn(isEn, "Renommer", "Rename")}
            </button>
            {canGroup && userGroups && userGroups.length > 0 && (
              <>
                <div className="border-t border-gray-100 dark:border-gray-700 my-1" />
                <p className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{pickByIsEn(isEn, "Déplacer vers", "Move to")}</p>
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
                    className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer truncate"
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
                    className="w-full text-left px-3 py-1.5 text-sm text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer italic"
                  >
                    {pickByIsEn(isEn, "Sans groupe", "Ungrouped")}
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
                    if (raw.includes("FORBIDDEN_ARCHIVE_PROJECT")) {
                      setActionError(pickByIsEn(isEn, "Vous n'êtes pas autorisé à archiver ce projet.", "You are not allowed to archive this project."));
                    } else {
                      setActionError(pickByIsEn(isEn, "Impossible d'archiver ce projet.", "Unable to archive this project."));
                    }
                  }
                });
              }}
              className="w-full text-left px-3 py-2 text-sm text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors cursor-pointer flex items-center gap-2"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M20 7v10a2 2 0 01-2 2H6a2 2 0 01-2-2V7m16 0l-2-3H6L4 7m16 0H4m5 4h6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {pickByIsEn(isEn, "Archiver", "Archive")}
            </button>
            <div className="border-t border-gray-100 dark:border-gray-700 my-1" />
            {!project.isPersonal && (
              <button
                onClick={() => { setShowMenu(false); setShowDeleteModal(true); }}
                className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors cursor-pointer flex items-center gap-2"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                {pickByIsEn(isEn, "Supprimer", "Delete")}
              </button>
            )}
          </div>,
          document.body
        )}
      </div>

      <Link href={`/projects/${project.id}`} className="block">
        <div className="flex items-start gap-3 mb-3">
          {avatarSrc && !avatarBroken ? (
            <img
              src={avatarSrc}
              alt={`${pickByIsEn(isEn, "Avatar projet", "Project avatar")} ${displayProjectName}`}
              className="w-9 h-9 rounded-lg object-cover border border-gray-200 dark:border-gray-700 flex-shrink-0"
              onError={() => setAvatarBroken(true)}
            />
          ) : (
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${COLORS[colorIdx]}`}>
              <span className="text-sm font-bold">{displayProjectName.charAt(0).toUpperCase()}</span>
            </div>
          )}
        </div>

            {renaming ? null : (
              <>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-50 group-hover:text-indigo-700 dark:group-hover:text-indigo-400 transition-colors pr-6">
                  {displayProjectName}
                </h3>
                {project.isPersonal && (
                  <span className="inline-flex mt-1 items-center rounded-full bg-indigo-100 dark:bg-indigo-900/40 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 dark:text-indigo-300">
                    {pickByIsEn(isEn, "Personnel", "Personnal")}
                  </span>
                )}
                {actionError && (
                  <p className="text-[11px] text-red-500 mt-1">{actionError}</p>
                )}

                {/* Progress bar */}
            {totalTasks > 0 && (
              <div className="mt-2.5">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-gray-400 dark:text-gray-500">{doneTasks}/{totalTasks} {pickByIsEn(isEn, "terminées", "completed")}</span>
                  <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400">{pct}%</span>
                </div>
                <div className="h-1 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-400 rounded-full transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 mt-2.5 flex-wrap">
              <span className="text-[11px] text-gray-400 dark:text-gray-500">
                {totalTasks} {pickByIsEn(isEn, "tâche", "task")}{totalTasks !== 1 ? "s" : ""}
              </span>
              {project._count.members > 0 && (
                <>
                  <span className="text-gray-200 dark:text-gray-700">·</span>
                  <span className="text-[11px] text-gray-400 dark:text-gray-500">
                    {project._count.members} {pickByIsEn(isEn, "membre", "member")}{project._count.members !== 1 ? "s" : ""}
                  </span>
                </>
              )}
              {overdueTasks > 0 && (
                <>
                  <span className="text-gray-200 dark:text-gray-700">·</span>
                  <span className="text-[11px] text-red-400 font-medium">
                    {overdueTasks} {pickByIsEn(isEn, "en retard", "late")}
                  </span>
                </>
              )}
            </div>

            <p className="text-[10px] text-gray-300 dark:text-gray-600 mt-1">
              {lastUpdated
                ? `${pickByIsEn(isEn, "Modifié le", "Updated on")} ${new Date(lastUpdated).toLocaleDateString(getUiLocale(), { day: "numeric", month: "short" })}`
                : `${pickByIsEn(isEn, "Créé le", "Created on")} ${new Date(project.createdAt).toLocaleDateString(getUiLocale(), { day: "numeric", month: "short", year: "numeric" })}`}
            </p>
          </>
        )}
      </Link>

      {renaming && (
        <div className="mt-1">
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRename();
              if (e.key === "Escape") setRenaming(false);
            }}
            onBlur={handleRename}
            className="w-full text-sm font-semibold border-b border-indigo-400 outline-none bg-transparent text-gray-900 dark:text-gray-50 pr-2"
          />
          {renameError && <p className="text-[10px] text-red-500 mt-0.5">{renameError}</p>}
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">{pickByIsEn(isEn, "Entrée pour valider, Échap pour annuler", "Enter to confirm, Esc to cancel")}</p>
        </div>
      )}

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
