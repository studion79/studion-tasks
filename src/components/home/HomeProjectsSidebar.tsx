"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { pickByLocale } from "@/lib/i18n/pick";

type SidebarProject = {
  id: string;
  name: string;
  isPersonal?: boolean;
  members: { isPinned: boolean; userGroupId: string | null; projectOrder?: number | null }[];
};

type SidebarGroup = { id: string; name: string; position?: number | null };

function SidebarProjectLink({
  project,
  locale,
}: {
  project: SidebarProject;
  locale: "fr" | "en";
}) {
  return (
    <Link
      href={`/projects/${project.id}`}
      className="group flex items-center gap-3 rounded-2xl border border-transparent bg-white/60 px-3 py-2 text-sm text-gray-700 transition-all hover:-translate-y-0.5 hover:border-indigo-200 hover:bg-white hover:shadow-sm dark:bg-gray-950/20 dark:text-gray-200 dark:hover:border-indigo-500/30 dark:hover:bg-gray-950/50"
    >
      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-500/20">
        {project.isPersonal ? (
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <span className="text-xs font-semibold">{project.name.charAt(0).toUpperCase()}</span>
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-gray-900 transition-colors group-hover:text-indigo-700 dark:text-white dark:group-hover:text-indigo-300">
          {project.isPersonal ? pickByLocale(locale, "Personnel", "Personal") : project.name}
        </p>
        <p className="truncate text-[11px] text-gray-400 dark:text-gray-500">
          {project.isPersonal
            ? pickByLocale(locale, "Espace privé", "Private space")
            : pickByLocale(locale, "Ouvrir le projet", "Open project")}
        </p>
      </div>
      <svg className="h-3.5 w-3.5 flex-shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-indigo-400 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path d="M9 5l7 7-7 7" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  );
}

function SidebarSection({
  title,
  items,
  locale,
}: {
  title: string;
  items: SidebarProject[];
  locale: "fr" | "en";
}) {
  if (items.length === 0) return null;
  const orderedItems = [...items].sort((a, b) => {
    const ao = a.members[0]?.projectOrder;
    const bo = b.members[0]?.projectOrder;
    if (typeof ao === "number" && typeof bo === "number" && ao !== bo) return ao - bo;
    return 0;
  });

  return (
    <section className="space-y-2.5">
      <div className="flex items-center justify-between gap-2 px-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-gray-400 dark:text-gray-500">
          {title}
        </p>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
          {items.length}
        </span>
      </div>
      <div className="space-y-2">
        {orderedItems.map((project) => (
          <SidebarProjectLink key={project.id} project={project} locale={locale} />
        ))}
      </div>
    </section>
  );
}

function SidebarPanel({
  projects,
  groups,
  archivedCount,
  locale,
  query,
  setQuery,
}: {
  projects: SidebarProject[];
  groups: SidebarGroup[];
  archivedCount: number;
  locale: "fr" | "en";
  query: string;
  setQuery: (value: string) => void;
}) {
  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () => projects.filter((project) => project.name.toLowerCase().includes(q)),
    [projects, q]
  );

  const byGroup = new Map<string, SidebarProject[]>();
  const personalOwned: SidebarProject[] = [];
  const personalAssigned: SidebarProject[] = [];
  const ungrouped: SidebarProject[] = [];
  const sortedGroups = [...groups].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const personalGroup = sortedGroups.find((group) => ["personnel", "personal"].includes(group.name.trim().toLowerCase()));
  const visibleGroups = personalGroup
    ? sortedGroups.filter((group) => group.id !== personalGroup.id)
    : sortedGroups;

  for (const project of filtered) {
    if (project.isPersonal) {
      personalOwned.push(project);
      continue;
    }

    const member = project.members[0];
    const groupId = member?.userGroupId ?? null;
    if (personalGroup && groupId === personalGroup.id) {
      personalAssigned.push(project);
      continue;
    }
    if (groupId && groups.some((group) => group.id === groupId)) {
      const current = byGroup.get(groupId) ?? [];
      current.push(project);
      byGroup.set(groupId, current);
    } else {
      ungrouped.push(project);
    }
  }

  const personal = [...personalOwned, ...personalAssigned];
  const visibleProjectCount = filtered.length;
  const groupedCount = visibleGroups.reduce((count, group) => count + (byGroup.get(group.id)?.length ?? 0), 0);

  return (
    <div className="mobile-surface overflow-hidden rounded-[24px] sm:rounded-[28px] grid max-h-[58dvh] grid-rows-[auto_minmax(0,1fr)_auto] lg:max-h-[calc(100dvh-7.5rem)]">
      <div className="border-b border-gray-100/80 bg-[linear-gradient(135deg,rgba(99,102,241,0.10),rgba(255,255,255,0.8))] px-4 py-4 dark:border-white/10 dark:bg-[linear-gradient(135deg,rgba(99,102,241,0.16),rgba(17,24,39,0.55))]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-indigo-600 dark:text-indigo-300">
              {pickByLocale(locale, "Navigation", "Navigation")}
            </p>
            <h2 className="mt-1 text-lg font-semibold text-gray-950 dark:text-white">
              {pickByLocale(locale, "Projets", "Projects")}
            </h2>
          </div>
          <Link
            href="/projects/new"
            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-[0_18px_36px_-22px_rgba(79,70,229,0.95)] transition-all hover:-translate-y-0.5 hover:bg-indigo-700"
            title={pickByLocale(locale, "Nouveau projet", "New project")}
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M12 4v16m8-8H4" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </Link>
        </div>

        <div className="mt-4 hidden grid-cols-2 gap-2 sm:grid sm:grid-cols-3">
          <div className="rounded-2xl border border-white/80 bg-white/85 px-3 py-2 dark:border-white/10 dark:bg-gray-950/35">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-400 dark:text-gray-500">
              {pickByLocale(locale, "Visibles", "Visible")}
            </p>
            <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{visibleProjectCount}</p>
          </div>
          <div className="rounded-2xl border border-white/80 bg-white/85 px-3 py-2 dark:border-white/10 dark:bg-gray-950/35">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-400 dark:text-gray-500">
              {pickByLocale(locale, "Personnel", "Personal")}
            </p>
            <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{personal.length}</p>
          </div>
          <div className="rounded-2xl border border-white/80 bg-white/85 px-3 py-2 dark:border-white/10 dark:bg-gray-950/35 sm:col-auto col-span-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-400 dark:text-gray-500">
              {pickByLocale(locale, "Groupés", "Grouped")}
            </p>
            <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{groupedCount}</p>
          </div>
        </div>

        <div className="relative mt-4">
          <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={pickByLocale(locale, "Rechercher…", "Search…")}
            className="h-11 w-full rounded-2xl border border-white/80 bg-white/90 pl-10 pr-4 text-sm text-gray-900 outline-none ring-1 ring-black/5 transition-colors placeholder:text-gray-400 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 dark:border-white/10 dark:bg-gray-950/40 dark:text-white dark:ring-white/10 dark:placeholder:text-gray-500 dark:focus:border-indigo-500 dark:focus:ring-indigo-500/20"
          />
        </div>
      </div>

      <div className="min-h-0 overflow-y-auto space-y-5 px-4 py-4">
        <SidebarSection title={pickByLocale(locale, "Personnel", "Personal")} items={personal} locale={locale} />
        {visibleGroups.map((group) => (
          <SidebarSection key={group.id} title={group.name} items={byGroup.get(group.id) ?? []} locale={locale} />
        ))}
        <SidebarSection title={pickByLocale(locale, "Sans groupe", "Ungrouped")} items={ungrouped} locale={locale} />

        {filtered.length === 0 && (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/80 px-4 py-6 text-center dark:border-white/10 dark:bg-gray-950/25">
            <p className="text-sm font-medium text-gray-500 dark:text-gray-300">
              {pickByLocale(locale, "Aucun projet trouvé", "No project found")}
            </p>
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              {pickByLocale(locale, "Essayez une autre recherche.", "Try another search.")}
            </p>
          </div>
        )}
      </div>

      <div className="border-t border-gray-100/80 px-4 py-3 dark:border-white/10">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
          <Link
            href="/projects/new"
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-medium text-white shadow-[0_18px_36px_-24px_rgba(79,70,229,0.95)] transition-all hover:-translate-y-0.5 hover:bg-indigo-700"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M12 4v16m8-8H4" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <span>{pickByLocale(locale, "Nouveau projet", "New project")}</span>
          </Link>
          <a
            href="#home-archives"
            className="hidden items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-600 transition-colors hover:border-amber-200 hover:text-amber-700 sm:inline-flex dark:border-white/10 dark:bg-gray-950/30 dark:text-gray-300 dark:hover:border-amber-500/30 dark:hover:text-amber-200"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                d="M20 7v10a2 2 0 01-2 2H6a2 2 0 01-2-2V7m16 0l-2-3H6L4 7m16 0H4m5 4h6"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>{pickByLocale(locale, `Archives (${archivedCount})`, `Archives (${archivedCount})`)}</span>
          </a>
        </div>
      </div>
    </div>
  );
}

export function HomeProjectsSidebar({
  projects,
  groups,
  archivedCount,
  locale,
}: {
  projects: SidebarProject[];
  groups: SidebarGroup[];
  archivedCount: number;
  locale: "fr" | "en";
}) {
  const [query, setQuery] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="space-y-3">
      <div className="lg:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen((prev) => !prev)}
          className="mobile-surface-soft flex w-full items-center justify-between rounded-[20px] px-4 py-3 text-left"
        >
          <div>
            <p className="mobile-kicker">
              {pickByLocale(locale, "Projets", "Projects")}
            </p>
            <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
              {pickByLocale(locale, "Accès rapide aux espaces", "Quick workspace access")}
            </p>
          </div>
          <svg className={`h-4 w-4 text-gray-400 transition-transform ${mobileOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d="M19 9l-7 7-7-7" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {mobileOpen && (
          <div className="mt-3">
            <SidebarPanel
              projects={projects}
              groups={groups}
              archivedCount={archivedCount}
              locale={locale}
              query={query}
              setQuery={setQuery}
            />
          </div>
        )}
      </div>

      <div className="hidden lg:block">
        <SidebarPanel
          projects={projects}
          groups={groups}
          archivedCount={archivedCount}
          locale={locale}
          query={query}
          setQuery={setQuery}
        />
      </div>
    </div>
  );
}
