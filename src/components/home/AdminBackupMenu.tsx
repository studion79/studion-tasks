"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useClientLocale } from "@/lib/i18n/useClientLocale";
import { tKey } from "@/lib/i18n/messages";

export function AdminBackupMenu() {
  const pathname = usePathname();
  const lang = useClientLocale(pathname);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string>("");
  const [mode, setMode] = useState<"overwrite" | "merge">("overwrite");
  const [isPending, startTransition] = useTransition();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  const onImportChange = (file: File | null) => {
    if (!file) return;
    setMessage("");
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.append("database", file);
        fd.append("mode", mode);
        const res = await fetch("/api/admin/database", {
          method: "POST",
          headers: { "x-taskapp-locale": lang },
          body: fd,
        });
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; message?: string };
        if (!res.ok || !data.ok) {
          setMessage(data.error ?? tKey(lang, "admin.backups.importFailed"));
          return;
        }
        setMessage(data.message ?? tKey(lang, "admin.backups.importDone"));
      } catch {
        setMessage(tKey(lang, "admin.backups.importFailed"));
      } finally {
        if (inputRef.current) inputRef.current.value = "";
      }
    });
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer"
        title={tKey(lang, "admin.backups.title")}
      >
        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M12 3v12m0 0l4-4m-4 4l-4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="hidden sm:inline">{tKey(lang, "admin.backups.label")}</span>
        <svg className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M6 9l6 6 6-6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-64 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg p-2 z-50">
          <Link
            href="/api/admin/tasks-csv"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            {tKey(lang, "admin.backups.csv")}
          </Link>
          <Link
            href="/api/admin/database"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            {tKey(lang, "admin.backups.downloadDb")}
          </Link>
          <div className="px-3 py-2">
            <div className="mb-2 rounded-lg border border-gray-200 dark:border-gray-700 p-2">
              <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">{tKey(lang, "admin.backups.importMode")}</p>
              <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-200 cursor-pointer">
                <input
                  type="radio"
                  name="db-import-mode"
                  value="overwrite"
                  checked={mode === "overwrite"}
                  onChange={() => setMode("overwrite")}
                />
                {tKey(lang, "admin.backups.overwrite")}
              </label>
              <label className="mt-1 flex items-center gap-2 text-xs text-gray-700 dark:text-gray-200 cursor-pointer">
                <input
                  type="radio"
                  name="db-import-mode"
                  value="merge"
                  checked={mode === "merge"}
                  onChange={() => setMode("merge")}
                />
                {tKey(lang, "admin.backups.merge")}
              </label>
            </div>
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
              {isPending ? tKey(lang, "admin.backups.importing") : tKey(lang, "admin.backups.importDb")}
            </button>
            <p className="mt-2 text-[11px] text-gray-400 dark:text-gray-500">
              {mode === "overwrite"
                ? tKey(lang, "admin.backups.overwriteHint")
                : tKey(lang, "admin.backups.mergeHint")}
            </p>
            {message && (
              <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">{message}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
