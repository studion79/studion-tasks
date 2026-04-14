export const dynamic = 'force-dynamic';

import { listProjects, listArchivedProjects, getPendingInvitations, listUserProjectGroups, getMyTasks, getMyDisplaySettings } from "@/lib/actions";
import { auth, signOut } from "@/auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { HomePageClient } from "@/components/home/HomePageClient";
import { HomeTasksModule } from "@/components/home/HomeTasksModule";
import { PendingInvitationsSection } from "@/components/home/PendingInvitationsSection";
import { AdminBackupMenu } from "@/components/home/AdminBackupMenu";
import { AdminPushTestMenu } from "@/components/home/AdminPushTestMenu";
import { prisma } from "@/lib/db";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { RealtimeAutoRefresh } from "@/components/realtime/RealtimeAutoRefresh";

function getGreeting(locale: string): string {
  const hour = new Date().getHours();
  if (locale === "en") {
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  }
  if (hour < 12) return "Bonjour";
  if (hour < 18) return "Bon après-midi";
  return "Bonsoir";
}

export default async function HomePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as {
    id?: string;
    isSuperAdmin?: boolean;
    email?: string | null;
    image?: string | null;
    name?: string | null;
  };
  const isSuperAdmin = Boolean(user.isSuperAdmin);

  const [projects, archivedProjects, pendingInvitations, userGroups, myTasks, myDisplaySettings] =
    await Promise.all([
      listProjects(),
      listArchivedProjects(),
      user.email ? getPendingInvitations(user.email) : Promise.resolve([]),
      listUserProjectGroups(),
      getMyTasks().catch(() => [] as { completedAt: string | null; dueDate: string | null }[]),
      getMyDisplaySettings().catch(() => null),
    ]);

  const dbUser = user.id
    ? await prisma.user.findUnique({
        where: { id: user.id },
        select: { name: true, avatar: true },
      })
    : null;

  const displayName = dbUser?.name ?? session.user.name ?? "";
  const firstName = displayName.split(" ")[0] || displayName;
  const displayAvatar = dbUser?.avatar ?? session.user.image ?? null;
  const locale = myDisplaySettings?.language === "en" ? "en" : "fr";
  const t = (fr: string, en: string) => (locale === "en" ? en : fr);
  const greeting = getGreeting(locale);

  // Quick stats from tasks
  const todayStr = new Date().toISOString().slice(0, 10);
  const typedTasks = myTasks as { completedAt: string | null; dueDate: string | null }[];
  const activeTasks = typedTasks.filter((task) => !task.completedAt);
  const todayCount = activeTasks.filter((task) => task.dueDate?.slice(0, 10) === todayStr).length;
  const overdueCount = activeTasks.filter(
    (task) => task.dueDate && task.dueDate.slice(0, 10) < todayStr
  ).length;

  const todayFormatted = new Date().toLocaleDateString(locale === "en" ? "en-US" : "fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="flex-1 flex overflow-hidden bg-gray-50 dark:bg-gray-950">
      <RealtimeAutoRefresh
        projectIds={[...projects, ...archivedProjects].map((p) => p.id)}
        includeUserScope
        includeAdminScope={isSuperAdmin}
      />

      {/* ── Left sidebar (desktop only) ──────────────────────────────────── */}
      <aside className="hidden lg:flex flex-col w-56 xl:w-60 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex-shrink-0">
        {/* Logo */}
        <div className="h-14 px-5 flex items-center border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <span className="text-sm font-bold text-gray-900 dark:text-gray-50">Task App</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          <Link
            href="/"
            className="flex items-center gap-3 px-3 py-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-medium text-sm"
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {t("Tableau de bord", "Dashboard")}
          </Link>

          <Link
            href="/portfolio"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200 font-medium text-sm transition-colors"
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {t("Portefeuille", "Portfolio")}
          </Link>

          <Link
            href="/templates"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200 font-medium text-sm transition-colors"
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <rect x="3" y="3" width="8" height="8" rx="1" strokeWidth="1.5" />
              <rect x="13" y="3" width="8" height="8" rx="1" strokeWidth="1.5" />
              <rect x="3" y="13" width="8" height="8" rx="1" strokeWidth="1.5" />
              <rect x="13" y="13" width="8" height="8" rx="1" strokeWidth="1.5" />
            </svg>
            {t("Templates", "Templates")}
          </Link>

          <Link
            href="/me"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200 font-medium text-sm transition-colors"
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {t("Mon espace", "My space")}
          </Link>

          <div className="border-t border-gray-100 dark:border-gray-800 pt-3 mt-3">
            <Link
              href="/projects/new"
              className="flex items-center gap-3 px-3 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 font-medium text-sm transition-colors"
            >
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M12 4v16m8-8H4" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              {t("Nouveau projet", "New project")}
            </Link>
          </div>
        </nav>

        {/* User profile at bottom */}
        <div className="px-3 py-3 border-t border-gray-100 dark:border-gray-800">
          <Link
            href="/me"
            className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <div className="w-7 h-7 rounded-full flex-shrink-0 overflow-hidden">
              {displayAvatar ? (
                <img src={displayAvatar} alt={displayName} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold">
                  {displayName.charAt(0).toUpperCase() || "?"}
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-700 dark:text-gray-200 truncate">{displayName}</p>
              <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate">{user.email ?? ""}</p>
            </div>
          </Link>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
            className="mt-0.5"
          >
            <button
              type="submit"
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-gray-400 dark:text-gray-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors cursor-pointer"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {t("Déconnexion", "Sign out")}
            </button>
          </form>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header className="h-14 flex-shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 sm:px-6 flex items-center justify-between gap-4">
          {/* Mobile: logo + app name */}
          <div className="flex items-center gap-2.5 lg:hidden">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <span className="text-sm font-bold text-gray-900 dark:text-gray-50">Task App</span>
          </div>

          {/* Desktop: greeting */}
          <div className="hidden lg:flex items-center gap-2">
            <h1 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
              {greeting}, <span className="text-gray-900 dark:text-gray-50">{firstName}</span>
            </h1>
            {overdueCount > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-600 bg-red-50 dark:bg-red-900/30 dark:text-red-400 rounded-full px-2 py-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
                {overdueCount} {t("en retard", "overdue")}
              </span>
            )}
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-2 ml-auto">
            {isSuperAdmin && (
              <>
                <AdminPushTestMenu />
                <AdminBackupMenu />
              </>
            )}
            <Link
              href="/projects/new"
              className="inline-flex items-center gap-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg px-3 py-1.5 hover:bg-indigo-700 transition-colors"
            >
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M12 4v16m8-8H4" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              <span className="hidden sm:inline">{t("Nouveau projet", "New project")}</span>
            </Link>
            {/* Mobile user avatar */}
            <Link href="/me" className="lg:hidden w-7 h-7 rounded-full flex-shrink-0 overflow-hidden block">
              {displayAvatar ? (
                <img src={displayAvatar} alt={displayName} className="w-full h-full object-cover rounded-full" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-semibold">
                  {displayName.charAt(0).toUpperCase() || "?"}
                </div>
              )}
            </Link>
          </div>
        </header>

        {/* Scrollable content */}
        <main className="flex-1 overflow-y-auto">
          <div className="px-4 sm:px-6 lg:px-8 py-6 pb-24 sm:pb-10 max-w-6xl mx-auto space-y-6">

            {/* Pending invitations */}
            {pendingInvitations.length > 0 && (
              <PendingInvitationsSection invitations={pendingInvitations} userId={session.user.id!} />
            )}

            {/* ── Welcome + Stats row ── */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Welcome card */}
              <div className="bg-gradient-to-br from-indigo-500 via-indigo-600 to-violet-600 rounded-2xl p-5 text-white flex flex-col justify-between min-h-[96px]">
                <p className="text-indigo-200 text-xs font-medium capitalize">{todayFormatted}</p>
                <div>
                  <h2 className="text-lg font-bold leading-tight">{greeting}, {firstName}</h2>
                  <p className="text-indigo-200 text-xs mt-0.5">
                    {activeTasks.length > 0
                      ? t(
                          `${activeTasks.length} tâche${activeTasks.length > 1 ? "s" : ""} active${activeTasks.length > 1 ? "s" : ""}`,
                          `${activeTasks.length} active task${activeTasks.length > 1 ? "s" : ""}`
                        )
                      : t("Aucune tâche active", "No active tasks")}
                  </p>
                </div>
              </div>

              {/* Today stat */}
              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 flex flex-col justify-between hover:border-indigo-200 dark:hover:border-indigo-800 transition-colors">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    {t("Aujourd'hui", "Today")}
                  </p>
                  <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center">
                    <svg className="w-3.5 h-3.5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                </div>
                <div>
                  <p className={`text-3xl font-bold ${todayCount > 0 ? "text-indigo-600 dark:text-indigo-400" : "text-gray-900 dark:text-gray-50"}`}>
                    {todayCount}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                    {t("tâche(s) à faire", "task(s) due")}
                  </p>
                </div>
              </div>

              {/* Overdue stat */}
              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 flex flex-col justify-between hover:border-red-200 dark:hover:border-red-800 transition-colors">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    {t("En retard", "Overdue")}
                  </p>
                  <div className="w-7 h-7 rounded-lg bg-red-50 dark:bg-red-900/30 flex items-center justify-center">
                    <svg className="w-3.5 h-3.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                </div>
                <div>
                  <p className={`text-3xl font-bold ${overdueCount > 0 ? "text-red-500" : "text-gray-900 dark:text-gray-50"}`}>
                    {overdueCount}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                    {t("tâche(s) en retard", "task(s) overdue")}
                  </p>
                </div>
              </div>
            </div>

            {/* ── Tasks module ── */}
            <HomeTasksModule
              tasks={myTasks}
              projects={projects.map((project) => ({
                id: project.id,
                name: project.name,
                isPersonal: Boolean((project as { isPersonal?: boolean }).isPersonal),
                groups: (project.groups ?? []).map((group) => ({
                  id: (group as { id: string }).id,
                  name: (group as { name: string }).name,
                })),
              }))}
              initialDisplayPrefs={
                myDisplaySettings
                  ? {
                      density: myDisplaySettings.density,
                      mondayFirst: myDisplaySettings.mondayFirst,
                      dateFormat: myDisplaySettings.dateFormat,
                      language: myDisplaySettings.language,
                    }
                  : null
              }
            />

            {/* ── Projects section ── */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-50">
                  {t("Mes projets", "My projects")}
                </h2>
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  {projects.length} {t("projet" + (projects.length !== 1 ? "s" : ""), "project" + (projects.length !== 1 ? "s" : ""))}
                </span>
              </div>
              <HomePageClient
                projects={projects}
                archivedProjects={archivedProjects}
                userGroups={userGroups}
                isSuperAdmin={isSuperAdmin}
              />
            </div>

          </div>
        </main>
      </div>

      <MobileBottomNav />
    </div>
  );
}
