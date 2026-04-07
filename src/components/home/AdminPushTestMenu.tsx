"use client";

import { useEffect, useRef, useState } from "react";

type UILang = "fr" | "en";

const COPY = {
  fr: {
    loadUsersError: "Impossible de charger les utilisateurs.",
    title: "Notification push test",
    shortLabel: "Notif test",
    noUser: "Aucun utilisateur",
    sendError: "Envoi impossible.",
    sentFallback: "Notification test envoyée.",
    sending: "Envoi...",
    sendButton: "Envoyer une notification",
    dailySentFallback: "Résumé quotidien envoyé.",
    dailyButton: "Tester résumé quotidien",
  },
  en: {
    loadUsersError: "Unable to load users.",
    title: "Push test notification",
    shortLabel: "Test notif",
    noUser: "No user",
    sendError: "Send failed.",
    sentFallback: "Test notification sent.",
    sending: "Sending...",
    sendButton: "Send a notification",
    dailySentFallback: "Daily summary sent.",
    dailyButton: "Test daily summary",
  },
} as const;

function detectLanguage(): UILang {
  if (typeof document !== "undefined") {
    const htmlLang = (document.documentElement.lang || "").toLowerCase();
    if (htmlLang.startsWith("en")) return "en";
  }
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem("taskapp:display-prefs");
      if (raw) {
        const parsed = JSON.parse(raw) as { language?: unknown };
        if (parsed.language === "en") return "en";
      }
    } catch {
      // ignore
    }
  }
  return "fr";
}

export function AdminPushTestMenu() {
  const [lang, setLang] = useState<UILang>("fr");
  const [open, setOpen] = useState(false);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [users, setUsers] = useState<Array<{ id: string; name: string; email: string }>>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [isSendingPush, setIsSendingPush] = useState(false);
  const [isSendingDaily, setIsSendingDaily] = useState(false);
  const [message, setMessage] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    const onUpdate = () => setLang(detectLanguage());
    setLang(detectLanguage());
    window.addEventListener("taskapp:display-prefs-updated", onUpdate);
    return () => window.removeEventListener("taskapp:display-prefs-updated", onUpdate);
  }, []);

  const loadUsers = async () => {
    if (usersLoaded) return;
    setMessage("");
    const res = await fetch("/api/admin/push-test", {
      headers: { "x-taskapp-locale": lang },
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      users?: Array<{ id: string; name: string; email: string }>;
    };
    if (!res.ok || !data.ok) {
      setMessage(data.error ?? COPY[lang].loadUsersError);
      return;
    }
    const list = data.users ?? [];
    setUsers(list);
    setSelectedUserId((prev) => prev || list[0]?.id || "");
    setUsersLoaded(true);
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        onClick={() => {
          setOpen((v) => {
            const next = !v;
            if (next) void loadUsers();
            return next;
          });
        }}
        className="inline-flex items-center gap-1.5 text-sm text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700 rounded-lg px-2.5 py-1.5 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors cursor-pointer"
        title={COPY[lang].title}
      >
        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="hidden sm:inline">{COPY[lang].shortLabel}</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-72 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg p-3 z-50">
          <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1.5">
            {COPY[lang].title}
          </p>
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            className="w-full select-unified"
          >
            {users.length === 0 ? (
              <option value="">{COPY[lang].noUser}</option>
            ) : (
              users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.email})
                </option>
              ))
            )}
          </select>
          <button
            type="button"
            disabled={isSendingPush || !selectedUserId}
            onClick={async () => {
              setIsSendingPush(true);
              setMessage("");
              try {
                const res = await fetch("/api/admin/push-test", {
                  method: "POST",
                  headers: { "Content-Type": "application/json", "x-taskapp-locale": lang },
                  body: JSON.stringify({ userId: selectedUserId }),
                });
                const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; message?: string };
                if (!res.ok || !data.ok) {
                  setMessage(data.error ?? COPY[lang].sendError);
                  return;
                }
                setMessage(data.message ?? COPY[lang].sentFallback);
              } catch {
                setMessage(COPY[lang].sendError);
              } finally {
                setIsSendingPush(false);
              }
            }}
            className="mt-2 w-full rounded-lg border border-indigo-200 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-900/20 px-2 py-1.5 text-sm text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 disabled:opacity-60 cursor-pointer"
          >
            {isSendingPush ? COPY[lang].sending : COPY[lang].sendButton}
          </button>
          <button
            type="button"
            disabled={isSendingDaily || !selectedUserId}
            onClick={async () => {
              setIsSendingDaily(true);
              setMessage("");
              try {
                const res = await fetch("/api/admin/push-test", {
                  method: "POST",
                  headers: { "Content-Type": "application/json", "x-taskapp-locale": lang },
                  body: JSON.stringify({ userId: selectedUserId, mode: "daily-summary" }),
                });
                const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; message?: string };
                if (!res.ok || !data.ok) {
                  setMessage(data.error ?? COPY[lang].sendError);
                  return;
                }
                setMessage(data.message ?? COPY[lang].dailySentFallback);
              } catch {
                setMessage(COPY[lang].sendError);
              } finally {
                setIsSendingDaily(false);
              }
            }}
            className="mt-2 w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-60 cursor-pointer"
          >
            {isSendingDaily ? COPY[lang].sending : COPY[lang].dailyButton}
          </button>
          {message && (
            <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">{message}</p>
          )}
        </div>
      )}
    </div>
  );
}
