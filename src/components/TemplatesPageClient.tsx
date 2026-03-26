"use client";

import { useState, useTransition } from "react";
import { deleteProjectTemplate, createProjectFromTemplate } from "@/lib/actions";

type Template = {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
};

export function TemplatesPageClient({ templates: initial }: { templates: Template[] }) {
  const [templates, setTemplates] = useState<Template[]>(initial);
  const [useModal, setUseModal] = useState<Template | null>(null);
  const [projectName, setProjectName] = useState("");
  const [isPending, startTransition] = useTransition();
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const handleDelete = (id: string) => {
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    setDeleteConfirm(null);
    startTransition(async () => {
      await deleteProjectTemplate(id);
    });
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!useModal || !projectName.trim()) return;
    startTransition(async () => {
      await createProjectFromTemplate(useModal.id, projectName.trim());
    });
  };

  const fmt = (d: Date) =>
    new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

  const parseSnapshot = (t: Template & { snapshot?: string }) => {
    try {
      return JSON.parse((t as { snapshot: string }).snapshot ?? "{}");
    } catch {
      return {};
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <a href="/" className="text-gray-400 hover:text-gray-600 text-sm flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M15 19l-7-7 7-7" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            Projets
          </a>
          <span className="text-gray-200">/</span>
          <h1 className="text-sm font-semibold text-gray-900">Templates</h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {templates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <svg className="w-12 h-12 mb-4 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <rect x="3" y="3" width="8" height="8" rx="1" strokeWidth="1.5" />
              <rect x="13" y="3" width="8" height="8" rx="1" strokeWidth="1.5" />
              <rect x="3" y="13" width="8" height="8" rx="1" strokeWidth="1.5" />
              <rect x="13" y="13" width="8" height="8" rx="1" strokeWidth="1.5" />
            </svg>
            <p className="text-sm font-medium text-gray-500">Aucun template</p>
            <p className="text-xs mt-1">
              Sauvegardez un projet comme template depuis la page projet.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((t) => {
              const snap = parseSnapshot(t as Template & { snapshot?: string });
              const groupCount = snap.groups?.length ?? 0;
              const colCount = snap.columns?.length ?? 0;
              return (
                <div
                  key={t.id}
                  className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex flex-col gap-3 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h2 className="text-sm font-semibold text-gray-900 truncate">{t.name}</h2>
                      {t.description && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate">{t.description}</p>
                      )}
                    </div>
                    <button
                      onClick={() => setDeleteConfirm(deleteConfirm === t.id ? null : t.id)}
                      className="p-1.5 text-gray-300 hover:text-red-500 rounded-md hover:bg-red-50 transition-colors cursor-pointer flex-shrink-0"
                      title="Supprimer"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>

                  {deleteConfirm === t.id && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 text-xs text-red-700">
                      <p className="font-medium mb-1.5">Confirmer la suppression ?</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleDelete(t.id)}
                          className="flex-1 bg-red-500 text-white rounded-md py-1 font-medium hover:bg-red-600 cursor-pointer transition-colors"
                        >
                          Supprimer
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(null)}
                          className="flex-1 bg-white border border-red-200 text-red-600 rounded-md py-1 hover:bg-red-50 cursor-pointer transition-colors"
                        >
                          Annuler
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-3 text-xs text-gray-400">
                    {groupCount > 0 && (
                      <span>{groupCount} groupe{groupCount !== 1 ? "s" : ""}</span>
                    )}
                    {colCount > 0 && (
                      <span>{colCount} colonne{colCount !== 1 ? "s" : ""}</span>
                    )}
                  </div>

                  <p className="text-[10px] text-gray-300">Créé le {fmt(t.createdAt)}</p>

                  <button
                    onClick={() => { setUseModal(t); setProjectName(""); }}
                    className="mt-auto w-full bg-indigo-50 text-indigo-600 border border-indigo-200 text-xs font-medium rounded-lg py-2 hover:bg-indigo-100 transition-colors cursor-pointer"
                  >
                    Utiliser ce template
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Use template modal */}
      {useModal && (
        <>
          <div className="fixed inset-0 z-50 bg-black/20" onClick={() => setUseModal(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-xl p-6 w-full max-w-sm pointer-events-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-gray-900">Créer depuis &ldquo;{useModal.name}&rdquo;</h2>
                <button onClick={() => setUseModal(null)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 cursor-pointer">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M6 18L18 6M6 6l12 12" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
              <form onSubmit={handleCreate}>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Nom du projet</label>
                <input
                  autoFocus
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder={useModal.name}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 mb-4"
                />
                <button
                  type="submit"
                  disabled={isPending || !projectName.trim()}
                  className="w-full bg-indigo-600 text-white text-sm font-medium py-2 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-60 cursor-pointer"
                >
                  {isPending ? "Création…" : "Créer le projet"}
                </button>
              </form>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
