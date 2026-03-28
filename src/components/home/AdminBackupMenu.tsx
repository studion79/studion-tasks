"use client";

import { useRef, useState, useTransition } from "react";

export function AdminBackupMenu() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string>("");
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const onImportChange = (file: File | null) => {
    if (!file) return;
    setMessage("");
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.append("database", file);
        const res = await fetch("/api/admin/database", { method: "POST", body: fd });
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; message?: string };
        if (!res.ok || !data.ok) {
          setMessage(data.error ?? "Import impossible.");
          return;
        }
        setMessage(data.message ?? "Import terminé.");
      } catch {
        setMessage("Import impossible.");
      } finally {
        if (inputRef.current) inputRef.current.value = "";
      }
    });
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer"
        title="Sauvegardes admin"
      >
        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M12 3v12m0 0l4-4m-4 4l-4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="hidden sm:inline">Sauvegardes</span>
        <svg className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M6 9l6 6 6-6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-64 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg p-2 z-50">
          <a
            href="/api/admin/tasks-csv"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Export CSV global
          </a>
          <a
            href="/api/admin/database"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Télécharger la base (.db)
          </a>
          <div className="px-3 py-2">
            <input
              ref={inputRef}
              type="file"
              accept=".db,.sqlite,.sqlite3,application/octet-stream"
              className="hidden"
              onChange={(e) => onImportChange(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={isPending}
              className="w-full rounded-lg border border-gray-200 dark:border-gray-600 px-2 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-60 cursor-pointer"
            >
              {isPending ? "Import..." : "Importer une base (.db)"}
            </button>
            {message && (
              <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">{message}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
