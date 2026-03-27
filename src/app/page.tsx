export const dynamic = 'force-dynamic';

import { listProjects, getPendingInvitations, listUserProjectGroups } from "@/lib/actions";
import { auth, signOut } from "@/auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { HomePageClient } from "@/components/home/HomePageClient";
import { PendingInvitationsSection } from "@/components/home/PendingInvitationsSection";

export default async function HomePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [projects, pendingInvitations, userGroups] = await Promise.all([
    listProjects(),
    session.user.email ? getPendingInvitations(session.user.email) : Promise.resolve([]),
    listUserProjectGroups(),
  ]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 sm:px-6 h-14 flex items-center justify-between">
        <h1 className="text-base font-semibold text-gray-900 dark:text-gray-50">Mes projets</h1>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/me"
            className="inline-flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            title="Mon espace"
          >
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="hidden sm:inline">Mon espace</span>
          </Link>
          <Link
            href="/portfolio"
            className="inline-flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            title="Portefeuille"
          >
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="hidden sm:inline">Portefeuille</span>
          </Link>
          <Link
            href="/templates"
            className="inline-flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            title="Templates"
          >
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <rect x="3" y="3" width="8" height="8" rx="1" strokeWidth="1.5" />
              <rect x="13" y="3" width="8" height="8" rx="1" strokeWidth="1.5" />
              <rect x="3" y="13" width="8" height="8" rx="1" strokeWidth="1.5" />
              <rect x="13" y="13" width="8" height="8" rx="1" strokeWidth="1.5" />
            </svg>
            <span className="hidden sm:inline">Templates</span>
          </Link>
          <Link
            href="/projects/new"
            className="inline-flex items-center gap-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg px-3 sm:px-4 py-2 hover:bg-indigo-700 transition-colors"
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M12 4v16m8-8H4" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span className="hidden sm:inline">Nouveau projet</span>
          </Link>
          <div className="flex items-center gap-2 pl-2 sm:pl-3 border-l border-gray-200 dark:border-gray-700">
            <div className="w-7 h-7 rounded-full flex-shrink-0 overflow-hidden">
              {session.user.image ? (
                <img src={session.user.image} alt={session.user.name ?? ""} className="w-full h-full object-cover rounded-full" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-semibold">
                  {session.user.name?.charAt(0).toUpperCase() ?? "?"}
                </div>
              )}
            </div>
            <span className="hidden sm:block text-sm text-gray-700 dark:text-gray-200 max-w-[120px] truncate">{session.user.name}</span>
            <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
              <button type="submit" className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors cursor-pointer">
                <span className="hidden sm:inline">Déconnexion</span>
                <svg className="sm:hidden w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="px-4 sm:px-6 py-6 sm:py-8 max-w-5xl mx-auto">
        {/* Pending invitations */}
        {pendingInvitations.length > 0 && (
          <PendingInvitationsSection invitations={pendingInvitations} userId={session.user.id!} />
        )}
        <HomePageClient projects={projects} userGroups={userGroups} />
      </main>
    </div>
  );
}
