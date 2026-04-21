"use client";

import { type ReactNode, useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { ProjectCard } from "./ProjectCard";
import {
  createUserProjectGroup,
  renameUserProjectGroup,
  deleteUserProjectGroup,
  moveUserProjectGroup,
  reorderProjectsInHomeGroup,
  updateUserProjectGroupDescription,
  restoreProject,
  deleteProject,
} from "@/lib/actions";
import { trKey } from "@/lib/i18n/client";
import { useClientLocale } from "@/lib/i18n/useClientLocale";
import { pickByLocale } from "@/lib/i18n/pick";

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
  members: { isPinned: boolean; userGroupId: string | null; projectOrder?: number | null }[];
  groups: { _count: { tasks: number }; tasks: TaskLight[] }[];
};

type UserGroup = { id: string; name: string; position: number; description?: string | null };

function ProjectsSection({
  id,
  title,
  count,
  subtitle,
  actions,
  children,
  tone = "default",
}: {
  id?: string;
  title: string;
  count?: number;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  tone?: "default" | "accent" | "archive";
}) {
  const tones = {
    default:
      "border-white/70 bg-white/85 dark:border-white/10 dark:bg-gray-900/75",
    accent:
      "border-indigo-100 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(238,242,255,0.9))] dark:border-indigo-500/20 dark:bg-[linear-gradient(180deg,rgba(17,24,39,0.84),rgba(30,41,59,0.9))]",
    archive:
      "border-amber-200/80 bg-[linear-gradient(180deg,rgba(255,251,235,0.96),rgba(255,255,255,0.92))] dark:border-amber-500/20 dark:bg-[linear-gradient(180deg,rgba(30,41,59,0.9),rgba(17,24,39,0.86))]",
  }[tone];

  return (
    <section
      id={id}
      className={`relative overflow-visible rounded-[22px] sm:rounded-[28px] border shadow-[0_20px_56px_-34px_rgba(15,23,42,0.3)] ring-1 ring-black/5 ${tones} dark:ring-white/10`}
    >
      <div className="flex flex-col gap-3 border-b border-gray-100/80 px-4 py-4 sm:gap-4 sm:px-6 sm:py-5 dark:border-white/10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-gray-950 dark:text-white">{title}</h2>
              {typeof count === "number" && (
                <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                  {count}
                </span>
              )}
            </div>
            {subtitle && <p className="mt-1 text-xs sm:text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      </div>
      <div className="px-4 py-4 sm:px-6 sm:py-5">{children}</div>
    </section>
  );
}

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
  const locale = useClientLocale(pathname);
  const [groups, setGroups] = useState(initialGroups);
  const [, startTransition] = useTransition();
  const [addingGroup, setAddingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [editingGroupDescriptionId, setEditingGroupDescriptionId] = useState<string | null>(null);
  const [groupDescriptionDraft, setGroupDescriptionDraft] = useState("");
  const [confirmDeleteGroupId, setConfirmDeleteGroupId] = useState<string | null>(null);
  const [openGroupActionsMenuId, setOpenGroupActionsMenuId] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [archivesOpen, setArchivesOpen] = useState(false);
  const [restoreErrors, setRestoreErrors] = useState<Record<string, string>>({});
  const [dragProjectId, setDragProjectId] = useState<string | null>(null);
  const [dropProjectId, setDropProjectId] = useState<string | null>(null);
  const addInputRef = useRef<HTMLInputElement>(null);
  const groupActionsMenuRef = useRef<HTMLDivElement | null>(null);
  const sortedGroups = [...groups].sort((a, b) => a.position - b.position);
  const personalGroup = sortedGroups.find((group) =>
    ["personnel", "personal"].includes(group.name.trim().toLowerCase())
  );
  const visibleGroups = personalGroup ? sortedGroups.filter((group) => group.id !== personalGroup.id) : sortedGroups;

  useEffect(() => {
    if (addingGroup) addInputRef.current?.focus();
  }, [addingGroup]);

  useEffect(() => {
    if (!openGroupActionsMenuId) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (groupActionsMenuRef.current && !groupActionsMenuRef.current.contains(target)) {
        setOpenGroupActionsMenuId(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [openGroupActionsMenuId]);

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
    setGroups((prev) => prev.map((group) => (group.id === id ? { ...group, name } : group)));
    startTransition(async () => {
      await renameUserProjectGroup(id, name);
    });
  };

  const handleDeleteGroup = (id: string) => {
    setConfirmDeleteGroupId(null);
    setGroups((prev) => prev.filter((group) => group.id !== id));
    startTransition(async () => {
      await deleteUserProjectGroup(id);
    });
  };

  const handleMoveGroup = (id: string, direction: "up" | "down") => {
    setGroups((prev) => {
      const ordered = [...prev].sort((a, b) => a.position - b.position);
      const index = ordered.findIndex((group) => group.id === id);
      if (index < 0) return prev;
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= ordered.length) return prev;
      const current = ordered[index];
      const target = ordered[targetIndex];
      const swapped = ordered.map((group) => {
        if (group.id === current.id) return { ...group, position: target.position };
        if (group.id === target.id) return { ...group, position: current.position };
        return group;
      });
      return swapped;
    });
    startTransition(async () => {
      await moveUserProjectGroup(id, direction);
    });
  };

  const handleDropProject = (groupId: string, targetProjectId: string) => {
    if (!dragProjectId || dragProjectId === targetProjectId) {
      setDragProjectId(null);
      setDropProjectId(null);
      return;
    }
    const list = projectsByGroup[groupId] ?? [];
    const orderedIds = list.map((project) => project.id);
    const from = orderedIds.indexOf(dragProjectId);
    const to = orderedIds.indexOf(targetProjectId);
    if (from < 0 || to < 0) {
      setDragProjectId(null);
      setDropProjectId(null);
      return;
    }
    orderedIds.splice(from, 1);
    orderedIds.splice(to, 0, dragProjectId);
    setDragProjectId(null);
    setDropProjectId(null);
    startTransition(async () => {
      await reorderProjectsInHomeGroup(groupId, orderedIds);
      router.refresh();
    });
  };

  const handleSaveGroupDescription = (id: string) => {
    const description = groupDescriptionDraft.trim();
    setEditingGroupDescriptionId(null);
    setGroups((prev) =>
      prev.map((group) => (group.id === id ? { ...group, description: description || null } : group))
    );
    startTransition(async () => {
      await updateUserProjectGroupDescription(id, description || null);
    });
  };

  const toggleCollapse = (id: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const projectsByGroup: Record<string, ProjectWithStats[]> = {};
  const ungrouped: ProjectWithStats[] = [];
  const personalProjects: ProjectWithStats[] = [];
  const personalAssignedProjects: ProjectWithStats[] = [];

  for (const project of initialProjects) {
    if (project.isPersonal) {
      personalProjects.push(project);
      continue;
    }
    const groupId = project.members[0]?.userGroupId ?? null;
    if (personalGroup && groupId === personalGroup.id) {
      personalAssignedProjects.push(project);
      continue;
    }
    if (groupId && sortedGroups.find((group) => group.id === groupId)) {
      if (!projectsByGroup[groupId]) projectsByGroup[groupId] = [];
      projectsByGroup[groupId].push(project);
    } else {
      ungrouped.push(project);
    }
  }
  for (const groupId of Object.keys(projectsByGroup)) {
    projectsByGroup[groupId].sort((a, b) => {
      const aOrder = a.members[0]?.projectOrder ?? 0;
      const bOrder = b.members[0]?.projectOrder ?? 0;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return 0;
    });
  }

  const pinnedUngrouped = ungrouped.filter((project) => project.members[0]?.isPinned);
  const unpinnedUngrouped = ungrouped.filter((project) => !project.members[0]?.isPinned);
  const sectionGridClass = "grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3";
  const personalSectionProjects = [...personalProjects, ...personalAssignedProjects];

  if (initialProjects.length === 0 && archivedProjects.length === 0) {
    return (
      <section className="overflow-hidden rounded-[32px] border border-white/70 bg-white/85 px-6 py-12 text-center shadow-[0_30px_80px_-36px_rgba(15,23,42,0.35)] ring-1 ring-black/5 backdrop-blur dark:border-white/10 dark:bg-gray-900/75 dark:ring-white/10 sm:px-10 sm:py-16">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[24px] bg-[linear-gradient(135deg,rgba(99,102,241,0.16),rgba(56,189,248,0.14))] text-indigo-600 dark:text-indigo-300">
          <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d="M19 11H5m14 0l-4-4m4 4l-4 4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h2 className="mt-6 text-2xl font-semibold text-gray-950 dark:text-white">{trKey(locale, "home.noProjectsYet")}</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-gray-500 dark:text-gray-400">
          {trKey(locale, "home.createFirstProject")}
        </p>
        <Link
          href="/projects/new"
          className="mt-8 inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-medium text-white shadow-[0_18px_40px_-24px_rgba(79,70,229,0.95)] transition-all hover:-translate-y-0.5 hover:bg-indigo-700"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d="M12 4v16m8-8H4" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          {trKey(locale, "home.createProject")}
        </Link>
      </section>
    );
  }

  const NewProjectCard = (
    <Link
      href="/projects/new"
      className="group flex min-h-[180px] flex-col items-center justify-center rounded-[26px] border border-dashed border-indigo-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(238,242,255,0.96))] p-6 text-center text-indigo-500 transition-all hover:-translate-y-1 hover:border-indigo-400 hover:shadow-[0_24px_40px_-28px_rgba(79,70,229,0.8)] dark:border-indigo-500/25 dark:bg-[linear-gradient(180deg,rgba(30,41,59,0.78),rgba(17,24,39,0.88))] dark:text-indigo-300"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl border-2 border-current text-xl leading-none transition-transform group-hover:scale-110">
        +
      </span>
      <span className="mt-4 text-base font-semibold">{trKey(locale, "home.newProject")}</span>
      <span className="mt-1 text-xs text-indigo-400 dark:text-indigo-200/70">
        {pickByLocale(locale, "Démarrer un nouvel espace de travail", "Start a new workspace")}
      </span>
    </Link>
  );

  return (
    <section className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mobile-kicker sm:text-[11px] sm:tracking-[0.28em]">
            {pickByLocale(locale, "Projets", "Projects")}
          </p>
          <h2 className="mt-1 text-xl sm:text-2xl font-semibold tracking-tight text-gray-950 dark:text-white">
            {pickByLocale(locale, "Espaces de travail", "Workspaces")}
          </h2>
          <p className="mt-1 text-xs sm:text-sm text-gray-500 dark:text-gray-400">
            {pickByLocale(locale, "Classement par favoris, groupes et archives.", "Organized by pinned projects, groups, and archives.")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!isSuperAdmin && (
            <button
              type="button"
              onClick={() => {
                setNewGroupName("");
                setAddingGroup(true);
              }}
              className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 transition-colors hover:bg-indigo-100 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200 dark:hover:bg-indigo-500/20"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M12 5v14m7-7H5" strokeWidth="1.9" strokeLinecap="round" />
              </svg>
              {pickByLocale(locale, "Nouveau groupe", "New group")}
            </button>
          )}
          <span className="rounded-full border border-white/70 bg-white/80 px-3 py-1.5 text-xs font-medium text-gray-500 shadow-sm ring-1 ring-black/5 dark:border-white/10 dark:bg-gray-900/70 dark:text-gray-300 dark:ring-white/10">
            {initialProjects.length} {pickByLocale(locale, "actifs", "active")}
          </span>
          <span className="hidden rounded-full border border-white/70 bg-white/80 px-3 py-1.5 text-xs font-medium text-gray-500 shadow-sm ring-1 ring-black/5 sm:inline-flex dark:border-white/10 dark:bg-gray-900/70 dark:text-gray-300 dark:ring-white/10">
            {archivedProjects.length} {pickByLocale(locale, "archivés", "archived")}
          </span>
        </div>
      </div>

      {!isSuperAdmin && addingGroup && (
        <ProjectsSection
          title={trKey(locale, "home.newProjectGroup")}
          subtitle={pickByLocale(locale, "Créez un groupe pour organiser vos projets selon votre workflow.", "Create a group to organize projects around your workflow.")}
        >
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              ref={addInputRef}
              value={newGroupName}
              onChange={(event) => setNewGroupName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") handleCreateGroup();
                if (event.key === "Escape") setAddingGroup(false);
              }}
              onBlur={handleCreateGroup}
              placeholder={trKey(locale, "home.groupNamePlaceholder")}
              className="h-12 flex-1 rounded-2xl border border-indigo-200 bg-white px-4 text-sm font-medium text-gray-900 outline-none focus:border-indigo-400 dark:border-indigo-500/20 dark:bg-gray-950/40 dark:text-white"
            />
            <button
              type="button"
              onClick={handleCreateGroup}
              className="inline-flex items-center justify-center rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
            >
              {trKey(locale, "common.add")}
            </button>
          </div>
        </ProjectsSection>
      )}

      {personalSectionProjects.length > 0 && (
        <ProjectsSection
          title={trKey(locale, "home.personalProjectName")}
          count={personalSectionProjects.length}
          subtitle={pickByLocale(locale, "Projet privé et projets affectés à votre espace personnel.", "Private project and projects assigned to your personal space.")}
          tone="accent"
        >
          <div className={sectionGridClass}>
            {personalSectionProjects.map((project) => (
              <ProjectCard key={project.id} project={project} userGroups={groups} canPin={!isSuperAdmin} canGroup={!isSuperAdmin} />
            ))}
          </div>
        </ProjectsSection>
      )}

      {pinnedUngrouped.length > 0 && (
        <ProjectsSection
          title={trKey(locale, "home.pinned")}
          count={pinnedUngrouped.length}
          subtitle={pickByLocale(locale, "Vos projets prioritaires en accès immédiat.", "Your priority projects surfaced first.")}
        >
          <div className={sectionGridClass}>
            {pinnedUngrouped.map((project) => (
              <ProjectCard key={project.id} project={project} userGroups={groups} canPin={!isSuperAdmin} canGroup={!isSuperAdmin} />
            ))}
          </div>
        </ProjectsSection>
      )}

      {visibleGroups.map((group, groupIndex) => {
        const groupProjects = projectsByGroup[group.id] ?? [];
        const isCollapsed = collapsedGroups.has(group.id);

        return (
          <ProjectsSection
            key={group.id}
            title={group.name}
            count={groupProjects.length}
            subtitle={group.description || pickByLocale(locale, "Groupe de projets personnalisable.", "Custom project group.")}
            actions={
              <>
                <Link
                  href={`/projects/new?groupId=${group.id}`}
                  className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 transition-colors hover:bg-indigo-100 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200 dark:hover:bg-indigo-500/20"
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M12 5v14m7-7H5" strokeWidth="1.9" strokeLinecap="round" />
                  </svg>
                  {pickByLocale(locale, "Nouveau projet", "New project")}
                </Link>
                <div className="relative z-30" ref={openGroupActionsMenuId === group.id ? groupActionsMenuRef : null}>
                  <button
                    type="button"
                    onClick={() => {
                      setOpenGroupActionsMenuId((prev) => (prev === group.id ? null : group.id));
                      if (confirmDeleteGroupId !== group.id) setConfirmDeleteGroupId(null);
                    }}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition-colors hover:border-indigo-200 hover:text-indigo-600 dark:border-white/10 dark:bg-gray-950/40 dark:text-gray-300 dark:hover:border-indigo-500/30 dark:hover:text-indigo-300"
                    title={pickByLocale(locale, "Actions du groupe", "Group actions")}
                    aria-label={pickByLocale(locale, "Actions du groupe", "Group actions")}
                  >
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                      <circle cx="6" cy="12" r="1.8" />
                      <circle cx="12" cy="12" r="1.8" />
                      <circle cx="18" cy="12" r="1.8" />
                    </svg>
                  </button>
                  {openGroupActionsMenuId === group.id && (
                    <div className="absolute right-0 top-10 z-[70] w-[min(12.5rem,calc(100vw-1rem))] rounded-2xl border border-gray-200 bg-white/98 p-1.5 shadow-[0_18px_32px_-18px_rgba(15,23,42,0.35)] ring-1 ring-black/5 dark:border-white/10 dark:bg-gray-950/96 dark:ring-white/10">
                      <button
                        type="button"
                        onClick={() => {
                          toggleCollapse(group.id);
                          setOpenGroupActionsMenuId(null);
                        }}
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-indigo-600 dark:text-gray-300 dark:hover:bg-gray-900 dark:hover:text-indigo-300"
                      >
                        <svg className={`h-3.5 w-3.5 transition-transform ${isCollapsed ? "-rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path d="M19 9l-7 7-7-7" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        {isCollapsed ? pickByLocale(locale, "Afficher", "Show") : pickByLocale(locale, "Réduire", "Collapse")}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditDraft(group.name);
                          setEditingGroupId(group.id);
                          setOpenGroupActionsMenuId(null);
                        }}
                        className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-indigo-600 dark:text-gray-300 dark:hover:bg-gray-900 dark:hover:text-indigo-300"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                        {pickByLocale(locale, "Renommer", "Rename")}
                      </button>
                      <button
                        type="button"
                        disabled={groupIndex === 0}
                        onClick={() => {
                          handleMoveGroup(group.id, "up");
                          setOpenGroupActionsMenuId(null);
                        }}
                        className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-300 dark:hover:bg-gray-900 dark:hover:text-indigo-300"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path d="M7 14l5-5 5 5" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        {pickByLocale(locale, "Monter", "Move up")}
                      </button>
                      <button
                        type="button"
                        disabled={groupIndex === visibleGroups.length - 1}
                        onClick={() => {
                          handleMoveGroup(group.id, "down");
                          setOpenGroupActionsMenuId(null);
                        }}
                        className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-300 dark:hover:bg-gray-900 dark:hover:text-indigo-300"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path d="M7 10l5 5 5-5" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        {pickByLocale(locale, "Descendre", "Move down")}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setGroupDescriptionDraft(group.description ?? "");
                          setEditingGroupDescriptionId(group.id);
                          setOpenGroupActionsMenuId(null);
                        }}
                        className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-indigo-600 dark:text-gray-300 dark:hover:bg-gray-900 dark:hover:text-indigo-300"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path d="M4 7h16M4 12h10M4 17h7" strokeWidth="1.6" strokeLinecap="round" />
                        </svg>
                        {pickByLocale(locale, "Description", "Description")}
                      </button>
                      {confirmDeleteGroupId === group.id ? (
                        <div className="mt-1 space-y-1">
                          <button
                            type="button"
                            onClick={() => {
                              handleDeleteGroup(group.id);
                              setOpenGroupActionsMenuId(null);
                            }}
                            className="flex w-full items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-left text-xs font-medium text-red-600 transition-colors hover:bg-red-100 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path d="M18 6L6 18M6 6l12 12" strokeWidth="2" strokeLinecap="round" />
                            </svg>
                            {pickByLocale(locale, "Confirmer", "Confirm")}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteGroupId(null)}
                            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-900 dark:hover:text-gray-200"
                          >
                            {pickByLocale(locale, "Annuler", "Cancel")}
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteGroupId(group.id)}
                          className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-red-600 dark:text-gray-400 dark:hover:bg-gray-900 dark:hover:text-red-300"
                          title={trKey(locale, "home.deleteGroup")}
                        >
                          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path d="M18 6L6 18M6 6l12 12" strokeWidth="2" strokeLinecap="round" />
                          </svg>
                          {pickByLocale(locale, "Supprimer", "Delete")}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </>
            }
          >
            {editingGroupId === group.id && (
              <div className="mb-4 rounded-2xl border border-indigo-100 bg-indigo-50/80 p-3 dark:border-indigo-500/20 dark:bg-indigo-500/10">
                <input
                  autoFocus
                  value={editDraft}
                  onChange={(event) => setEditDraft(event.target.value)}
                  onBlur={() => handleRenameGroup(group.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") handleRenameGroup(group.id);
                    if (event.key === "Escape") setEditingGroupId(null);
                  }}
                  className="w-full rounded-xl border border-indigo-200 bg-white px-3 py-2 text-sm font-medium text-gray-900 outline-none focus:border-indigo-400 dark:border-indigo-500/20 dark:bg-gray-950/40 dark:text-white"
                />
              </div>
            )}
            {editingGroupDescriptionId === group.id && (
              <div className="mb-4 rounded-2xl border border-indigo-100 bg-indigo-50/80 p-3 dark:border-indigo-500/20 dark:bg-indigo-500/10">
                <textarea
                  autoFocus
                  value={groupDescriptionDraft}
                  onChange={(event) => setGroupDescriptionDraft(event.target.value)}
                  onBlur={() => handleSaveGroupDescription(group.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      handleSaveGroupDescription(group.id);
                    }
                    if (event.key === "Escape") setEditingGroupDescriptionId(null);
                  }}
                  placeholder={pickByLocale(locale, "Description du groupe", "Group description")}
                  className="min-h-[80px] w-full rounded-xl border border-indigo-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-indigo-400 dark:border-indigo-500/20 dark:bg-gray-950/40 dark:text-white"
                />
              </div>
            )}

            {!isCollapsed && (
              <>
                {groupProjects.length > 0 ? (
                  <div className={sectionGridClass}>
                    {groupProjects.map((project) => (
                      <div
                        key={project.id}
                        draggable
                        onDragStart={() => {
                          setDragProjectId(project.id);
                          setDropProjectId(project.id);
                        }}
                        onDragOver={(event) => {
                          event.preventDefault();
                          if (dropProjectId !== project.id) setDropProjectId(project.id);
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          handleDropProject(group.id, project.id);
                        }}
                        onDragEnd={() => {
                          setDragProjectId(null);
                          setDropProjectId(null);
                        }}
                        className={`relative rounded-2xl transition-all ${
                          dropProjectId === project.id && dragProjectId !== project.id
                            ? "ring-2 ring-indigo-300 dark:ring-indigo-500/40"
                            : ""
                        } cursor-grab hover:ring-1 hover:ring-indigo-200 dark:hover:ring-indigo-500/30`}
                        title={pickByLocale(locale, "Glisser-déposer pour réorganiser", "Drag and drop to reorder")}
                      >
                        <ProjectCard project={project} userGroups={groups} canPin={!isSuperAdmin} canGroup={!isSuperAdmin} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/80 px-4 py-8 text-center dark:border-white/10 dark:bg-gray-950/25">
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-300">
                      {pickByLocale(locale, "Aucun projet dans ce groupe", "No project in this group")}
                    </p>
                  </div>
                )}
              </>
            )}
          </ProjectsSection>
        );
      })}

      {(unpinnedUngrouped.length > 0 || groups.length === 0) && (
        <ProjectsSection
          title={trKey(locale, "home.ungrouped")}
          count={unpinnedUngrouped.length}
          subtitle={pickByLocale(locale, "Les projets encore hors regroupement apparaissent ici.", "Projects not yet assigned to a group live here.")}
        >
          <div className={sectionGridClass}>
            {unpinnedUngrouped.map((project) => (
              <ProjectCard key={project.id} project={project} userGroups={groups} canPin={!isSuperAdmin} canGroup={!isSuperAdmin} />
            ))}
            {NewProjectCard}
          </div>
        </ProjectsSection>
      )}

      {unpinnedUngrouped.length === 0 && groups.length > 0 && (
        <ProjectsSection
          title={trKey(locale, "home.newProject")}
          subtitle={pickByLocale(locale, "Ajoutez rapidement un nouveau projet à votre organisation actuelle.", "Add a new project to your current organization.")}
        >
          <div className="grid grid-cols-1 gap-4 sm:max-w-sm">{NewProjectCard}</div>
        </ProjectsSection>
      )}

      {archivedProjects.length > 0 && (
        <ProjectsSection
          id="home-archives"
          title={trKey(locale, "home.archivedProjects")}
          count={archivedProjects.length}
          subtitle={pickByLocale(locale, "Restaurez ou supprimez définitivement les projets archivés.", "Restore or permanently delete archived projects.")}
          tone="archive"
          actions={
            <button
              type="button"
              onClick={() => setArchivesOpen((value) => !value)}
              className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white px-3 py-1.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-50 dark:border-amber-500/20 dark:bg-gray-950/35 dark:text-amber-200 dark:hover:bg-amber-500/10"
            >
              <svg className={`h-3.5 w-3.5 transition-transform ${archivesOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M19 9l-7 7-7-7" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {archivesOpen ? pickByLocale(locale, "Masquer", "Hide") : pickByLocale(locale, "Afficher", "Show")}
            </button>
          }
        >
          {archivesOpen ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {archivedProjects.map((project) => (
                <div
                  key={project.id}
                  className="rounded-[24px] border border-amber-200/80 bg-white/90 p-5 shadow-sm dark:border-amber-500/20 dark:bg-gray-950/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold text-gray-950 dark:text-white">{project.name}</h3>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {trKey(locale, "home.archivedOn")} {project.archivedAt
                          ? new Date(project.archivedAt).toLocaleDateString(pickByLocale(locale, "fr-FR", "en-US"))
                          : "-"}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-amber-100/80 p-2 text-amber-700 dark:bg-amber-500/10 dark:text-amber-200">
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path d="M20 7v10a2 2 0 01-2 2H6a2 2 0 01-2-2V7m16 0l-2-3H6L4 7m16 0H4m5 4h6" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                  </div>

                  <div className="mt-5 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        startTransition(async () => {
                          setRestoreErrors((prev) => ({ ...prev, [project.id]: "" }));
                          try {
                            await restoreProject(project.id);
                            router.refresh();
                          } catch (error) {
                            const raw = error instanceof Error ? error.message : "";
                            const message = raw.includes("FORBIDDEN_RESTORE_PROJECT")
                              ? trKey(locale, "home.forbiddenRestoreProject")
                              : trKey(locale, "home.restoreProjectFailed");
                            setRestoreErrors((prev) => ({ ...prev, [project.id]: message }));
                          }
                        })
                      }
                      className="flex-1 rounded-2xl bg-indigo-600 px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
                    >
                      {trKey(locale, "home.restore")}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        startTransition(async () => {
                          setRestoreErrors((prev) => ({ ...prev, [project.id]: "" }));
                          try {
                            await deleteProject(project.id);
                          } catch (error) {
                            const raw = error instanceof Error ? error.message : "";
                            const message = raw.includes("FORBIDDEN_DELETE_PERSONAL_PROJECT")
                              ? trKey(locale, "home.personalCannotDelete")
                              : trKey(locale, "home.deleteProjectFailed");
                            setRestoreErrors((prev) => ({ ...prev, [project.id]: message }));
                          }
                        })
                      }
                      className="rounded-2xl border border-red-200 px-3 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-500/20 dark:text-red-300 dark:hover:bg-red-500/10"
                    >
                      {trKey(locale, "common.delete")}
                    </button>
                  </div>

                  {restoreErrors[project.id] && (
                    <p className="mt-3 text-xs text-red-500">{restoreErrors[project.id]}</p>
                  )}
                </div>
              ))}
            </div>
          ) : null}
        </ProjectsSection>
      )}

      {!isSuperAdmin && !addingGroup && <div className="h-1" />}
    </section>
  );
}
