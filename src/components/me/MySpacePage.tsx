"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  getMyNotificationSettings,
  getNotifPreferences,
  setNotifPreference,
  updateMyNotificationSettings,
  getMyDisplaySettings,
  updateMyDisplaySettings,
  updateMyPassword,
  updateMyProfile,
} from "@/lib/actions";
import type { NotifType } from "@/lib/constants";
import { LOCALE_COOKIE } from "@/i18n/config";
import { localeFromPathname, tr } from "@/lib/i18n/client";

type MyTask = {
  id: string;
  title: string;
  completedAt: string | null;
  parentId: string | null;
  projectId: string;
  projectName: string;
  groupName: string;
  status: string | null;
  priority: string | null;
  dueDate: string | null;
};

type MyProject = {
  id: string;
  name: string;
  role: "ADMIN" | "MEMBER";
  memberCount: number;
  totalTaskCount: number;
  myTaskCount: number;
  completedCount: number;
};

type UserInfo = { id: string; name: string; email: string; avatar: string | null };

type NotificationPrefs = {
  pushEnabled: boolean;
  emailEnabled: boolean;
  assignment: boolean;
  comment: boolean;
  mention: boolean;
  dueSoon: boolean;
  automation: boolean;
  overdue: boolean; // local-only for now (same reminder channel as dueSoon on backend)
  dailySummary: boolean;
  dailySummaryTime: string;
  dndEnabled: boolean;
  dndStart: string;
  dndEnd: string;
  dndWeekendsOnly: boolean;
};

type DisplayPrefs = {
  syncAcrossDevices: boolean;
  defaultView: "SPREADSHEET" | "KANBAN" | "CARDS" | "GANTT" | "TIMELINE" | "CALENDAR";
  density: "compact" | "comfortable";
  mondayFirst: boolean;
  dateFormat: "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD";
  language: "fr" | "en";
};

const ALLOWED_AVATAR_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]);
const MAX_AVATAR_UPLOAD_BYTES = 20 * 1024 * 1024; // 20MB

const DEFAULT_NOTIF_PREFS: NotificationPrefs = {
  pushEnabled: true,
  emailEnabled: false,
  assignment: true,
  comment: true,
  mention: true,
  dueSoon: true,
  automation: true,
  overdue: true,
  dailySummary: true,
  dailySummaryTime: "08:00",
  dndEnabled: false,
  dndStart: "22:00",
  dndEnd: "08:00",
  dndWeekendsOnly: false,
};

function withLocalePath(pathname: string, locale: "fr" | "en"): string {
  if (/^\/(fr|en)(\/|$)/.test(pathname)) {
    return pathname.replace(/^\/(fr|en)(?=\/|$)/, `/${locale}`);
  }
  return pathname === "/" ? `/${locale}` : `/${locale}${pathname}`;
}

const NOTIF_PREF_KEYS: { key: keyof NotificationPrefs; type: NotifType }[] = [
  { key: "assignment", type: "TASK_ASSIGNED" },
  { key: "comment", type: "COMMENT_ADDED" },
  { key: "mention", type: "MENTIONED" },
  { key: "dueSoon", type: "DUE_DATE_SOON" },
  { key: "overdue", type: "OVERDUE" },
  { key: "dailySummary", type: "DAILY_SUMMARY" },
  { key: "automation", type: "AUTOMATION" },
];

const DEFAULT_DISPLAY_PREFS: DisplayPrefs = {
  syncAcrossDevices: false,
  defaultView: "SPREADSHEET",
  density: "comfortable",
  mondayFirst: true,
  dateFormat: "DD/MM/YYYY",
  language: "fr",
};

function initials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function Toggle({ checked, onChange, label, description }: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <label className="flex items-start justify-between gap-4 py-2">
      <span className="min-w-0">
        <span className="block text-sm font-medium text-gray-800 dark:text-gray-100">{label}</span>
        {description ? (
          <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</span>
        ) : null}
      </span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors cursor-pointer ${
          checked ? "bg-indigo-600" : "bg-gray-300 dark:bg-gray-600"
        }`}
        aria-pressed={checked}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
            checked ? "translate-x-5" : "translate-x-1"
          }`}
        />
      </button>
    </label>
  );
}

