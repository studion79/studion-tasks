export const dynamic = 'force-dynamic';

import { getMyTasks, getMyProjects } from "@/lib/actions";
import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { MySpacePage } from "@/components/me/MySpacePage";
import { prisma } from "@/lib/db";
import { headers } from "next/headers";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { RealtimeAutoRefresh } from "@/components/realtime/RealtimeAutoRefresh";
import { pickByIsEn, pickByLocale } from "@/lib/i18n/pick";

export default async function MePage() {
  const headerStore = await headers();
  const locale = headerStore.get("x-taskapp-locale") === "en" ? "en" : "fr";
  const session = await auth();
  if (!session?.user) redirect("/login");
  const sessionUser = session.user as { isSuperAdmin?: boolean; id?: string; name?: string | null; email?: string | null; image?: string | null };
  const isSuperAdmin = Boolean(sessionUser.isSuperAdmin);

  const [tasks, projects] = isSuperAdmin
    ? [[], []]
    : await Promise.all([getMyTasks(), getMyProjects()]);
  const dbUser = sessionUser.id
    ? await prisma.user.findUnique({
        where: { id: sessionUser.id },
        select: { name: true, email: true, avatar: true },
      })
    : null;

  const user = {
    id: sessionUser.id ?? "",
    name: dbUser?.name ?? sessionUser.name ?? "",
    email: dbUser?.email ?? sessionUser.email ?? "",
    avatar: dbUser?.avatar ?? sessionUser.image ?? null,
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 sm:px-6 h-14 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M15 19l-7-7 7-7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {pickByLocale(locale, "Projets", "Projects")}
          </Link>
          <span className="text-gray-200 dark:text-gray-700">|</span>
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-50">{pickByLocale(locale, "Mon espace", "My Space")}</span>
        </div>
        <div className="flex items-center gap-2 border-l border-gray-200 dark:border-gray-700 pl-3">
          {user.avatar ? (
            <img src={user.avatar} alt={user.name} className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
          ) : (
            <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
              {user.name.charAt(0).toUpperCase() || "?"}
            </div>
          )}
          <span className="hidden sm:block text-sm text-gray-700 dark:text-gray-200 max-w-[140px] truncate">{user.name}</span>
          <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
            <button type="submit" className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors cursor-pointer ml-1">
              <span className="hidden sm:inline">{pickByLocale(locale, "Déconnexion", "Sign out")}</span>
              <svg className="sm:hidden w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </form>
        </div>
      </header>

      <RealtimeAutoRefresh
        projectIds={projects.map((project) => project.id)}
        includeUserScope
        userId={sessionUser.id ?? null}
        isSuperAdmin={isSuperAdmin}
      />
      <MySpacePage tasks={tasks} projects={projects} user={user} />
      <MobileBottomNav />
    </div>
  );
}
