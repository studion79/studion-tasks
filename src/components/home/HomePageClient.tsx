"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { ProjectCard } from "./ProjectCard";
import {
  createUserProjectGroup,
  renameUserProjectGroup,
  deleteUserProjectGroup,
  restoreProject,
  deleteProject,
} from "@/lib/actions";
import { localeFromPathname, tr } from "@/lib/i18n/client";

type TaskLight = {
  id: string;
  updatedAt: Date;
  fieldValues: { value: string | null; column: { type: string } }[];
};

type ProjectWithStats = {
  id: string;
  name: string;
  isPersonal?: boolean;
  archivedAt?: Date | null;
  createdAt: Date;
  _count: { groups: number; members: number };
  members: { isPinned: boolean; userGroupId: string | null }[];
  groups: { _count: { tasks: number }; tasks: TaskLight[] }[];
};

type UserGroup = { id: string; name: string; position: number };

export function HomePageClient({
  projects: initialProjects,
  archivedProjects,
  userGroups: initialGroups,
  isSuperAdmin,
}: {
  projects: ProjectWithStats[];
  archivedProjects: ProjectWithStats[];
  userGroups: UserGroup[];
  isSuperAdmin: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const locale = localeFromPathname(pathname);
  const [groups, setGroups] = useState(initialGroups);
  const [, startTransition] = useTransition();
  const [addingGroup, setAddingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [archivesOpen, setArchivesOpen] = useState(false);
  const [restoreErrors, setRestoreErrors] = useState<Record<string, string>>({});
  const addInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (addingGroup) addInputRef.current?.focus(); }, [addingGroup]);
  const handleCreateGroup = () => {
    const name = newGroupName.trim();
    setNewGroupName("");
    setAddingGroup(false);
    if (!name) return;
    startTransition(async () => {
      const created = await createUserProjectGroup(name);
      setGroups((prev) => [...prev, { ...created, position: created.position }]);
    });
  };

  const handleRenameGroup = (id: string) => {
    const name = editDraft.trim();
    setEditingGroupId(null);
    setEditDraft("");
    if (!name) return;
    setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, name } : g)));
    startTransition(async () => { await renameUserProjectGroup(id, name); });
  };

  const handleDeleteGroup = (id: string) => {
    setGroups((prev) => prev.filter((g) => g.id !== id));
    startTransition(async () => { await deleteUserProjectGroup(id); });
  };

  const toggleCollapse = (id: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Group projects by userGroupId
  const projectsByGroup: Record<string, ProjectWithStats[]> = {};
  const ungrouped: ProjectWithStats[] = [];
  const personalProjects: ProjectWithStats[] = [];

  for (const p of initialProjects) {
    if (p.isPersonal) {
      personalProjects.push(p);
      continue;
    }
    const gid = p.members[0]?.userGroupId ?? null;
    if (gid && groups.find((g) => g.id === gid)) {
      if (!projectsByGroup[gid]) projectsByGroup[gid] = [];
      projectsByGroup[gid].push(p);
    } else {
      ungrouped.push(p);
    }
  }

  const pinnedUngrouped = ungrouped.filter((p) => p.members[0]?.isPinned);
  const unpinnedUngrouped = ungrouped.filter((p) => !p.members[0]?.isPinned);

  if (initialProjects.length === 0 && archivedProjects.length === 0) {
    return (
      <div className="text-center py-16 sm:py-24">
        <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d="M19 11H5m14 0l-4-4m4 4l-4 4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50 mb-2">{tr(locale, "Aucun projet pour l'instant", "No projects yet")}</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{tr(locale, "Créez votre premier projet pour commencer.", "Create your first project to get started.")}</p>
        <Link
          href="/projects/new"
          className="inline-flex items-center gap-2 bg-indigo-600 text-white text-sm font-medium rounded-lg px-5 py-2.5 hover:bg-indigo-700 transition-colors"
        >
          {tr(locale, "Créer un projet", "Create a project")}
        </Link>
      </div>
    );
  }

  const NewProjectCard = (
    <Link
      href="/projects/new"
      className="flex flex-col items-center justify-center bg-white dark:bg-gray-800 rounded-xl border border-dashed border-gray-300 dark:border-gray-600 p-5 hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-all text-gray-400 dark:text-gray-500 hover:text-indigo-500 group min-h-[120px]"
    >
      <span className="w-8 h-8 rounded-lg border-2 border-current flex items-center justify-center mb-2 text-lg leading-none group-hover:scale-110 transition-transform">+</span>
      <span className="text-sm font-medium">{tr(locale, "Nouveau projet", "New project")}</span>
    </Link>
  );

  return (
    <div className="space-y-8">
      {/* Pinned ungrouped projects */}
      {personalProjects.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <svg className="w-3 h-3 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M12 3l7 4v5c0 5-3.5 7.8-7 9-3.5-1.2-7-4-7-9V7l7-4z" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              {tr(locale, "Personnel", "Personnal")}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {personalProjects.map((project) => (
              <ProjectCard key={project.id} project={project} userGroups={groups} canPin={!isSuperAdmin} canGroup={false} />
            ))}
          </div>
        </section>
      )}

      {/* Pinned ungrouped projects */}
      {pinnedUngrouped.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <svg className="w-3 h-3 text-indigo-500" fill="currentColor" viewBox="0 0 24 24">
              <path d="M16 4a1 1 0 011 1v1.5l1.5 3H18v4h-5v5a1 1 0 01-2 0v-5H6v-4H6.5L8 6.5V5a1 1 0 011-1h7z"/>
            </svg>
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{tr(locale, "Épinglés", "Pinned")}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {pinnedUngrouped.map((project) => (
              <ProjectCard key={project.id} project={project} userGroups={groups} canPin={!isSuperAdmin} canGroup={!isSuperAdmin} />
            ))}
          </div>
        </section>
      )}

      {/* Named groups */}
      {groups.map((group) => {
        const groupProjects = projectsByGroup[group.id] ?? [];
        const isCollapsed = collapsedGroups.has(group.id);
        return (
          <section key={group.id}>
            <div className="flex items-center gap-2 mb-3 group/ghdr">
              <button onClick={() => toggleCollapse(group.id)} className="text-gray-400 hover:text-gray-600 cursor-pointer">
                <svg className={`w-3.5 h-3.5 transition-transform ${isCollapsed ? "-rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M19 9l-7 7-7-7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {editingGroupId === group.id ? (
                <input
                  autoFocus
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  onBlur={() => handleRenameGroup(group.id)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleRenameGroup(group.id); if (e.key === "Escape") setEditingGroupId(null); }}
                  className="text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 outline-none bg-transparent border-b border-indigo-400 px-0.5"
                  style={{ width: `${Math.max(editDraft.length * 7.5 + 16, 80)}px` }}
                />
              ) : (
                <button
                  onClick={() => { setEditDraft(group.name); setEditingGroupId(group.id); }}
                  className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider hover:text-gray-800 dark:hover:text-gray-100 transition-colors cursor-pointer"
                >
                  {group.name}
                </button>
              )}
              <span className="text-[11px] text-gray-400 dark:text-gray-600">{groupProjects.length}</span>
              <button
                onClick={() => handleDeleteGroup(group.id)}
                className="opacity-0 group-hover/ghdr:opacity-100 ml-1 p-0.5 rounded text-gray-300 hover:text-red-500 cursor-pointer transition-all"
                title={tr(locale, "Supprimer ce groupe", "Delete this group")}
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" strokeLinecap="round"/></svg>
              </button>
            </div>
            {!isCollapsed && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {groupProjects.map((project) => (
                  <ProjectCard key={project.id} project={project} userGroups={groups} canPin={!isSuperAdmin} canGroup={!isSuperAdmin} />
                ))}
              </div>
            )}
          </section>
        );
      })}

      {/* Ungrouped projects (unpinned) */}
      {(unpinnedUngrouped.length > 0 || groups.length === 0) && (
        <section>
          {groups.length > 0 && (
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">{tr(locale, "Sans groupe", "Ungrouped")}</span>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {unpinnedUngrouped.map((project) => (
              <ProjectCard key={project.id} project={project} userGroups={groups} canPin={!isSuperAdmin} canGroup={!isSuperAdmin} />
            ))}
            {NewProjectCard}
          </div>
        </section>
      )}

      {/* When all projects are in groups, still show New project */}
      {unpinnedUngrouped.length === 0 && groups.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {NewProjectCard}
        </div>
      )}

      {/* Archived projects */}
      {archivedProjects.length > 0 && (
        <section>
          <button
            type="button"
            onClick={() => setArchivesOpen((v) => !v)}
            className="w-full flex items-center justify-between rounded-xl border border-amber-200/70 dark:border-amber-800/40 bg-white dark:bg-gray-800 px-3 py-2.5 mb-3 text-left cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <svg className="w-3.5 h-3.5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M20 7v10a2 2 0 01-2 2H6a2 2 0 01-2-2V7m16 0l-2-3H6L4 7m16 0H4m5 4h6" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {tr(locale, "Projets archivés", "Archived projects")}
              </span>
              <span className="text-[11px] text-gray-400 dark:text-gray-600">{archivedProjects.length}</span>
            </span>
            <svg className={`w-4 h-4 text-gray-400 transition-transform ${archivesOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M19 9l-7 7-7-7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {archivesOpen && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {archivedProjects.map((project) => (
                <div
                  key={project.id}
                  className="rounded-xl border border-amber-200/70 dark:border-amber-800/40 bg-white dark:bg-gray-800 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-50">{project.name}</h3>
                      <p className="text-[11px] text-gray-400 mt-1">
                        {tr(locale, "Archivé le", "Archived on")}{" "}
                        {project.archivedAt
                          ? new Date(project.archivedAt).toLocaleDateString(locale === "en" ? "en-US" : "fr-FR")
                          : "-"}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      onClick={() =>
                        startTransition(async () => {
                          setRestoreErrors((prev) => ({ ...prev, [project.id]: "" }));
                          try {
                            await restoreProject(project.id);
                            router.refresh();
                          } catch (e) {
                            const raw = e instanceof Error ? e.message : "";
                            const message = raw.includes("FORBIDDEN_RESTORE_PROJECT")
                              ? tr(locale, "Vous n'êtes pas autorisé à restaurer ce projet.", "You are not allowed to restore this project.")
                              : tr(locale, "Impossible de restaurer ce projet.", "Unable to restore this project.");
                            setRestoreErrors((prev) => ({ ...prev, [project.id]: message }));
                          }
                        })
                      }
                      className="flex-1 text-xs px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors cursor-pointer"
                    >
                      {tr(locale, "Restaurer", "Restore")}
                    </button>
                    <button
                      onClick={() =>
                        startTransition(async () => {
                          setRestoreErrors((prev) => ({ ...prev, [project.id]: "" }));
                          try {
                            await deleteProject(project.id);
                          } catch (e) {
                            const raw = e instanceof Error ? e.message : "";
                            const message = raw.includes("FORBIDDEN_DELETE_PERSONAL_PROJECT")
                              ? tr(locale, "Un projet personnel ne peut pas être supprimé.", "Personal projects cannot be deleted.")
                              : tr(locale, "Impossible de supprimer ce projet.", "Unable to delete this project.");
                            setRestoreErrors((prev) => ({ ...prev, [project.id]: message }));
                          }
                        })
                      }
                      className="text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800/40 dark:text-red-400 dark:hover:bg-red-900/20 transition-colors cursor-pointer"
                    >
                      {tr(locale, "Supprimer", "Delete")}
                    </button>
                  </div>
                  {restoreErrors[project.id] && (
                    <p className="mt-2 text-[11px] text-red-500">{restoreErrors[project.id]}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Add group */}
      {!isSuperAdmin && (
        <div className="pt-2">
          {addingGroup ? (
          <div className="flex items-center gap-2">
            <input
              ref={addInputRef}
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreateGroup(); if (e.key === "Escape") setAddingGroup(false); }}
              onBlur={handleCreateGroup}
              placeholder="Nom du groupe…"
              className="text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 outline-none bg-transparent border-b border-indigo-400 px-0.5 placeholder-gray-400"
            />
          </div>
          ) : (
          <button
            onClick={() => { setNewGroupName(""); setAddingGroup(true); }}
            className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors cursor-pointer"
          >
            <span className="w-4 h-4 flex items-center justify-center rounded border border-dashed border-gray-300 dark:border-gray-600 hover:border-indigo-400">+</span>
            Nouveau groupe de projets
          </button>
          )}
        </div>
      )}
    </div>
  );
}
