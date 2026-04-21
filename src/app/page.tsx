export const dynamic = 'force-dynamic';

import {
  listProjects,
  listArchivedProjects,
  getPendingInvitations,
  listUserProjectGroups,
  getMyTasks,
  getMyDisplaySettings,
} from "@/lib/actions";
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
import { tKey } from "@/lib/i18n/messages";
import { HomeProjectsSidebar } from "@/components/home/HomeProjectsSidebar";
import { pickByLocale } from "@/lib/i18n/pick";

function formatDashboardDate(locale: "fr" | "en") {
  const localeCodeMap: Record<"fr" | "en", string> = {
    fr: "fr-FR",
    en: "en-US",
  };
  const localeCode = localeCodeMap[locale];
  return new Intl.DateTimeFormat(localeCode, {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
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
  const todayLabel = formatDashboardDate(locale);
  const topLinks = [
    {
      href: "/me",
      label: tKey(locale, "nav.mySpace"),
      icon: (
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ),
    },
    {
      href: "/portfolio",
      label: tKey(locale, "nav.portfolio"),
      hideOnSmall: true,
      icon: (
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ),
    },
    {
      href: "/templates",
      label: tKey(locale, "nav.templates"),
      hideOnSmall: true,
      icon: (
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <rect x="3" y="3" width="8" height="8" rx="1" strokeWidth="1.5" />
          <rect x="13" y="3" width="8" height="8" rx="1" strokeWidth="1.5" />
          <rect x="3" y="13" width="8" height="8" rx="1" strokeWidth="1.5" />
          <rect x="13" y="13" width="8" height="8" rx="1" strokeWidth="1.5" />
        </svg>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] sm:bg-[radial-gradient(circle_at_top_left,_rgba(99,102,241,0.12),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(14,165,233,0.10),_transparent_24%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] dark:bg-[linear-gradient(180deg,_#111827_0%,_#0f172a_100%)] sm:dark:bg-[radial-gradient(circle_at_top_left,_rgba(99,102,241,0.18),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(14,165,233,0.14),_transparent_22%),linear-gradient(180deg,_#111827_0%,_#0f172a_100%)]">
      <header className="sticky top-0 z-40 border-b border-white/60 bg-white/80 backdrop-blur-xl dark:border-white/10 dark:bg-gray-950/70">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-3 px-3 py-3 sm:gap-4 sm:px-6 lg:px-8 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <Link
              href="/me"
              className="flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/70 bg-white shadow-sm ring-1 ring-black/5 dark:border-white/10 dark:bg-gray-900 dark:ring-white/10"
            >
              {displayAvatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={displayAvatar} alt={displayName} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-indigo-600 text-sm font-semibold text-white">
                  {displayName.charAt(0).toUpperCase() || "?"}
                </div>
              )}
            </Link>
            <div className="min-w-0">
              <p className="mobile-kicker sm:text-[11px] sm:tracking-[0.28em]">
                {tKey(locale, "nav.myDashboard")}
              </p>
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                <h1 className="truncate text-base font-semibold text-gray-950 dark:text-white sm:text-xl">
                  {displayName || tKey(locale, "nav.myDashboard")}
                </h1>
                <span className="hidden h-1 w-1 rounded-full bg-gray-300 sm:block dark:bg-gray-600" />
                <p className="text-xs text-gray-500 dark:text-gray-400 sm:text-sm">{todayLabel}</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 xl:items-end">
            <div className="flex flex-wrap items-center gap-2 xl:justify-end">
              {topLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`inline-flex items-center gap-2 rounded-2xl border border-white/70 bg-white px-3.5 py-2 text-sm font-medium text-gray-600 shadow-sm ring-1 ring-black/5 transition-all hover:-translate-y-0.5 hover:text-indigo-600 dark:border-white/10 dark:bg-gray-900 dark:text-gray-200 dark:ring-white/10 dark:hover:text-indigo-300 ${
                    link.hideOnSmall ? "hidden md:inline-flex" : "inline-flex"
                  }`}
                  title={link.label}
                >
                  {link.icon}
                  <span className="hidden sm:inline">{link.label}</span>
                </Link>
              ))}

              <Link
                href="/projects/new"
                className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-[0_18px_40px_-20px_rgba(79,70,229,0.9)] transition-all hover:-translate-y-0.5 hover:bg-indigo-700"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M12 4v16m8-8H4" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
                <span className="hidden sm:inline">{tKey(locale, "nav.newProject")}</span>
              </Link>

              {isSuperAdmin && (
                <>
                  <AdminPushTestMenu />
                  <AdminBackupMenu />
                </>
              )}

              <form
                className="sm:hidden ml-auto shrink-0"
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/login" });
                }}
              >
                <button
                  type="submit"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-gray-950 text-white shadow-sm ring-1 ring-black/5 transition-colors hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:ring-white/10 dark:hover:bg-gray-200"
                  title={tKey(locale, "nav.signOut")}
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </form>
            </div>

            <div className="hidden sm:flex flex-wrap items-center gap-2 xl:justify-end">
              <div className="hidden sm:inline-flex items-center gap-2 rounded-full border border-white/70 bg-white px-2.5 py-1.5 text-xs text-gray-500 shadow-sm ring-1 ring-black/5 dark:border-white/10 dark:bg-gray-900 dark:text-gray-300 dark:ring-white/10">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span>{pickByLocale(locale, "Synchronisation active", "Sync live")}</span>
              </div>
              {isSuperAdmin && (
                <div className="hidden sm:inline-flex items-center gap-2 rounded-full border border-amber-200/80 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  <span>{pickByLocale(locale, "Superadmin", "Superadmin")}</span>
                </div>
              )}
              <div className="flex items-center gap-2 rounded-full border border-white/70 bg-white p-1.5 pl-2.5 shadow-sm ring-1 ring-black/5 dark:border-white/10 dark:bg-gray-900 dark:ring-white/10">
                <span className="hidden max-w-[140px] truncate text-sm text-gray-700 sm:inline dark:text-gray-200">{displayName}</span>
                <form
                  action={async () => {
                    "use server";
                    await signOut({ redirectTo: "/login" });
                  }}
                >
                  <button
                    type="submit"
                    className="inline-flex h-9 items-center gap-2 rounded-full bg-gray-950 px-3 text-xs font-medium text-white transition-colors hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
                  >
                    <span className="hidden sm:inline">{tKey(locale, "nav.signOut")}</span>
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="mobile-safe-nav-pad mx-auto max-w-[1600px] overflow-x-clip px-3 py-5 sm:px-6 sm:py-8 sm:pb-10 lg:px-8">
        <RealtimeAutoRefresh
          projectIds={[...projects, ...archivedProjects].map((project) => project.id)}
          includeUserScope
          includeAdminScope={isSuperAdmin}
          userId={user.id ?? null}
          isSuperAdmin={isSuperAdmin}
        />

        {pendingInvitations.length > 0 && (
          <div>
            <PendingInvitationsSection invitations={pendingInvitations} userId={session.user.id!} />
          </div>
        )}

        <div className="mt-5 grid gap-4 sm:mt-6 sm:gap-6 lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)] xl:gap-8">
          <div className="order-2 self-start lg:order-1 lg:sticky lg:top-24">
            <HomeProjectsSidebar
              projects={projects.map((project) => ({
                id: project.id,
                name: project.name,
                isPersonal: Boolean((project as { isPersonal?: boolean }).isPersonal),
                members: project.members.map((member) => ({
                  isPinned: member.isPinned,
                  userGroupId: member.userGroupId,
                  projectOrder: (member as { projectOrder?: number | null }).projectOrder ?? null,
                })),
              }))}
              groups={userGroups.map((group) => ({ id: group.id, name: group.name, position: group.position }))}
              archivedCount={archivedProjects.length}
              locale={locale}
            />
          </div>

          <div className="order-1 space-y-6 sm:space-y-8 lg:order-2">
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
              userGroups={userGroups.map((group) => ({
                id: group.id,
                name: group.name,
                position: group.position,
                description: (group as { description?: string | null }).description ?? null,
              }))}
              isSuperAdmin={isSuperAdmin}
            />
          </div>
        </div>
      </main>

      <MobileBottomNav />
    </div>
  );
}
