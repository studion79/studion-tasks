"use client";

import { useState, useEffect, useTransition } from "react";
import { usePathname } from "next/navigation";
import {
  listUserGroups,
  createUserGroup,
  updateUserGroup,
  deleteUserGroup,
} from "@/lib/actions";
import { localeFromPathname, tr } from "@/lib/i18n/client";

type UserGroup = { id: string; name: string; emails: string };

export function GroupsManagerModal({ onClose }: { onClose: () => void }) {
  const pathname = usePathname();
  const locale = localeFromPathname(pathname);
  const [groups, setGroups] = useState<UserGroup[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [, startTransition] = useTransition();

  // Form state
  const [formName, setFormName] = useState("");
  const [formEmails, setFormEmails] = useState("");
  const [formError, setFormError] = useState("");

  useEffect(() => {
    listUserGroups().then((rows) => setGroups(rows as UserGroup[]));
  }, []);

  const emailsFromGroup = (g: UserGroup) =>
    (JSON.parse(g.emails) as string[]).join("\n");

  const handleCreate = () => {
    setFormError("");
    const emails = formEmails
      .split(/[\n,;]+/)
      .map((e) => e.trim())
      .filter(Boolean);
    startTransition(async () => {
      try {
        const created = await createUserGroup(formName, emails);
        setGroups((prev) => [...prev, created as UserGroup].sort((a, b) => a.name.localeCompare(b.name)));
        setShowCreate(false);
        setFormName("");
        setFormEmails("");
      } catch (e) {
        setFormError(e instanceof Error ? e.message : tr(locale, "Erreur", "Error"));
      }
    });
  };

  const handleUpdate = (g: UserGroup) => {
    setFormError("");
    const emails = formEmails
      .split(/[\n,;]+/)
      .map((e) => e.trim())
      .filter(Boolean);
    startTransition(async () => {
      try {
        const updated = await updateUserGroup(g.id, formName, emails);
        setGroups((prev) =>
          prev.map((x) => (x.id === g.id ? (updated as UserGroup) : x))
        );
        setEditingId(null);
      } catch (e) {
        setFormError(e instanceof Error ? e.message : tr(locale, "Erreur", "Error"));
      }
    });
  };

  const handleDelete = (id: string) => {
    startTransition(async () => {
      await deleteUserGroup(id);
      setGroups((prev) => prev.filter((g) => g.id !== id));
    });
  };

  const startEdit = (g: UserGroup) => {
    setEditingId(g.id);
    setFormName(g.name);
    setFormEmails(emailsFromGroup(g));
    setFormError("");
    setShowCreate(false);
  };

  const startCreate = () => {
    setShowCreate(true);
    setEditingId(null);
    setFormName("");
    setFormEmails("");
    setFormError("");
  };

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/20" onClick={onClose} />
      <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center pointer-events-none">
        <div className="bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xl p-4 sm:p-6 w-full sm:max-w-md pointer-events-auto h-[92dvh] sm:h-auto sm:max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-4 sm:mb-5 sticky top-0 bg-white dark:bg-gray-800 py-1 z-10">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-50">{tr(locale, "Groupes d'invitation", "Invitation groups")}</h2>
            <button
              onClick={onClose}
              aria-label={tr(locale, "Fermer", "Close")}
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M6 18L18 6M6 6l12 12" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {/* Groups list */}
          {groups.length === 0 && !showCreate && (
            <p className="text-sm text-gray-400 text-center py-4">{tr(locale, "Aucun groupe configuré.", "No configured group.")}</p>
          )}

          <div className="space-y-3 mb-4">
            {groups.map((g) =>
              editingId === g.id ? (
                <GroupForm
                  key={g.id}
                  name={formName}
                  emails={formEmails}
                  error={formError}
                  onName={setFormName}
                  onEmails={setFormEmails}
                  onSubmit={() => handleUpdate(g)}
                  onCancel={() => setEditingId(null)}
                  submitLabel={tr(locale, "Enregistrer", "Save")}
                  locale={locale}
                />
              ) : (
                <div
                  key={g.id}
                  className="flex items-start justify-between gap-3 p-3 rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{g.name}</p>
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
                      {(JSON.parse(g.emails) as string[]).length} {tr(locale, "membre", "member")}
                      {(JSON.parse(g.emails) as string[]).length > 1 ? "s" : ""}
                      {" · "}
                      {(JSON.parse(g.emails) as string[]).slice(0, 2).join(", ")}
                      {(JSON.parse(g.emails) as string[]).length > 2 &&
                        ` +${(JSON.parse(g.emails) as string[]).length - 2}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => startEdit(g)}
                      aria-label={tr(locale, "Modifier", "Edit")}
                      className="p-1.5 text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                      title={tr(locale, "Modifier", "Edit")}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDelete(g.id)}
                      aria-label={tr(locale, "Supprimer", "Delete")}
                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                      title={tr(locale, "Supprimer", "Delete")}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </div>
                </div>
              )
            )}
          </div>

          {/* Create form */}
          {showCreate && (
            <GroupForm
              name={formName}
              emails={formEmails}
              error={formError}
              onName={setFormName}
              onEmails={setFormEmails}
              onSubmit={handleCreate}
              onCancel={() => setShowCreate(false)}
              submitLabel={tr(locale, "Créer le groupe", "Create group")}
              locale={locale}
            />
          )}

          {!showCreate && editingId === null && (
            <button
              onClick={startCreate}
              className="w-full flex items-center justify-center gap-2 text-sm text-indigo-600 dark:text-indigo-400 border border-dashed border-indigo-200 dark:border-indigo-700 rounded-xl py-2.5 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M12 4v16m8-8H4" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              {tr(locale, "Nouveau groupe", "New group")}
            </button>
          )}
          <button
            onClick={onClose}
            className="sm:hidden w-full mt-2 text-sm text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-600 rounded-xl py-2.5"
          >
            {tr(locale, "Fermer", "Close")}
          </button>
        </div>
      </div>
    </>
  );
}

function GroupForm({
  name,
  emails,
  error,
  onName,
  onEmails,
  onSubmit,
  onCancel,
  submitLabel,
  locale,
}: {
  name: string;
  emails: string;
  error: string;
  onName: (v: string) => void;
  onEmails: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitLabel: string;
  locale: "fr" | "en";
}) {
  return (
    <div className="rounded-xl border border-indigo-100 dark:border-indigo-800 bg-indigo-50/30 dark:bg-indigo-900/20 p-4 space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">{tr(locale, "Nom du groupe", "Group name")}</label>
        <input
          type="text"
          value={name}
          onChange={(e) => onName(e.target.value)}
          autoFocus
          placeholder={tr(locale, "ex : Comité de direction", "e.g. Leadership committee")}
          className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 transition-colors bg-white dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-500"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
          {tr(locale, "Emails", "Emails")} <span className="font-normal text-gray-400 dark:text-gray-500">({tr(locale, "un par ligne, ou séparés par virgule", "one per line, or comma-separated")})</span>
        </label>
        <textarea
          value={emails}
          onChange={(e) => onEmails(e.target.value)}
          rows={4}
          placeholder={"alice@exemple.com\nbob@exemple.com\ncharlie@exemple.com"}
          className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 transition-colors bg-white dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-500 resize-none font-mono"
        />
      </div>
      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
      )}
      <div className="flex gap-2">
        <button
          onClick={onSubmit}
          className="flex-1 bg-indigo-600 text-white text-sm font-medium py-2 rounded-lg hover:bg-indigo-700 transition-colors cursor-pointer"
        >
          {submitLabel}
        </button>
        <button
          onClick={onCancel}
          className="px-4 text-sm text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer"
        >
          {tr(locale, "Annuler", "Cancel")}
        </button>
      </div>
    </div>
  );
}
