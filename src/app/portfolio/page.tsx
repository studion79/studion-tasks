export const dynamic = 'force-dynamic';

import { listProjects } from "@/lib/actions";
import { auth } from "@/auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";

export default async function PortfolioPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const headerStore = await headers();
  const headerLocale = headerStore.get("x-taskapp-locale") ?? "";
  const locale = isLocale(headerLocale) ? headerLocale : DEFAULT_LOCALE;
  const t = (fr: string, en: string) => (locale === "en" ? en : fr);

  const projects = await listProjects();

  const rows = projects.map((project) => {
    const allTasks = project.groups.flatMap((g) => g.tasks);
    const total = allTasks.length;
    const done = allTasks.filter((t) =>
      t.fieldValues.some((fv) => fv.column.type === "STATUS" && fv.value === "DONE")
    ).length;
    const inProgress = allTasks.filter((t) =>
      t.fieldValues.some((fv) => fv.column.type === "STATUS" && fv.value === "WORKING")
    ).length;
    const overdue = allTasks.filter((t) => {
      const fv = t.fieldValues.find((f) => f.column.type === "DUE_DATE");
      return fv?.value && new Date(fv.value) < new Date();
    }).length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    const lastUpdated =
      allTasks.length > 0
        ? allTasks.reduce(
            (latest, t) => (t.updatedAt > latest ? t.updatedAt : latest),
            allTasks[0].updatedAt
          )
        : project.createdAt;
    return { project, total, done, inProgress, overdue, pct, lastUpdated };
  });

  const globalTotal = rows.reduce((s, r) => s + r.total, 0);
  const globalDone = rows.reduce((s, r) => s + r.done, 0);
  const globalOverdue = rows.reduce((s, r) => s + r.overdue, 0);
  const globalPct = globalTotal > 0 ? Math.round((globalDone / globalTotal) * 100) : 0;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 sm:px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors text-sm flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M15 19l-7-7 7-7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {t("Projets", "Projects")}
          </Link>
          <span className="text-gray-200 dark:text-gray-700">/</span>
          <h1 className="text-base font-semibold text-gray-900 dark:text-gray-50">{t("Portefeuille", "Portfolio")}</h1>
        </div>
      </header>

      <main className="px-4 sm:px-6 py-6 sm:py-8 max-w-6xl mx-auto space-y-6">
        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: t("Projets", "Projects"), value: projects.length, color: "text-indigo-600 bg-indigo-50" },
            { label: t("Tâches totales", "Total tasks"), value: globalTotal, color: "text-gray-700 bg-gray-100" },
            { label: t("Terminées", "Completed"), value: `${globalDone} (${globalPct}%)`, color: "text-emerald-600 bg-emerald-50" },
            { label: t("En retard", "Late"), value: globalOverdue, color: globalOverdue > 0 ? "text-red-600 bg-red-50" : "text-gray-400 bg-gray-50" },
          ].map((stat) => (
            <div key={stat.label} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 px-5 py-4">
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">{stat.label}</p>
              <p className={`text-2xl font-bold ${stat.color.split(" ")[0]}`}>{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Project table */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700 text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                <th className="text-left px-5 py-3">{t("Projet", "Project")}</th>
                <th className="text-center px-4 py-3 w-16">{t("Tâches", "Tasks")}</th>
                <th className="text-center px-4 py-3 w-16">{t("En cours", "In progress")}</th>
                <th className="text-center px-4 py-3 w-16">{t("Terminées", "Completed")}</th>
                <th className="text-center px-4 py-3 w-20">{t("En retard", "Late")}</th>
                <th className="px-4 py-3 w-44">{t("Progression", "Progress")}</th>
                <th className="text-right px-5 py-3 w-32">{t("Mis à jour", "Updated")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ project, total, done, inProgress, overdue, pct, lastUpdated }) => (
                <tr key={project.id} className="border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50/60 dark:hover:bg-gray-700/30 transition-colors">
                  <td className="px-5 py-3">
                    <Link href={`/projects/${project.id}`} className="font-medium text-gray-800 dark:text-gray-100 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                      {project.name}
                    </Link>
                  </td>
                  <td className="text-center px-4 py-3 text-gray-500 dark:text-gray-400">{total}</td>
                  <td className="text-center px-4 py-3">
                    {inProgress > 0 ? (
                      <span className="inline-flex items-center justify-center min-w-[20px] h-5 bg-amber-100 text-amber-600 text-[11px] font-semibold rounded-full px-1.5">
                        {inProgress}
                      </span>
                    ) : (
                      <span className="text-gray-300 dark:text-gray-600">—</span>
                    )}
                  </td>
                  <td className="text-center px-4 py-3 text-emerald-600 font-medium">{done > 0 ? done : <span className="text-gray-300">—</span>}</td>
                  <td className="text-center px-4 py-3">
                    {overdue > 0 ? (
                      <span className="inline-flex items-center justify-center min-w-[20px] h-5 bg-red-100 text-red-600 text-[11px] font-semibold rounded-full px-1.5">
                        {overdue}
                      </span>
                    ) : (
                      <span className="text-gray-300 dark:text-gray-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-400 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-[11px] text-gray-400 dark:text-gray-500 w-8 text-right">{pct}%</span>
                    </div>
                  </td>
                  <td className="text-right px-5 py-3 text-[11px] text-gray-400 dark:text-gray-500">
                    {new Date(lastUpdated).toLocaleDateString(locale === "en" ? "en-US" : "fr-FR", { day: "numeric", month: "short" })}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-sm text-gray-400 dark:text-gray-500">
                    {t("Aucun projet", "No project")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
