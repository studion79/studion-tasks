"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";

type UILang = "fr" | "en";

const COPY = {
  fr: {
    missingKey: "Clé push manquante côté serveur (VAPID_PUBLIC_KEY).",
    subscribeError: "Erreur d'abonnement push",
    title: "Notifications push",
    missingServerConfig: "Configuration serveur incomplète: variable `VAPID_PUBLIC_KEY` manquante.",
    blocked: "Les notifications sont bloquées par le navigateur. Autorise-les dans les réglages de l’appareil.",
    iosHint: "Sur iPhone, installe l’app sur l’écran d’accueil puis ouvre-la et active les notifications.",
    enableHint: "Active les notifications pour recevoir les attributions de tâches en temps réel.",
    enabling: "Activation...",
    enable: "Activer",
    later: "Plus tard",
  },
  en: {
    missingKey: "Missing push key on server (VAPID_PUBLIC_KEY).",
    subscribeError: "Push subscription error",
    title: "Push notifications",
    missingServerConfig: "Server configuration is incomplete: missing `VAPID_PUBLIC_KEY`.",
    blocked: "Notifications are blocked by the browser. Allow them in your device settings.",
    iosHint: "On iPhone, install the app on the Home Screen, then open it and enable notifications.",
    enableHint: "Enable notifications to receive real-time task assignments.",
    enabling: "Enabling...",
    enable: "Enable",
    later: "Later",
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

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

function isStandaloneMode(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}

function isIOSDevice(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

type BadgeCapableNavigator = Navigator & {
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

async function applyBadgeCountOnClient(count: number): Promise<void> {
  const safeCount = Math.max(0, Math.floor(Number(count) || 0));
  try {
    const nav = navigator as BadgeCapableNavigator;
    if (typeof nav.setAppBadge === "function") {
      if (safeCount > 0) await nav.setAppBadge(safeCount);
      else if (typeof nav.clearAppBadge === "function") await nav.clearAppBadge();
      else await nav.setAppBadge(0);
    }
  } catch {
    // ignore unsupported platform/runtime
  }

  try {
    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration?.active) {
        registration.active.postMessage({ type: "TASKAPP_BADGE_SYNC", count: safeCount });
      }
    }
  } catch {
    // ignore
  }
}

export default function PwaRegister() {
  const { status } = useSession();
  const [lang, setLang] = useState<UILang>("fr");
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [isSupported, setIsSupported] = useState(true);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [pushEnabledPref, setPushEnabledPref] = useState(true);
  const [error, setError] = useState("");
  const [dismissed, setDismissed] = useState(false);
  const [forceOpen, setForceOpen] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);

  const registerAndSubscribe = useCallback(async (askPermission: boolean) => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setIsSupported(false);
      return;
    }

    setError("");
    if (!publicKey) {
      setError(COPY[lang].missingKey);
      setForceOpen(true);
      return;
    }
    setSubscribing(true);
    try {
      let currentPermission = Notification.permission;
      // Important iOS: permission request should happen directly from user action.
      if (askPermission && currentPermission === "default") {
        currentPermission = await Notification.requestPermission();
      }
      setPermission(currentPermission);
      if (currentPermission !== "granted") {
        setSubscribing(false);
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js");

      const existing = await registration.pushManager.getSubscription();
      const sub = existing ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });

      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub),
      });
      if (!response.ok) {
        let msg = `HTTP ${response.status}`;
        try {
          const json = (await response.json()) as { error?: string };
          if (json?.error) msg = json.error;
        } catch {
          // ignore parse error
        }
        throw new Error(msg);
      }
      await fetch("/api/push/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pushEnabled: true }),
      }).catch(() => {});
      setSubscribed(true);
      setPushEnabledPref(true);
      setForceOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : COPY[lang].subscribeError);
      console.warn("[PWA] push setup failed:", err);
      // Close forced mode after manual attempt to avoid sticky banner loop.
      setForceOpen(false);
    } finally {
      setSubscribing(false);
    }
  }, [lang, publicKey]);

  const syncAppBadgeFromServer = useCallback(async () => {
    try {
      const response = await fetch("/api/push/badge", { cache: "no-store" });
      if (!response.ok) return;
      const json = (await response.json()) as { ok?: boolean; unreadCount?: number };
      if (!json.ok) return;
      await applyBadgeCountOnClient(Number(json.unreadCount ?? 0));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const onUpdate = () => setLang(detectLanguage());
    setLang(detectLanguage());
    window.addEventListener("taskapp:display-prefs-updated", onUpdate);
    return () => window.removeEventListener("taskapp:display-prefs-updated", onUpdate);
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<{ request?: boolean; forceBanner?: boolean }>;
      if (custom.detail?.forceBanner) {
        setDismissed(false);
        setForceOpen(true);
      }
      if (custom.detail?.request) void registerAndSubscribe(true);
    };
    window.addEventListener("taskapp:manage-push", handler);
    return () => window.removeEventListener("taskapp:manage-push", handler);
  }, [registerAndSubscribe]);

  useEffect(() => {
    if (status !== "authenticated") return;
    setIsIOS(isIOSDevice());
    setIsStandalone(isStandaloneMode());
    if (!("Notification" in window)) {
      setIsSupported(false);
      return;
    }
    setPermission(Notification.permission);
    void fetch("/api/push/preferences")
      .then((r) => r.ok ? r.json() : Promise.resolve({ ok: false }))
      .then((json: { ok?: boolean; pushEnabled?: boolean }) => {
        setPushEnabledPref(json.ok ? Boolean(json.pushEnabled) : true);
      })
      .catch(() => {
        setPushEnabledPref(true);
      });
    void fetch("/api/push/public-key")
      .then((r) => r.ok ? r.json() : Promise.resolve({ ok: false }))
      .then((json: { ok?: boolean; publicKey?: string | null }) => {
        setPublicKey(json.ok && json.publicKey ? json.publicKey : null);
      })
      .catch(() => {
        setPublicKey(null);
      });
    // Si déjà autorisé, on (re)synchronise l'abonnement sans popup.
  }, [status, registerAndSubscribe]);

  useEffect(() => {
    if (status !== "authenticated") return;
    if (pushEnabledPref && "Notification" in window && Notification.permission === "granted") {
      void registerAndSubscribe(false);
    }
  }, [status, pushEnabledPref, registerAndSubscribe]);

  useEffect(() => {
    if (status !== "authenticated") return;
    void syncAppBadgeFromServer();

    const handleBadgeSync = () => {
      void syncAppBadgeFromServer();
    };
    const handleVisibilitySync = () => {
      if (document.visibilityState === "visible") void syncAppBadgeFromServer();
    };

    window.addEventListener("taskapp:badge-sync", handleBadgeSync);
    document.addEventListener("visibilitychange", handleVisibilitySync);
    window.addEventListener("focus", handleBadgeSync);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void syncAppBadgeFromServer();
    }, 60000);

    return () => {
      window.removeEventListener("taskapp:badge-sync", handleBadgeSync);
      document.removeEventListener("visibilitychange", handleVisibilitySync);
      window.removeEventListener("focus", handleBadgeSync);
      window.clearInterval(interval);
    };
  }, [status, syncAppBadgeFromServer]);

  const showBanner = useMemo(() => {
    if (status !== "authenticated") return false;
    if (dismissed && !forceOpen) return false;
    if (!isSupported) return false;
    if (!pushEnabledPref && !forceOpen) return false;
    if (subscribed) return false;
    if (permission === "granted" && !forceOpen) return false;
    return true;
  }, [status, dismissed, forceOpen, isSupported, pushEnabledPref, subscribed, permission]);

  if (!showBanner) return null;

  const blocked = permission === "denied";
  const needsIOSInstall = isIOS && !isStandalone;
  const missingKey = !publicKey;

  return (
    <div className="fixed left-3 right-3 bottom-14 sm:left-3 sm:right-auto sm:bottom-3 sm:w-[370px] z-40 rounded-xl border border-indigo-200 dark:border-indigo-900/60 bg-white/95 dark:bg-gray-900/95 shadow-lg backdrop-blur p-3">
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 text-indigo-500 flex-shrink-0">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-gray-800 dark:text-gray-100">{COPY[lang].title}</p>
          {missingKey ? (
            <p className="text-[11px] text-red-600 mt-0.5">
              {COPY[lang].missingServerConfig}
            </p>
          ) : blocked ? (
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
              {COPY[lang].blocked}
            </p>
          ) : needsIOSInstall ? (
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
              {COPY[lang].iosHint}
            </p>
          ) : (
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
              {COPY[lang].enableHint}
            </p>
          )}
          {error && (
            <p className="text-[11px] text-red-600 mt-1">
              {error}
            </p>
          )}
          <div className="mt-2 flex items-center gap-2">
            {!missingKey && !blocked && !needsIOSInstall && (
              <button
                onClick={() => { void registerAndSubscribe(true); }}
                disabled={subscribing}
                className="text-[11px] px-2.5 py-1 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60 cursor-pointer"
              >
                {subscribing ? COPY[lang].enabling : COPY[lang].enable}
              </button>
            )}
            <button
              onClick={() => { setDismissed(true); setForceOpen(false); }}
              className="text-[11px] px-2.5 py-1 rounded-md border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
            >
              {COPY[lang].later}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
