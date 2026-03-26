export const dynamic = 'force-dynamic';

import { listProjects, getPendingInvitations } from "@/lib/actions";
import { auth, signOut } from "@/auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ProjectCard } from "@/components/home/ProjectCard";
import { PendingInvitationsSection } from "@/components/home/PendingInvitationsSection";

export default async function HomePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [projects, pendingInvitations] = await Promise.all([
    listProjects(),
    session.user.email ? getPendingInvitations(session.user.email) : Promise.resolve([]),
  ]);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 sm:px-6 h-14 flex items-center justify-between">
        <h1 className="text-base font-semibold text-gray-900">Mes projets</h1>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/me"
            className="inline-flex items-center gap-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-gray-50 transition-colors"
            title="Mon espace"
          >
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="hidden sm:inline">Mon espace</span>
          </Link>
          <Link
            href="/portfolio"
            className="inline-flex items-center gap-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-gray-50 transition-colors"
            title="Portefeuille"
          >
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="hidden sm:inline">Portefeuille</span>
          </Link>
          <Link
            href="/templates"
            className="inline-flex items-center gap-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-gray-50 transition-colors"
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
          <div className="flex items-center gap-2 pl-2 sm:pl-3 border-l border-gray-200">
            <div className="w-7 h-7 rounded-full flex-shrink-0 overflow-hidden">
              {session.user.image ? (
                <img src={session.user.image} alt={session.user.name ?? ""} className="w-full h-full object-cover rounded-full" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-semibold">
                  {session.user.name?.charAt(0).toUpperCase() ?? "?"}
                </div>
              )}
            </div>
            <span className="hidden sm:block text-sm text-gray-700 max-w-[120px] truncate">{session.user.name}</span>
            <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
              <button type="submit" className="text-xs text-gray-400 hover:text-gray-600 transition-colors cursor-pointer">
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

        {projects.length === 0 ? (
          <div className="text-center py-16 sm:py-24">
            <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M19 11H5m14 0l-4-4m4 4l-4 4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Aucun projet pour l&apos;instant</h2>
            <p className="text-sm text-gray-500 mb-6">Créez votre premier projet pour commencer.</p>
            <Link
              href="/projects/new"
              className="inline-flex items-center gap-2 bg-indigo-600 text-white text-sm font-medium rounded-lg px-5 py-2.5 hover:bg-indigo-700 transition-colors"
            >
              Créer un projet
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
            <Link
              href="/projects/new"
              className="flex flex-col items-center justify-center bg-white rounded-xl border border-dashed border-gray-300 p-5 hover:border-indigo-400 hover:bg-indigo-50 transition-all text-gray-400 hover:text-indigo-500 group min-h-[120px]"
            >
              <span className="w-8 h-8 rounded-lg border-2 border-current flex items-center justify-center mb-2 text-lg leading-none group-hover:scale-110 transition-transform">+</span>
              <span className="text-sm font-medium">Nouveau projet</span>
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