export function MySpacePage({ tasks, projects, user }: { tasks: MyTask[]; projects: MyProject[]; user: UserInfo }) {
  const router = useRouter();
  const pathname = usePathname();
  const locale = localeFromPathname(pathname);
  const [avatarSrc, setAvatarSrc] = useState(user.avatar);
  const [name, setName] = useState(user.name);
  const [nameMessage, setNameMessage] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [pwdMessage, setPwdMessage] = useState<string | null>(null);
  const [pwdError, setPwdError] = useState<string | null>(null);

  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs>(DEFAULT_NOTIF_PREFS);
  const [displayPrefs, setDisplayPrefs] = useState<DisplayPrefs>(DEFAULT_DISPLAY_PREFS);
  const [notifSaved, setNotifSaved] = useState(false);
  const [displaySaved, setDisplaySaved] = useState(false);
  const [notifError, setNotifError] = useState<string | null>(null);

  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [dangerConfirm, setDangerConfirm] = useState(false);

  const [isPending, startTransition] = useTransition();
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const rawNotif = window.localStorage.getItem("taskapp:notif-prefs");
      if (rawNotif) setNotifPrefs({ ...DEFAULT_NOTIF_PREFS, ...(JSON.parse(rawNotif) as Partial<NotificationPrefs>) });

      const rawDisplay = window.localStorage.getItem("taskapp:display-prefs");
      if (rawDisplay) setDisplayPrefs({ ...DEFAULT_DISPLAY_PREFS, ...(JSON.parse(rawDisplay) as Partial<DisplayPrefs>) });
    } catch {
      // Ignore parsing/storage errors and keep defaults.
    }

    // Load server-backed notification preferences (authoritative for emitted notif types).
    startTransition(async () => {
      try {
        const [serverPrefs, settings] = await Promise.all([
          getNotifPreferences(),
          getMyNotificationSettings(),
        ]);
        const map = new Map(serverPrefs.map((p) => [p.type, p.enabled]));
        setNotifPrefs((prev) => ({
          ...prev,
          pushEnabled: settings.pushEnabled,
          emailEnabled: settings.emailEnabled,
          dndEnabled: settings.dndEnabled,
          dndStart: settings.dndStart,
          dndEnd: settings.dndEnd,
          dndWeekendsOnly: settings.dndWeekendsOnly,
          assignment: map.get("TASK_ASSIGNED") ?? prev.assignment,
          comment: map.get("COMMENT_ADDED") ?? prev.comment,
          mention: map.get("MENTIONED") ?? prev.mention,
          dueSoon: map.get("DUE_DATE_SOON") ?? prev.dueSoon,
          overdue: map.get("OVERDUE") ?? prev.overdue,
          dailySummary: map.get("DAILY_SUMMARY") ?? prev.dailySummary,
          dailySummaryTime: settings.dailySummaryTime,
          automation: map.get("AUTOMATION") ?? prev.automation,
        }));

        const serverDisplay = await getMyDisplaySettings();
        setDisplayPrefs((prev) => {
          if (!serverDisplay.syncAcrossDevices) {
            return { ...prev, syncAcrossDevices: false };
          }
          const merged = {
            ...prev,
            ...serverDisplay,
            syncAcrossDevices: true,
          };
          try {
            window.localStorage.setItem("taskapp:display-prefs", JSON.stringify(merged));
            window.dispatchEvent(new CustomEvent("taskapp:display-prefs-updated", { detail: merged }));
          } catch {
            // Ignore storage errors.
          }
          return merged;
        });
      } catch {
        // Keep local defaults if loading fails.
      }
    });
  }, []);

  const sectionLinks = [
    { id: "profil", label: tr(locale, "Profil", "Profile") },
    { id: "notifications", label: tr(locale, "Notifications", "Notifications") },
    { id: "affichage", label: tr(locale, "Affichage", "Display") },
    { id: "securite", label: tr(locale, "Sécurité", "Security") },
    { id: "donnees", label: tr(locale, "Données", "Data") },
  ];

  const roleLabel = useMemo(() => {
    const adminCount = projects.filter((p) => p.role === "ADMIN").length;
    return adminCount > 0 ? "Admin" : tr(locale, "Membre", "Member");
  }, [locale, projects]);

  const openPushManager = () => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent("taskapp:manage-push", {
        detail: { forceBanner: true, request: true },
      })
    );
  };

  const sendLocalTestNotification = async () => {
    try {
      if (!("Notification" in window)) {
        alert(tr(locale, "Notifications non supportées sur ce navigateur.", "Notifications are not supported on this browser."));
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        alert(tr(locale, "Permission de notification refusée.", "Notification permission denied."));
        return;
      }
      if (!("serviceWorker" in navigator)) {
        alert(tr(locale, "Service Worker indisponible.", "Service Worker unavailable."));
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(tr(locale, "Action requise", "Action required"), {
        body: tr(locale, "Ceci est une notification de test depuis Mon espace.", "This is a test notification from My Space."),
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        tag: "taskapp-local-test",
      });
    } catch {
      alert(tr(locale, "Impossible d'envoyer la notification de test.", "Unable to send test notification."));
    }
  };

  const handleSaveProfile = () => {
    setNameError(null);
    setNameMessage(null);
    startTransition(async () => {
      try {
        await updateMyProfile(name);
        setNameMessage(tr(locale, "Profil mis à jour.", "Profile updated."));
      } catch (e) {
        setNameError(e instanceof Error ? e.message : tr(locale, "Erreur lors de la mise à jour.", "Update failed."));
      }
    });
  };

  const handleSavePassword = () => {
    setPwdError(null);
    setPwdMessage(null);
    if (newPwd !== confirmPwd) {
      setPwdError(tr(locale, "Les mots de passe ne correspondent pas.", "Passwords do not match."));
      return;
    }
    startTransition(async () => {
      try {
        await updateMyPassword(currentPwd, newPwd);
        setCurrentPwd("");
        setNewPwd("");
        setConfirmPwd("");
        setPwdMessage(tr(locale, "Mot de passe mis à jour.", "Password updated."));
      } catch (e) {
        setPwdError(e instanceof Error ? e.message : tr(locale, "Erreur lors de la mise à jour.", "Update failed."));
      }
    });
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAvatarError(null);
    if (!ALLOWED_AVATAR_TYPES.has(file.type)) {
      setAvatarError(tr(locale, "Format non supporté. Utilisez JPG, PNG, WebP, GIF ou AVIF.", "Unsupported format. Use JPG, PNG, WebP, GIF or AVIF."));
      return;
    }
    if (file.size > MAX_AVATAR_UPLOAD_BYTES) {
      setAvatarError(tr(locale, "Image trop volumineuse (maximum 20MB).", "Image too large (maximum 20MB)."));
      return;
    }

    const previous = avatarSrc;
    const previewUrl = URL.createObjectURL(file);
    setAvatarSrc(previewUrl);

    const fd = new FormData();
    fd.append("avatar", file);

    startTransition(async () => {
      try {
        const response = await fetch("/api/me/avatar", { method: "POST", body: fd });
        const result = (await response.json()) as { ok: boolean; url?: string; error?: string };
        if (!response.ok || !result.ok || !result.url) {
          setAvatarSrc(previous);
          setAvatarError(result.error ?? tr(locale, `Réponse serveur invalide (HTTP ${response.status})`, `Invalid server response (HTTP ${response.status})`));
          return;
        }
        setAvatarSrc(result.url);
        router.refresh();
      } catch (err) {
        setAvatarSrc(previous);
        setAvatarError(err instanceof Error ? err.message : tr(locale, "Échec de l'envoi.", "Upload failed."));
      } finally {
        URL.revokeObjectURL(previewUrl);
      }
    });
  };

  const handleSaveNotifPrefs = () => {
    setNotifError(null);
    try {
      window.localStorage.setItem("taskapp:notif-prefs", JSON.stringify(notifPrefs));
    } catch {
      setNotifError(tr(locale, "Impossible d'enregistrer les préférences locales.", "Unable to save local preferences."));
      return;
    }

    startTransition(async () => {
      try {
        await Promise.all(
          NOTIF_PREF_KEYS.map(({ key, type }) =>
            setNotifPreference(type, Boolean(notifPrefs[key]))
          )
        );
        await updateMyNotificationSettings({
          pushEnabled: notifPrefs.pushEnabled,
          emailEnabled: notifPrefs.emailEnabled,
          dndEnabled: notifPrefs.dndEnabled,
          dndStart: notifPrefs.dndStart,
          dndEnd: notifPrefs.dndEnd,
          dndWeekendsOnly: notifPrefs.dndWeekendsOnly,
          dailySummaryTime: notifPrefs.dailySummaryTime,
        });

        // If push is disabled, actively unsubscribe current device from push channel.
        if (!notifPrefs.pushEnabled && "serviceWorker" in navigator) {
          const reg = await navigator.serviceWorker.ready;
          const sub = await reg.pushManager.getSubscription();
          if (sub) {
            await fetch("/api/push/unsubscribe", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ endpoint: sub.endpoint }),
            });
            await sub.unsubscribe().catch(() => {});
          }
        }

        // If push is enabled, prompt/sync via existing manager flow.
        if (notifPrefs.pushEnabled) {
          openPushManager();
        }

        setNotifSaved(true);
        setTimeout(() => setNotifSaved(false), 2200);
      } catch {
        setNotifError(tr(locale, "Impossible d'enregistrer les préférences serveur.", "Unable to save server preferences."));
      }
    });
  };

  const handleSaveDisplayPrefs = () => {
    startTransition(async () => {
      try {
        if (displayPrefs.syncAcrossDevices) {
          await updateMyDisplaySettings({
            syncAcrossDevices: true,
            defaultView: displayPrefs.defaultView,
            density: displayPrefs.density,
            mondayFirst: displayPrefs.mondayFirst,
            dateFormat: displayPrefs.dateFormat,
            language: displayPrefs.language,
          });
        } else {
          await updateMyDisplaySettings({
            syncAcrossDevices: false,
            language: displayPrefs.language,
          });
        }
        window.localStorage.setItem("taskapp:display-prefs", JSON.stringify(displayPrefs));
        window.dispatchEvent(new CustomEvent("taskapp:display-prefs-updated", { detail: displayPrefs }));
        if (typeof window !== "undefined") {
          document.cookie = `${LOCALE_COOKIE}=${displayPrefs.language}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax`;
          const nextPath = withLocalePath(window.location.pathname, displayPrefs.language);
          const nextUrl = `${nextPath}${window.location.search}${window.location.hash}`;
          window.location.assign(nextUrl);
        }
        setDisplaySaved(true);
        setTimeout(() => setDisplaySaved(false), 2200);
      } catch {
        alert(tr(locale, "Impossible d'enregistrer les préférences d'affichage.", "Unable to save display preferences."));
      }
    });
  };

  const handleExportMyData = () => {
    downloadJson(`task-app-my-data-${new Date().toISOString().slice(0, 10)}.json`, {
      exportedAt: new Date().toISOString(),
      user: { id: user.id, name, email: user.email, avatar: avatarSrc },
      projects,
      tasks,
    });
  };

  const handleExportPushSubscription = async () => {
    if (!("serviceWorker" in navigator)) {
      alert(tr(locale, "Service Worker indisponible.", "Service Worker unavailable."));
      return;
    }
    try {
      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.getSubscription();
      if (!subscription) {
        alert(tr(locale, "Aucun abonnement push actif sur cet appareil.", "No active push subscription on this device."));
        return;
      }
      downloadJson(`task-app-push-subscription-${new Date().toISOString().slice(0, 10)}.json`, {
        exportedAt: new Date().toISOString(),
        endpoint: subscription.endpoint,
        keys: subscription.toJSON().keys ?? null,
      });
    } catch {
      alert(tr(locale, "Impossible d'exporter l'abonnement push.", "Unable to export push subscription."));
    }
  };

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 pb-24 sm:pb-8">
      <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] gap-6">
        <aside className="lg:sticky lg:top-20 h-fit bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-3 pb-4 border-b border-gray-100 dark:border-gray-700">
            {avatarSrc ? (
              <img src={avatarSrc} alt={name} className="w-12 h-12 rounded-full object-cover" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold">
                {initials(name)}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-50 truncate">{name}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user.email}</p>
              <span className="inline-flex mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300">
                {roleLabel}
              </span>
            </div>
          </div>

          <nav className="pt-3 space-y-1">
            {sectionLinks.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className="block text-sm text-gray-600 dark:text-gray-300 rounded-lg px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                {item.label}
              </a>
            ))}
          </nav>

          <Link
            href="/"
            className="mt-4 inline-flex w-full justify-center items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            {tr(locale, "Retour à Mes projets", "Back to My projects")}
          </Link>
        </aside>

        <div className="space-y-6">
          <section id="profil" className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-sm p-5 sm:p-6">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-50 mb-4">{tr(locale, "Profil", "Profile")}</h2>
            <div className="grid grid-cols-1 md:grid-cols-[120px_minmax(0,1fr)] gap-5 items-start">
              <div className="flex flex-col items-center gap-2">
                <button onClick={() => avatarInputRef.current?.click()} className="relative group cursor-pointer" type="button">
                  {avatarSrc ? (
                    <img src={avatarSrc} alt={name} className="w-20 h-20 rounded-full object-cover border border-gray-200 dark:border-gray-700" />
                  ) : (
                    <div className="w-20 h-20 rounded-full bg-indigo-600 text-white text-2xl font-bold flex items-center justify-center">
                      {initials(name)}
                    </div>
                  )}
                  <span className="absolute inset-0 rounded-full bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
                <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                <p className="text-[11px] text-gray-500 dark:text-gray-400 text-center">JPG, PNG, WebP, GIF, AVIF</p>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">{tr(locale, "Nom", "Name")}</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-2 text-sm text-gray-900 dark:text-gray-50 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                  <input
                    value={user.email}
                    readOnly
                    className="w-full px-3 py-2 text-sm border border-gray-100 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-700/50 text-gray-400 dark:text-gray-500 cursor-not-allowed"
                  />
                </div>
                {avatarError ? <p className="text-xs text-red-600">{avatarError}</p> : null}
                {nameError ? <p className="text-xs text-red-600">{nameError}</p> : null}
                {nameMessage ? <p className="text-xs text-green-600">{nameMessage}</p> : null}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSaveProfile}
                    disabled={isPending}
                    className="bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors cursor-pointer disabled:opacity-60"
                  >
                    {tr(locale, "Enregistrer", "Save")}
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-sm p-5 sm:p-6">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-50 mb-4">{tr(locale, "Mot de passe", "Password")}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">{tr(locale, "Mot de passe actuel", "Current password")}</label>
                <input
                  type="password"
                  value={currentPwd}
                  onChange={(e) => setCurrentPwd(e.target.value)}
                  className="w-full px-3 py-2 text-sm text-gray-900 dark:text-gray-50 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">{tr(locale, "Nouveau mot de passe", "New password")}</label>
                <input
                  type="password"
                  value={newPwd}
                  onChange={(e) => setNewPwd(e.target.value)}
                  className="w-full px-3 py-2 text-sm text-gray-900 dark:text-gray-50 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">{tr(locale, "Confirmation", "Confirmation")}</label>
                <input
                  type="password"
                  value={confirmPwd}
                  onChange={(e) => setConfirmPwd(e.target.value)}
                  className="w-full px-3 py-2 text-sm text-gray-900 dark:text-gray-50 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100"
                />
              </div>
              {pwdError ? <p className="text-xs text-red-600">{pwdError}</p> : null}
              {pwdMessage ? <p className="text-xs text-green-600">{pwdMessage}</p> : null}
              <button
                type="button"
                onClick={handleSavePassword}
                disabled={isPending}
                className="bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors cursor-pointer disabled:opacity-60"
              >
                {tr(locale, "Mettre à jour", "Update")}
              </button>
            </div>
          </section>

          <section id="notifications" className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-sm p-5 sm:p-6">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-50 mb-4">{tr(locale, "Notifications", "Notifications")}</h2>

            <div className="space-y-1 border-b border-gray-100 dark:border-gray-700 pb-3 mb-3">
              <Toggle
                checked={notifPrefs.pushEnabled}
                onChange={(v) => setNotifPrefs((prev) => ({ ...prev, pushEnabled: v }))}
                label={tr(locale, "Activer les notifications push", "Enable push notifications")}
                description={tr(locale, "Réception sur navigateur et mobile PWA", "Receive on browser and mobile PWA")}
              />
              <Toggle
                checked={notifPrefs.emailEnabled}
                onChange={(v) => setNotifPrefs((prev) => ({ ...prev, emailEnabled: v }))}
                label={tr(locale, "Activer les notifications email", "Enable email notifications")}
              />
            </div>

            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">{tr(locale, "Événements", "Events")}</p>
            <div className="space-y-1 border-b border-gray-100 dark:border-gray-700 pb-3 mb-3">
              <Toggle checked={notifPrefs.assignment} onChange={(v) => setNotifPrefs((p) => ({ ...p, assignment: v }))} label={tr(locale, "Nouvelle attribution", "New assignment")} />
              <Toggle checked={notifPrefs.comment} onChange={(v) => setNotifPrefs((p) => ({ ...p, comment: v }))} label={tr(locale, "Nouveau commentaire", "New comment")} />
              <Toggle checked={notifPrefs.mention} onChange={(v) => setNotifPrefs((p) => ({ ...p, mention: v }))} label={tr(locale, "Mention (@)", "Mention (@)")} />
              <Toggle checked={notifPrefs.dueSoon} onChange={(v) => setNotifPrefs((p) => ({ ...p, dueSoon: v }))} label={tr(locale, "Échéance proche", "Due soon")} />
              <Toggle checked={notifPrefs.automation} onChange={(v) => setNotifPrefs((p) => ({ ...p, automation: v }))} label={tr(locale, "Automatisations", "Automations")} />
              <Toggle checked={notifPrefs.overdue} onChange={(v) => setNotifPrefs((p) => ({ ...p, overdue: v }))} label={tr(locale, "Échéance dépassée", "Overdue")} />
              <Toggle checked={notifPrefs.dailySummary} onChange={(v) => setNotifPrefs((p) => ({ ...p, dailySummary: v }))} label={tr(locale, "Résumé quotidien", "Daily summary")} />
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{tr(locale, "Heure du résumé quotidien", "Daily summary time")}</label>
                <input
                  type="time"
                  value={notifPrefs.dailySummaryTime}
                  onChange={(e) => setNotifPrefs((p) => ({ ...p, dailySummaryTime: e.target.value }))}
                  className="w-full sm:w-56 datetime-field"
                />
              </div>
            </div>

            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">{tr(locale, "Ne pas déranger", "Do not disturb")}</p>
            <div className="space-y-3">
              <Toggle
                checked={notifPrefs.dndEnabled}
                onChange={(v) => setNotifPrefs((prev) => ({ ...prev, dndEnabled: v }))}
                label={tr(locale, "Activer le mode silencieux", "Enable silent mode")}
              />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{tr(locale, "Début", "Start")}</label>
                  <input
                    type="time"
                    value={notifPrefs.dndStart}
                    onChange={(e) => setNotifPrefs((p) => ({ ...p, dndStart: e.target.value }))}
                    className="w-full datetime-field"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{tr(locale, "Fin", "End")}</label>
                  <input
                    type="time"
                    value={notifPrefs.dndEnd}
                    onChange={(e) => setNotifPrefs((p) => ({ ...p, dndEnd: e.target.value }))}
                    className="w-full datetime-field"
                  />
                </div>
              </div>
              <Toggle
                checked={notifPrefs.dndWeekendsOnly}
                onChange={(v) => setNotifPrefs((prev) => ({ ...prev, dndWeekendsOnly: v }))}
                label={tr(locale, "Appliquer uniquement le week-end", "Apply only on weekends")}
              />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={openPushManager}
                className="text-sm text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-900/60 rounded-lg px-3 py-2 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors cursor-pointer"
              >
                {tr(locale, "Gérer les autorisations", "Manage permissions")}
              </button>
              <button
                type="button"
                onClick={sendLocalTestNotification}
                className="text-sm text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer"
              >
                {tr(locale, "Tester", "Test")}
              </button>
              <button
                type="button"
                onClick={handleSaveNotifPrefs}
                className="bg-indigo-600 text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-indigo-700 transition-colors cursor-pointer"
              >
                {tr(locale, "Enregistrer", "Save")}
              </button>
            </div>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-2">
              {tr(locale, "Les préférences sont synchronisées côté serveur (types de notification + email + mode silencieux).", "Preferences are synchronized server-side (notification types + email + silent mode).")}
            </p>
            {notifError ? <p className="text-xs text-red-600 mt-1">{notifError}</p> : null}
            {notifSaved ? <p className="text-xs text-green-600 mt-2">{tr(locale, "Préférences enregistrées.", "Preferences saved.")}</p> : null}
          </section>

          <section id="affichage" className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-sm p-5 sm:p-6">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-50 mb-4">{tr(locale, "Affichage", "Display")}</h2>
            <div className="mb-4 border-b border-gray-100 dark:border-gray-700 pb-4">
              <Toggle
                checked={displayPrefs.syncAcrossDevices}
                onChange={(v) => setDisplayPrefs((p) => ({ ...p, syncAcrossDevices: v }))}
                label={tr(locale, "Synchroniser entre appareils", "Sync across devices")}
                description={tr(locale, "Si activé, ces préférences s'appliquent sur tous vos appareils. Sinon, elles restent locales à cet appareil.", "If enabled, these preferences apply to all your devices. Otherwise, they stay local to this device.")}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">{tr(locale, "Vue projet par défaut", "Default project view")}</label>
                <select
                  value={displayPrefs.defaultView}
                  onChange={(e) =>
                    setDisplayPrefs((p) => ({ ...p, defaultView: e.target.value as DisplayPrefs["defaultView"] }))
                  }
                  className="w-full select-unified"
                >
                  <option value="SPREADSHEET">{tr(locale, "Tableur", "Spreadsheet")}</option>
                  <option value="KANBAN">Kanban</option>
                  <option value="CARDS">{tr(locale, "Fiches", "Cards")}</option>
                  <option value="GANTT">Gantt</option>
                  <option value="TIMELINE">{tr(locale, "Échéancier", "Timeline")}</option>
                  <option value="CALENDAR">{tr(locale, "Calendrier", "Calendar")}</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">{tr(locale, "Densité", "Density")}</label>
                <select
                  value={displayPrefs.density}
                  onChange={(e) =>
                    setDisplayPrefs((p) => ({ ...p, density: e.target.value as DisplayPrefs["density"] }))
                  }
                  className="w-full select-unified"
                >
                  <option value="comfortable">{tr(locale, "Confort", "Comfortable")}</option>
                  <option value="compact">{tr(locale, "Compact", "Compact")}</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">{tr(locale, "Langue", "Language")}</label>
                <select
                  value={displayPrefs.language}
                  onChange={(e) =>
                    setDisplayPrefs((p) => ({ ...p, language: e.target.value as DisplayPrefs["language"] }))
                  }
                  className="w-full select-unified"
                >
                  <option value="fr">{tr(locale, "Français", "French")}</option>
                  <option value="en">English</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">{tr(locale, "Format date", "Date format")}</label>
                <select
                  value={displayPrefs.dateFormat}
                  onChange={(e) =>
                    setDisplayPrefs((p) => ({ ...p, dateFormat: e.target.value as DisplayPrefs["dateFormat"] }))
                  }
                  className="w-full select-unified"
                >
                  <option value="DD/MM/YYYY">JJ/MM/AAAA</option>
                  <option value="MM/DD/YYYY">MM/JJ/AAAA</option>
                  <option value="YYYY-MM-DD">AAAA-MM-JJ</option>
                </select>
              </div>
              <div className="flex items-end pb-1">
                <Toggle
                  checked={displayPrefs.mondayFirst}
                  onChange={(v) => setDisplayPrefs((p) => ({ ...p, mondayFirst: v }))}
                  label={tr(locale, "Semaine commence lundi", "Week starts on Monday")}
                />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={handleSaveDisplayPrefs}
                className="bg-indigo-600 text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-indigo-700 transition-colors cursor-pointer"
              >
                {tr(locale, "Appliquer", "Apply")}
              </button>
              {displaySaved ? <p className="text-xs text-green-600">{tr(locale, "Préférences enregistrées.", "Preferences saved.")}</p> : null}
            </div>
          </section>

          <section id="securite" className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-sm p-5 sm:p-6">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-50 mb-4">{tr(locale, "Sécurité", "Security")}</h2>
            <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
              <div className="grid grid-cols-3 gap-2 bg-gray-50 dark:bg-gray-900/40 px-3 py-2 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                <span>{tr(locale, "Appareil", "Device")}</span>
                <span>{tr(locale, "Statut", "Status")}</span>
                <span>{tr(locale, "Dernière activité", "Last activity")}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 px-3 py-3 text-sm border-t border-gray-100 dark:border-gray-700">
                <span className="text-gray-800 dark:text-gray-100 truncate">{tr(locale, "Session actuelle", "Current session")}</span>
                <span className="text-green-600">{tr(locale, "Active", "Active")}</span>
                <span className="text-gray-500 dark:text-gray-400">{tr(locale, "À l'instant", "Just now")}</span>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled
                className="text-sm text-gray-400 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 cursor-not-allowed"
                title={tr(locale, "Fonctionnalité backend à activer", "Backend feature to enable")}
              >
                {tr(locale, "Déconnecter toutes les autres sessions (bientôt)", "Sign out from all other sessions (soon)")}
              </button>
            </div>
          </section>

          <section id="donnees" className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-sm p-5 sm:p-6">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-50 mb-4">{tr(locale, "Données", "Data")}</h2>
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleExportMyData}
                  className="text-sm text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                >
                  {tr(locale, "Exporter mes données", "Export my data")}
                </button>
                <button
                  type="button"
                  onClick={handleExportPushSubscription}
                  className="text-sm text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                >
                  {tr(locale, "Exporter mon abonnement push", "Export my push subscription")}
                </button>
              </div>

              <div className="mt-4 rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 p-4">
                <p className="text-sm font-semibold text-red-700 dark:text-red-300">{tr(locale, "Zone danger", "Danger zone")}</p>
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                  {tr(locale, "La suppression de compte n'est pas encore automatisée. Demande manuelle recommandée.", "Account deletion is not automated yet. Manual request is recommended.")}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {!dangerConfirm ? (
                    <button
                      type="button"
                      onClick={() => setDangerConfirm(true)}
                      className="text-sm text-red-700 border border-red-300 dark:border-red-800 rounded-lg px-3 py-2 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors cursor-pointer"
                    >
                      {tr(locale, "Supprimer mon compte", "Delete my account")}
                    </button>
                  ) : (
                    <>
                      <a
                        href="mailto:felix.brossard@studio-n.fr?subject=Suppression%20de%20compte%20Task%20App"
                        className="text-sm text-white bg-red-600 rounded-lg px-3 py-2 hover:bg-red-700 transition-colors"
                      >
                        {tr(locale, "Confirmer par email admin", "Confirm by admin email")}
                      </a>
                      <button
                        type="button"
                        onClick={() => setDangerConfirm(false)}
                        className="text-sm text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                      >
                        {tr(locale, "Annuler", "Cancel")}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
