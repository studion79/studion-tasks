"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import Link from "next/link";
import { deleteProject, renameProject, togglePinProject, assignProjectToGroup } from "@/lib/actions";

function DeleteConfirmModal({
  projectName,
  projectId,
  onClose,
}: {
  projectName: string;
  projectId: string;
  onClose: () => void;
}) {
  const [confirm, setConfirm] = useState("");
  const [isPending, startTransition] = useTransition();

  const handleDelete = () => {
    startTransition(async () => {
      await deleteProject(projectId);
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
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-50">Supprimer le projet</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Cette action est irréversible</p>
            </div>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
            Pour confirmer, saisissez le nom du projet :{" "}
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
              Annuler
            </button>
            <button
              onClick={handleDelete}
              disabled={confirm !== projectName || isPending}
              className="flex-1 bg-red-600 text-white text-sm font-medium rounded-lg py-2 hover:bg-red-700 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isPending ? "Suppression…" : "Supprimer"}
            </button>
          </div>
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
  createdAt: Date;
  _count: { groups: number; members: number };
  members: { isPinned: boolean; userGroupId: string | null }[];
  groups: {
    _count: { tasks: number };
    tasks: TaskLight[];
  }[];
};

type UserGroup = { id: string; name: string };

export function ProjectCard({ project, userGroups, onGroupChange }: { project: ProjectWithStats; userGroups?: UserGroup[]; onGroupChange?: () => void }) {
  const [showMenu, setShowMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [draft, setDraft] = useState(project.name);
  const [pinned, setPinned] = useState(project.members[0]?.isPinned ?? false);
  const [isPending, startTransition] = useTransition();
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
    startTransition(async () => {
      await renameProject(project.id, name);
      setRenaming(false);
      window.location.reload();
    });
  };

  const handlePin = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setPinned((v) => !v);
    startTransition(async () => {
      await togglePinProject(project.id);
      window.location.reload();
    });
  };

  const COLORS = ["bg-indigo-100 text-indigo-600", "bg-emerald-100 text-emerald-600", "bg-amber-100 text-amber-700", "bg-rose-100 text-rose-600", "bg-sky-100 text-sky-600", "bg-purple-100 text-purple-600"];
  const colorIdx = project.name.charCodeAt(0) % COLORS.length;

  return (
    <div className={`relative bg-white dark:bg-gray-800 rounded-xl border p-5 hover:border-indigo-300 dark:hover:border-indigo-600 hover:shadow-sm transition-all group ${pinned ? "border-indigo-200 dark:border-indigo-700" : "border-gray-200 dark:border-gray-700"}`}>
      {/* Pin indicator */}
      {pinned && (
        <div className="absolute top-0 left-0 w-full h-0.5 bg-indigo-400 rounded-t-xl" />
      )}
      {/* Pin button */}
      <button
        onClick={handlePin}
        title={pinned ? "Désépingler" : "Épingler"}
        className={`absolute top-3 left-3 p-1 rounded transition-all cursor-pointer ${pinned ? "opacity-100 text-indigo-500" : "opacity-0 group-hover:opacity-100 text-gray-300 hover:text-indigo-400"}`}
      >
        <svg className="w-3 h-3" viewBox="0 0 24 24" fill={pinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {/* Context menu trigger */}
      <div ref={menuRef} className="absolute top-3 right-3">
        <button
          onClick={(e) => { e.preventDefault(); setShowMenu((v) => !v); }}
          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all cursor-pointer"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" />
          </svg>
        </button>

        {showMenu && (
          <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg py-1 z-20 w-44">
            <button
              onClick={() => { setShowMenu(false); setRenaming(true); }}
              className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer flex items-center gap-2"
            >
              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              Renommer
            </button>
            {userGroups && userGroups.length > 0 && (
              <>
                <div className="border-t border-gray-100 dark:border-gray-700 my-1" />
                <p className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Déplacer vers</p>
                {userGroups.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => {
                      setShowMenu(false);
                      startTransition(async () => {
                        await assignProjectToGroup(project.id, g.id);
                        onGroupChange?.();
                        window.location.reload();
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
                        window.location.reload();
                      });
                    }}
                    className="w-full text-left px-3 py-1.5 text-sm text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer italic"
                  >
                    Sans groupe
                  </button>
                )}
              </>
            )}
            <div className="border-t border-gray-100 dark:border-gray-700 my-1" />
            <button
              onClick={() => { setShowMenu(false); setShowDeleteModal(true); }}
              className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors cursor-pointer flex items-center gap-2"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              Supprimer
            </button>
          </div>
        )}
      </div>

      <Link href={`/projects/${project.id}`} className="block">
        <div className="flex items-start gap-3 mb-3">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${COLORS[colorIdx]}`}>
            <span className="text-sm font-bold">{project.name.charAt(0).toUpperCase()}</span>
          </div>
        </div>

        {renaming ? null : (
          <>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-50 group-hover:text-indigo-700 dark:group-hover:text-indigo-400 transition-colors pr-6">
              {project.name}
            </h3>

            {/* Progress bar */}
            {totalTasks > 0 && (
              <div className="mt-2.5">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-gray-400 dark:text-gray-500">{doneTasks}/{totalTasks} terminées</span>
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
                {totalTasks} tâche{totalTasks !== 1 ? "s" : ""}
              </span>
              {project._count.members > 0 && (
                <>
                  <span className="text-gray-200 dark:text-gray-700">·</span>
                  <span className="text-[11px] text-gray-400 dark:text-gray-500">
                    {project._count.members} membre{project._count.members !== 1 ? "s" : ""}
                  </span>
                </>
              )}
              {overdueTasks > 0 && (
                <>
                  <span className="text-gray-200 dark:text-gray-700">·</span>
                  <span className="text-[11px] text-red-400 font-medium">
                    {overdueTasks} en retard
                  </span>
                </>
              )}
            </div>

            <p className="text-[10px] text-gray-300 dark:text-gray-600 mt-1">
              {lastUpdated
                ? `Modifié le ${new Date(lastUpdated).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`
                : `Créé le ${new Date(project.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}`}
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
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">Entrée pour valider, Échap pour annuler</p>
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
