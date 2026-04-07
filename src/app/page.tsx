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

export default async function HomePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as { id?: string; isSuperAdmin?: boolean; email?: string | null; image?: string | null; name?: string | null };
  const isSuperAdmin = Boolean(user.isSuperAdmin);

  const [projects, archivedProjects, pendingInvitations, userGroups, myTasks, myDisplaySettings] = await Promise.all([
    listProjects(),
    listArchivedProjects(),
    user.email ? getPendingInvitations(user.email) : Promise.resolve([]),
    listUserProjectGroups(),
    getMyTasks().catch(() => []),
    getMyDisplaySettings().catch(() => null),
  ]);
  const dbUser = user.id
    ? await prisma.user.findUnique({
        where: { id: user.id },
        select: { name: true, avatar: true },
      })
    : null;
  const displayName = dbUser?.name ?? session.user.name ?? "";
  const displayAvatar = dbUser?.avatar ?? session.user.image ?? null;
  const locale = myDisplaySettings?.language === "en" ? "en" : "fr";
  const t = (fr: string, en: string) => (locale === "en" ? en : fr);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-3 sm:px-6 py-2 sm:h-14 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <h1 className="text-base font-semibold text-gray-900 dark:text-gray-50 pl-1">{t("Mon dashboard", "My dashboard")}</h1>
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 sm:gap-3 pb-0.5 w-full sm:w-auto overflow-visible">
          <Link
            href="/me"
            className="inline-flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            title={t("Mon espace", "My space")}
          >
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="hidden sm:inline">{t("Mon espace", "My space")}</span>
          </Link>
          <Link
            href="/portfolio"
            className="hidden md:inline-flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            title={t("Portefeuille", "Portfolio")}
          >
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="hidden sm:inline">{t("Portefeuille", "Portfolio")}</span>
          </Link>
          <Link
            href="/templates"
            className="hidden md:inline-flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            title={t("Templates", "Templates")}
          >
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <rect x="3" y="3" width="8" height="8" rx="1" strokeWidth="1.5" />
              <rect x="13" y="3" width="8" height="8" rx="1" strokeWidth="1.5" />
              <rect x="3" y="13" width="8" height="8" rx="1" strokeWidth="1.5" />
              <rect x="13" y="13" width="8" height="8" rx="1" strokeWidth="1.5" />
            </svg>
            <span className="hidden sm:inline">{t("Templates", "Templates")}</span>
          </Link>
          <Link
            href="/projects/new"
            className="inline-flex items-center gap-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg px-2.5 py-1.5 hover:bg-indigo-700 transition-colors"
          >
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M12 4v16m8-8H4" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span className="hidden sm:inline">{t("Nouveau projet", "New project")}</span>
          </Link>
          {isSuperAdmin && (
            <>
              <AdminPushTestMenu />
              <AdminBackupMenu />
            </>
          )}
          <div className="flex items-center gap-2 pl-2 sm:pl-3 border-l border-gray-200 dark:border-gray-700 ml-auto sm:ml-0">
            <Link href="/me" className="w-7 h-7 rounded-full flex-shrink-0 overflow-hidden block">
              {displayAvatar ? (
                <img src={displayAvatar} alt={displayName} className="w-full h-full object-cover rounded-full" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-semibold">
                  {displayName.charAt(0).toUpperCase() || "?"}
                </div>
              )}
            </Link>
            <span className="hidden sm:block text-sm text-gray-700 dark:text-gray-200 max-w-[120px] truncate">{displayName}</span>
            <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
              <button type="submit" className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors cursor-pointer">
                <span className="hidden sm:inline">{t("Déconnexion", "Sign out")}</span>
                <svg className="sm:hidden w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="px-4 sm:px-6 py-6 sm:py-8 pb-24 sm:pb-8 max-w-7xl mx-auto">
        <RealtimeAutoRefresh
          projectIds={[...projects, ...archivedProjects].map((project) => project.id)}
          includeUserScope
          includeAdminScope={isSuperAdmin}
        />
        {/* Pending invitations */}
        {pendingInvitations.length > 0 && (
          <div className="mb-6">
            <PendingInvitationsSection invitations={pendingInvitations} userId={session.user.id!} />
          </div>
        )}

        <div className="space-y-6">
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
          <HomePageClient
            projects={projects}
            archivedProjects={archivedProjects}
            userGroups={userGroups}
            isSuperAdmin={isSuperAdmin}
          />
        </div>
      </main>
      <MobileBottomNav />
    </div>
  );
}
