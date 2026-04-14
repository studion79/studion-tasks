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
    if (p.isPersonal) { personalProjects.push(p); continue; }
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

  // Empty state
  if (initialProjects.length === 0 && archivedProjects.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-50 mb-1.5">
          {tr(locale, "Aucun projet pour l'instant", "No projects yet")}
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 max-w-xs mx-auto">
          {tr(locale, "Créez votre premier projet pour commencer à organiser vos tâches.", "Create your first project to start organizing your tasks.")}
        </p>
        <Link
          href="/projects/new"
          className="inline-flex items-center gap-2 bg-indigo-600 text-white text-sm font-medium rounded-xl px-5 py-2.5 hover:bg-indigo-700 transition-colors shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d="M12 4v16m8-8H4" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          {tr(locale, "Créer un projet", "Create a project")}
        </Link>
      </div>
    );
  }

  const NewProjectCard = (
    <Link
      href="/projects/new"
      className="flex flex-col items-center justify-center bg-white dark:bg-gray-900 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 p-5 hover:border-indigo-400 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/20 transition-all text-gray-400 dark:text-gray-500 hover:text-indigo-500 group min-h-[130px]"
    >
      <div className="w-9 h-9 rounded-xl border-2 border-current flex items-center justify-center mb-2.5 group-hover:scale-105 transition-transform">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M12 4v16m8-8H4" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </div>
      <span className="text-xs font-semibold">{tr(locale, "Nouveau projet", "New project")}</span>
    </Link>
  );

  // Section header component
  const SectionHeader = ({
    icon,
    label,
    count,
    collapsible,
    isCollapsed,
    onToggle,
    onEdit,
    onDelete,
    isEditing,
    editValue,
    onEditChange,
    onEditBlur,
    onEditKeyDown,
  }: {
    icon?: React.ReactNode;
    label: string;
    count?: number;
    collapsible?: boolean;
    isCollapsed?: boolean;
    onToggle?: () => void;
    onEdit?: () => void;
    onDelete?: () => void;
    isEditing?: boolean;
    editValue?: string;
    onEditChange?: (v: string) => void;
    onEditBlur?: () => void;
    onEditKeyDown?: (e: React.KeyboardEvent) => void;
  }) => (
    <div className="flex items-center gap-2 mb-3 group/sh">
      {collapsible && (
        <button onClick={onToggle} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-pointer flex-shrink-0">
          <svg className={`w-3.5 h-3.5 transition-transform ${isCollapsed ? "-rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d="M19 9l-7 7-7-7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
      {icon && <span className="flex-shrink-0">{icon}</span>}
      {isEditing ? (
        <input
          autoFocus
          value={editValue}
          onChange={(e) => onEditChange?.(e.target.value)}
          onBlur={onEditBlur}
          onKeyDown={onEditKeyDown}
          className="text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 outline-none bg-transparent border-b-2 border-indigo-400 px-0.5"
          style={{ width: `${Math.max((editValue?.length ?? 0) * 7.5 + 16, 80)}px` }}
        />
      ) : (
        <button
          onClick={onEdit}
          className={`text-xs font-semibold uppercase tracking-wider transition-colors ${onEdit ? "text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-100 cursor-pointer" : "text-gray-500 dark:text-gray-400 cursor-default"}`}
        >
          {label}
        </button>
      )}
      {count !== undefined && (
        <span className="text-[11px] text-gray-400 dark:text-gray-600 tabular-nums">{count}</span>
      )}
      {onDelete && (
        <button
          onClick={onDelete}
          className="opacity-0 group-hover/sh:opacity-100 ml-0.5 p-0.5 rounded text-gray-300 hover:text-red-500 cursor-pointer transition-all"
          title={tr(locale, "Supprimer ce groupe", "Delete this group")}
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  );

  return (
    <div className="space-y-8">
      {/* Personal projects */}
      {personalProjects.length > 0 && (
        <section>
          <SectionHeader
            icon={
              <svg className="w-3.5 h-3.5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M12 3l7 4v5c0 5-3.5 7.8-7 9-3.5-1.2-7-4-7-9V7l7-4z" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            }
            label={tr(locale, "Personnel", "Personal")}
            count={personalProjects.length}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {personalProjects.map((project) => (
              <ProjectCard key={project.id} project={project} userGroups={groups} canPin={!isSuperAdmin} canGroup={false} />
            ))}
          </div>
        </section>
      )}

      {/* Pinned projects */}
      {pinnedUngrouped.length > 0 && (
        <section>
          <SectionHeader
            icon={
              <svg className="w-3.5 h-3.5 text-amber-500" fill="currentColor" viewBox="0 0 24 24">
                <path d="M16 4a1 1 0 011 1v1.5l1.5 3H18v4h-5v5a1 1 0 01-2 0v-5H6v-4H6.5L8 6.5V5a1 1 0 011-1h7z" />
              </svg>
            }
            label={tr(locale, "Épinglés", "Pinned")}
            count={pinnedUngrouped.length}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
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
            <SectionHeader
              label={group.name}
              count={groupProjects.length}
              collapsible
              isCollapsed={isCollapsed}
              onToggle={() => toggleCollapse(group.id)}
              isEditing={editingGroupId === group.id}
              editValue={editDraft}
              onEditChange={setEditDraft}
              onEditBlur={() => handleRenameGroup(group.id)}
              onEditKeyDown={(e) => {
                if (e.key === "Enter") handleRenameGroup(group.id);
                if (e.key === "Escape") setEditingGroupId(null);
              }}
              onEdit={() => { setEditDraft(group.name); setEditingGroupId(group.id); }}
              onDelete={() => handleDeleteGroup(group.id)}
            />
            {!isCollapsed && (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {groupProjects.map((project) => (
                  <ProjectCard key={project.id} project={project} userGroups={groups} canPin={!isSuperAdmin} canGroup={!isSuperAdmin} />
                ))}
              </div>
            )}
          </section>
        );
      })}

      {/* Ungrouped (unpinned) */}
      {(unpinnedUngrouped.length > 0 || groups.length === 0) && (
        <section>
          {groups.length > 0 && (
            <SectionHeader label={tr(locale, "Sans groupe", "Ungrouped")} count={unpinnedUngrouped.length} />
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {unpinnedUngrouped.map((project) => (
              <ProjectCard key={project.id} project={project} userGroups={groups} canPin={!isSuperAdmin} canGroup={!isSuperAdmin} />
            ))}
            {NewProjectCard}
          </div>
        </section>
      )}

      {/* When all projects are grouped, still show new project */}
      {unpinnedUngrouped.length === 0 && groups.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {NewProjectCard}
        </div>
      )}

      {/* Archived projects */}
      {archivedProjects.length > 0 && (
        <section>
          <button
            type="button"
            onClick={() => setArchivesOpen((v) => !v)}
            className="w-full flex items-center justify-between rounded-xl border border-amber-200/70 dark:border-amber-800/40 bg-white dark:bg-gray-900 px-4 py-3 mb-3 text-left cursor-pointer hover:bg-amber-50/50 dark:hover:bg-amber-900/10 transition-colors"
          >
            <span className="flex items-center gap-2.5">
              <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M20 7v10a2 2 0 01-2 2H6a2 2 0 01-2-2V7m16 0l-2-3H6L4 7m16 0H4m5 4h6" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">
                {tr(locale, "Projets archivés", "Archived projects")}
              </span>
              <span className="text-[11px] font-medium text-gray-400 dark:text-gray-600 bg-gray-100 dark:bg-gray-800 rounded-full px-1.5 py-0.5 tabular-nums">
                {archivedProjects.length}
              </span>
            </span>
            <svg className={`w-4 h-4 text-gray-400 transition-transform ${archivesOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M19 9l-7 7-7-7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {archivesOpen && (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {archivedProjects.map((project) => (
                <div
                  key={project.id}
                  className="rounded-xl border border-amber-200/70 dark:border-amber-800/40 bg-white dark:bg-gray-900 p-4"
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-50 truncate">{project.name}</h3>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        {tr(locale, "Archivé le", "Archived on")}{" "}
                        {project.archivedAt
                          ? new Date(project.archivedAt).toLocaleDateString(locale === "en" ? "en-US" : "fr-FR")
                          : "—"}
                      </p>
                    </div>
                    <span className="flex-shrink-0 inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                      {tr(locale, "Archivé", "Archived")}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        startTransition(async () => {
                          setRestoreErrors((prev) => ({ ...prev, [project.id]: "" }));
                          try {
                            await restoreProject(project.id);
                            router.refresh();
                          } catch (e) {
                            const raw = e instanceof Error ? e.message : "";
                            setRestoreErrors((prev) => ({
                              ...prev,
                              [project.id]: raw.includes("FORBIDDEN_RESTORE_PROJECT")
                                ? tr(locale, "Vous n'êtes pas autorisé à restaurer ce projet.", "You are not allowed to restore this project.")
                                : tr(locale, "Impossible de restaurer ce projet.", "Unable to restore this project."),
                            }));
                          }
                        })
                      }
                      className="flex-1 text-xs px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors cursor-pointer font-medium"
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
                            setRestoreErrors((prev) => ({
                              ...prev,
                              [project.id]: raw.includes("FORBIDDEN_DELETE_PERSONAL_PROJECT")
                                ? tr(locale, "Un projet personnel ne peut pas être supprimé.", "Personal projects cannot be deleted.")
                                : tr(locale, "Impossible de supprimer ce projet.", "Unable to delete this project."),
                            }));
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
        <div className="pt-1">
          {addingGroup ? (
            <div className="flex items-center gap-2">
              <input
                ref={addInputRef}
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleCreateGroup(); if (e.key === "Escape") setAddingGroup(false); }}
                onBlur={handleCreateGroup}
                placeholder={tr(locale, "Nom du groupe…", "Group name…")}
                className="text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 outline-none bg-transparent border-b-2 border-indigo-400 px-0.5 placeholder-gray-400"
              />
            </div>
          ) : (
            <button
              onClick={() => { setNewGroupName(""); setAddingGroup(true); }}
              className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer group/add"
            >
              <span className="w-4 h-4 flex items-center justify-center rounded border border-dashed border-gray-300 dark:border-gray-600 group-hover/add:border-indigo-400 transition-colors text-xs leading-none">+</span>
              {tr(locale, "Nouveau groupe de projets", "New project group")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
