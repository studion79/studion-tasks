export const dynamic = 'force-dynamic';

import { getMyTasks, getMyProjects } from "@/lib/actions";
import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { MySpacePage } from "@/components/me/MySpacePage";

export default async function MePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [tasks, projects] = await Promise.all([getMyTasks(), getMyProjects()]);

  const user = {
    id: session.user.id ?? "",
    name: session.user.name ?? "",
    email: session.user.email ?? "",
    avatar: session.user.image ?? null,
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 sm:px-6 h-14 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M15 19l-7-7 7-7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Projets
          </Link>
          <span className="text-gray-200">|</span>
          <span className="text-sm font-semibold text-gray-900">Mon espace</span>
        </div>
        <div className="flex items-center gap-2 border-l border-gray-200 pl-3">
          {user.avatar ? (
            <img src={user.avatar} alt={user.name} className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
          ) : (
            <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
              {user.name.charAt(0).toUpperCase() || "?"}
            </div>
          )}
          <span className="hidden sm:block text-sm text-gray-700 max-w-[140px] truncate">{user.name}</span>
          <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
            <button type="submit" className="text-xs text-gray-400 hover:text-gray-600 transition-colors cursor-pointer ml-1">
              <span className="hidden sm:inline">Déconnexion</span>
              <svg className="sm:hidden w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </form>
        </div>
      </header>

      <MySpacePage tasks={tasks} projects={projects} user={user} />
    </div>
  );
}
