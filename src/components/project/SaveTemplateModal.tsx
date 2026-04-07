"use client";

import { useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import { saveProjectAsTemplate } from "@/lib/actions";
import { localeFromPathname, tr } from "@/lib/i18n/client";

export function SaveTemplateModal({
  projectId,
  projectName,
  onClose,
}: {
  projectId: string;
  projectName: string;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const locale = localeFromPathname(pathname);
  const [name, setName] = useState(projectName);
  const [includeTasks, setIncludeTasks] = useState(false);
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    startTransition(async () => {
      try {
        await saveProjectAsTemplate(projectId, name.trim(), includeTasks);
        setDone(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : tr(locale, "Erreur lors de la sauvegarde", "Save failed"));
      }
    });
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/20" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center pointer-events-none">
        <div className="bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xl p-4 sm:p-6 w-full sm:max-w-sm pointer-events-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-50">{tr(locale, "Sauvegarder comme template", "Save as template")}</h2>
            <button aria-label={tr(locale, "Fermer", "Close")} onClick={onClose} className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M6 18L18 6M6 6l12 12" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          {done ? (
            <div className="flex flex-col items-center py-4 gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M5 13l4 4L19 7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{tr(locale, "Template sauvegardé !", "Template saved!")}</p>
              <div className="flex gap-2 w-full">
                <button onClick={onClose} className="flex-1 border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300 rounded-lg py-2 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer">
                  {tr(locale, "Fermer", "Close")}
                </button>
                <a href="/templates" className="flex-1 text-center bg-indigo-600 text-white text-sm font-medium rounded-lg py-2 hover:bg-indigo-700 transition-colors">
                  {tr(locale, "Voir les templates", "See templates")}
                </a>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1.5">{tr(locale, "Nom du template", "Template name")}</label>
              <input
                autoFocus
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-gray-50 bg-white dark:bg-gray-700 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 mb-4 placeholder-gray-400 dark:placeholder-gray-500"
                placeholder={tr(locale, "Nom du template", "Template name")}
              />
              <label className="flex items-center gap-2.5 py-2 mb-3 cursor-pointer select-none">
                <div
                  onClick={() => setIncludeTasks((v) => !v)}
                  className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${includeTasks ? "bg-indigo-500" : "bg-gray-200 dark:bg-gray-600"}`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${includeTasks ? "translate-x-4" : ""}`}
                  />
                </div>
                <span className="text-sm text-gray-700 dark:text-gray-200">{tr(locale, "Inclure les tâches", "Include tasks")}</span>
              </label>
              {error && (
                <p className="text-xs text-red-500 mb-3">{error}</p>
              )}
              <button
                type="submit"
                disabled={isPending || !name.trim()}
                className="w-full bg-indigo-600 text-white text-sm font-medium py-2 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-60 cursor-pointer"
              >
                {isPending ? tr(locale, "Sauvegarde…", "Saving...") : tr(locale, "Sauvegarder", "Save")}
              </button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
