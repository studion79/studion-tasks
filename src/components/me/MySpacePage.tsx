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
import { trKey } from "@/lib/i18n/client";
import { useClientLocale } from "@/lib/i18n/useClientLocale";
import { useRealtimeSync } from "@/lib/useRealtimeSync";
import type { RealtimeEvent, RealtimeScope } from "@/lib/realtime";
import { splitUserDisplayName } from "@/lib/name-format";

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
  themeMode: "system" | "light" | "dark";
};

type AvatarCropState = {
  file: File;
  previewUrl: string;
  imageWidth: number;
  imageHeight: number;
  zoom: number;
  offsetX: number;
  offsetY: number;
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
const AVATAR_CROP_VIEW_SIZE = 256;

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
  themeMode: "system",
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getAvatarScale(imageWidth: number, imageHeight: number, zoom: number) {
  const baseScale = Math.max(AVATAR_CROP_VIEW_SIZE / imageWidth, AVATAR_CROP_VIEW_SIZE / imageHeight);
  return baseScale * zoom;
}

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
  const locale = useClientLocale(pathname);
  const [avatarSrc, setAvatarSrc] = useState(user.avatar);
  const initialNameParts = useMemo(() => splitUserDisplayName(user.name), [user.name]);
  const [firstName, setFirstName] = useState(initialNameParts.firstName);
  const [lastName, setLastName] = useState(initialNameParts.lastName);
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
  const [avatarCrop, setAvatarCrop] = useState<AvatarCropState | null>(null);
  const [dangerConfirm, setDangerConfirm] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);

  const [isPending, startTransition] = useTransition();
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const cropDragRef = useRef<{ pointerId: number; startX: number; startY: number; startOffsetX: number; startOffsetY: number } | null>(null);
  const displayName = useMemo(() => {
    const first = firstName.trim();
    const last = lastName.trim();
    return [first, last].filter(Boolean).join(" ") || user.name;
  }, [firstName, lastName, user.name]);

  const loadServerNotificationAndDisplaySettings = async () => {
    const [serverPrefs, settings, serverDisplay] = await Promise.all([
      getNotifPreferences(),
      getMyNotificationSettings(),
      getMyDisplaySettings(),
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

    setDisplayPrefs((prev) => {
      if (!serverDisplay.syncAcrossDevices) {
        const merged = { ...prev, syncAcrossDevices: false };
        try {
          window.localStorage.setItem("taskapp:display-prefs", JSON.stringify(merged));
          window.dispatchEvent(new CustomEvent("taskapp:display-prefs-updated", { detail: merged }));
        } catch {
          // Ignore storage errors.
        }
        return merged;
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
  };

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
        await loadServerNotificationAndDisplaySettings();
      } catch {
        // Keep local defaults if loading fails.
      }
    });
  }, []);

  const realtimeScopes: RealtimeScope[] = [`user:${user.id}`];
  useRealtimeSync({
    scopes: realtimeScopes,
    enabled: Boolean(user.id),
    onEvent: (event: RealtimeEvent) => {
      if (event.type !== "PREFERENCES_CHANGED" && event.type !== "PROFILE_CHANGED" && event.type !== "NOTIFICATION_CHANGED") {
        return;
      }
      startTransition(async () => {
        try {
          if (event.type === "PROFILE_CHANGED") {
            router.refresh();
          }
          await loadServerNotificationAndDisplaySettings();
        } catch {
          // silent realtime resync failures
        }
      });
    },
  });

  const sectionLinks = [
    { id: "profil", label: trKey(locale, "common.profile") },
    { id: "notifications", label: trKey(locale, "common.notifications") },
    { id: "affichage", label: trKey(locale, "common.display") },
    { id: "securite", label: trKey(locale, "common.security") },
    { id: "donnees", label: trKey(locale, "common.data") },
  ];

  const roleLabel = useMemo(() => {
    const adminCount = projects.filter((p) => p.role === "ADMIN").length;
    return adminCount > 0 ? "Admin" : trKey(locale, "me.member");
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
        alert(trKey(locale, "me.notifications.unsupported"));
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        alert(trKey(locale, "me.notifications.permissionDenied"));
        return;
      }
      if (!("serviceWorker" in navigator)) {
        alert(trKey(locale, "me.notifications.serviceWorkerUnavailable"));
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(trKey(locale, "me.notifications.testTitle"), {
        body: trKey(locale, "me.notifications.testBody"),
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        tag: "taskapp-local-test",
      });
    } catch {
      alert(trKey(locale, "me.notifications.testSendFailed"));
    }
  };

  const handleSaveProfile = () => {
    setNameError(null);
    setNameMessage(null);
    startTransition(async () => {
      try {
        await updateMyProfile(firstName, lastName);
        setNameMessage(trKey(locale, "me.profile.updated"));
      } catch (e) {
        setNameError(e instanceof Error ? e.message : trKey(locale, "me.updateFailed"));
      }
    });
  };

  const handleSavePassword = () => {
    setPwdError(null);
    setPwdMessage(null);
    if (newPwd !== confirmPwd) {
      setPwdError(trKey(locale, "me.password.mismatch"));
      return;
    }
    startTransition(async () => {
      try {
        await updateMyPassword(currentPwd, newPwd);
        setCurrentPwd("");
        setNewPwd("");
        setConfirmPwd("");
        setPwdMessage(trKey(locale, "me.password.updated"));
      } catch (e) {
        setPwdError(e instanceof Error ? e.message : trKey(locale, "me.updateFailed"));
      }
    });
  };

  const closeAvatarCrop = () => {
    if (avatarCrop?.previewUrl) URL.revokeObjectURL(avatarCrop.previewUrl);
    setAvatarCrop(null);
    cropDragRef.current = null;
    if (avatarInputRef.current) avatarInputRef.current.value = "";
  };

  const uploadAvatarFile = async (file: File) => {
    const previous = avatarSrc;
    const previewUrl = URL.createObjectURL(file);
    setAvatarSrc(previewUrl);
    setAvatarUploading(true);
    setAvatarError(null);

    const fd = new FormData();
    fd.append("avatar", file);

    try {
      const response = await fetch("/api/me/avatar", { method: "POST", body: fd });
      const result = (await response.json()) as { ok: boolean; url?: string; error?: string };
      if (!response.ok || !result.ok || !result.url) {
        setAvatarSrc(previous);
        setAvatarError(result.error ?? `${trKey(locale, "me.invalidServerResponse")} (HTTP ${response.status})`);
        return;
      }
      setAvatarSrc(result.url);
      router.refresh();
    } catch (err) {
      setAvatarSrc(previous);
      setAvatarError(err instanceof Error ? err.message : trKey(locale, "me.uploadFailed"));
    } finally {
      URL.revokeObjectURL(previewUrl);
      setAvatarUploading(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAvatarError(null);
    if (!ALLOWED_AVATAR_TYPES.has(file.type)) {
      setAvatarError(trKey(locale, "me.avatar.unsupportedFormat"));
      return;
    }
    if (file.size > MAX_AVATAR_UPLOAD_BYTES) {
      setAvatarError(trKey(locale, "me.avatar.tooLarge"));
      return;
    }

    let previewUrl: string | null = null;
    try {
      previewUrl = URL.createObjectURL(file);
      const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () => reject(new Error(trKey(locale, "me.avatar.unsupportedFormat")));
        img.src = previewUrl!;
      });
      setAvatarCrop({
        file,
        previewUrl,
        imageWidth: dimensions.width,
        imageHeight: dimensions.height,
        zoom: 1,
        offsetX: 0,
        offsetY: 0,
      });
    } catch (error) {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setAvatarError(error instanceof Error ? error.message : trKey(locale, "me.uploadFailed"));
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  };

  const onCropPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!avatarCrop) return;
    cropDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startOffsetX: avatarCrop.offsetX,
      startOffsetY: avatarCrop.offsetY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onCropPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!avatarCrop || !cropDragRef.current || cropDragRef.current.pointerId !== event.pointerId) return;
    const drag = cropDragRef.current;
    const nextOffsetX = drag.startOffsetX + (event.clientX - drag.startX);
    const nextOffsetY = drag.startOffsetY + (event.clientY - drag.startY);

    const scale = getAvatarScale(avatarCrop.imageWidth, avatarCrop.imageHeight, avatarCrop.zoom);
    const renderedWidth = avatarCrop.imageWidth * scale;
    const renderedHeight = avatarCrop.imageHeight * scale;
    const maxX = Math.max(0, (renderedWidth - AVATAR_CROP_VIEW_SIZE) / 2);
    const maxY = Math.max(0, (renderedHeight - AVATAR_CROP_VIEW_SIZE) / 2);

    setAvatarCrop((prev) =>
      prev
        ? {
            ...prev,
            offsetX: clamp(nextOffsetX, -maxX, maxX),
            offsetY: clamp(nextOffsetY, -maxY, maxY),
          }
        : prev
    );
  };

  const onCropPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (cropDragRef.current?.pointerId !== event.pointerId) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    cropDragRef.current = null;
  };

  const applyAvatarCrop = async () => {
    if (!avatarCrop || avatarUploading) return;
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error(trKey(locale, "me.avatar.unsupportedFormat")));
        image.src = avatarCrop.previewUrl;
      });

      const scale = getAvatarScale(avatarCrop.imageWidth, avatarCrop.imageHeight, avatarCrop.zoom);
      const renderedWidth = avatarCrop.imageWidth * scale;
      const renderedHeight = avatarCrop.imageHeight * scale;

      const displayStartX = (renderedWidth - AVATAR_CROP_VIEW_SIZE) / 2 - avatarCrop.offsetX;
      const displayStartY = (renderedHeight - AVATAR_CROP_VIEW_SIZE) / 2 - avatarCrop.offsetY;

      const sourceX = clamp((displayStartX / renderedWidth) * avatarCrop.imageWidth, 0, avatarCrop.imageWidth - 1);
      const sourceY = clamp((displayStartY / renderedHeight) * avatarCrop.imageHeight, 0, avatarCrop.imageHeight - 1);
      const sourceWidth = clamp((AVATAR_CROP_VIEW_SIZE / renderedWidth) * avatarCrop.imageWidth, 1, avatarCrop.imageWidth - sourceX);
      const sourceHeight = clamp((AVATAR_CROP_VIEW_SIZE / renderedHeight) * avatarCrop.imageHeight, 1, avatarCrop.imageHeight - sourceY);

      const canvas = document.createElement("canvas");
      canvas.width = AVATAR_CROP_VIEW_SIZE;
      canvas.height = AVATAR_CROP_VIEW_SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error(trKey(locale, "me.uploadFailed"));

      ctx.drawImage(
        img,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        0,
        0,
        AVATAR_CROP_VIEW_SIZE,
        AVATAR_CROP_VIEW_SIZE
      );

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((value) => {
          if (value) resolve(value);
          else reject(new Error(trKey(locale, "me.uploadFailed")));
        }, "image/jpeg", 0.92);
      });
      const croppedFile = new File([blob], `${Date.now()}-avatar.jpg`, { type: "image/jpeg" });
      closeAvatarCrop();
      await uploadAvatarFile(croppedFile);
    } catch (error) {
      setAvatarError(error instanceof Error ? error.message : trKey(locale, "me.uploadFailed"));
    }
  };

  const handleSaveNotifPrefs = () => {
    setNotifError(null);
    try {
      window.localStorage.setItem("taskapp:notif-prefs", JSON.stringify(notifPrefs));
    } catch {
      setNotifError(trKey(locale, "me.notifications.localSaveFailed"));
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
        setNotifError(trKey(locale, "me.notifications.serverSaveFailed"));
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
            themeMode: displayPrefs.themeMode,
          });
        } else {
          await updateMyDisplaySettings({
            syncAcrossDevices: false,
          });
        }
        window.localStorage.setItem("taskapp:display-prefs", JSON.stringify(displayPrefs));
        window.dispatchEvent(new CustomEvent("taskapp:display-prefs-updated", { detail: displayPrefs }));
        if (typeof window !== "undefined") {
          document.cookie = `${LOCALE_COOKIE}=${displayPrefs.language}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax`;
          if (displayPrefs.language !== locale) {
            const nextPath = withLocalePath(window.location.pathname, displayPrefs.language);
            const nextUrl = `${nextPath}${window.location.search}${window.location.hash}`;
            window.location.assign(nextUrl);
          }
        }
        setDisplaySaved(true);
        setTimeout(() => setDisplaySaved(false), 2200);
      } catch {
        alert(trKey(locale, "me.display.saveFailed"));
      }
    });
  };

  const handleExportMyData = () => {
    downloadJson(`task-app-my-data-${new Date().toISOString().slice(0, 10)}.json`, {
      exportedAt: new Date().toISOString(),
      user: { id: user.id, name: displayName, email: user.email, avatar: avatarSrc },
      projects,
      tasks,
    });
  };

  const handleExportPushSubscription = async () => {
    if (!("serviceWorker" in navigator)) {
      alert(trKey(locale, "me.notifications.serviceWorkerUnavailable"));
      return;
    }
    try {
      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.getSubscription();
      if (!subscription) {
        alert(trKey(locale, "me.push.noActiveSubscription"));
        return;
      }
      downloadJson(`task-app-push-subscription-${new Date().toISOString().slice(0, 10)}.json`, {
        exportedAt: new Date().toISOString(),
        endpoint: subscription.endpoint,
        keys: subscription.toJSON().keys ?? null,
      });
    } catch {
      alert(trKey(locale, "me.push.exportFailed"));
    }
  };

  return (
    <main className="mobile-safe-nav-pad max-w-6xl mx-auto overflow-x-clip px-4 sm:px-6 py-8 sm:pb-8">
      <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] gap-6">
        <aside className="lg:sticky lg:top-20 h-fit bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-3 pb-4 border-b border-gray-100 dark:border-gray-700">
            {avatarSrc ? (
              <img src={avatarSrc} alt={displayName} className="w-12 h-12 rounded-full object-cover" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold">
                {initials(displayName)}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-50 truncate">{displayName}</p>
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
            {trKey(locale, "me.backToDashboard")}
          </Link>
        </aside>

        <div className="space-y-6">
          <section id="profil" className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-sm p-5 sm:p-6">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-50 mb-4">{trKey(locale, "common.profile")}</h2>
            <div className="grid grid-cols-1 md:grid-cols-[120px_minmax(0,1fr)] gap-5 items-start">
              <div className="flex flex-col items-center gap-2">
                <button onClick={() => avatarInputRef.current?.click()} className="relative group cursor-pointer" type="button">
                  {avatarSrc ? (
                    <img src={avatarSrc} alt={displayName} className="w-20 h-20 rounded-full object-cover border border-gray-200 dark:border-gray-700" />
                  ) : (
                    <div className="w-20 h-20 rounded-full bg-indigo-600 text-white text-2xl font-bold flex items-center justify-center">
                      {initials(displayName)}
                    </div>
                  )}
                  <span className="absolute inset-0 rounded-full bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
                <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                <p className="text-[11px] text-gray-500 dark:text-gray-400 text-center">JPG, PNG, WebP, GIF, AVIF</p>
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">{trKey(locale, "me.profile.firstName")}</label>
                  <input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full px-3 py-2 text-sm text-gray-900 dark:text-gray-50 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100"
                  />
                </div>
                  <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">{trKey(locale, "me.profile.lastName")}</label>
                  <input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full px-3 py-2 text-sm text-gray-900 dark:text-gray-50 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100"
                  />
                </div>
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
                    {trKey(locale, "common.save")}
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-sm p-5 sm:p-6">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-50 mb-4">{trKey(locale, "common.password")}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">{trKey(locale, "me.password.current")}</label>
                <input
                  type="password"
                  value={currentPwd}
                  onChange={(e) => setCurrentPwd(e.target.value)}
                  className="w-full px-3 py-2 text-sm text-gray-900 dark:text-gray-50 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">{trKey(locale, "me.password.new")}</label>
                <input
                  type="password"
                  value={newPwd}
                  onChange={(e) => setNewPwd(e.target.value)}
                  className="w-full px-3 py-2 text-sm text-gray-900 dark:text-gray-50 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">{trKey(locale, "me.password.confirmation")}</label>
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
                {trKey(locale, "common.update")}
              </button>
            </div>
          </section>

          <section id="notifications" className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-sm p-5 sm:p-6">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-50 mb-4">{trKey(locale, "common.notifications")}</h2>

            <div className="space-y-1 border-b border-gray-100 dark:border-gray-700 pb-3 mb-3">
              <Toggle
                checked={notifPrefs.pushEnabled}
                onChange={(v) => setNotifPrefs((prev) => ({ ...prev, pushEnabled: v }))}
                label={trKey(locale, "me.notifications.pushLabel")}
                description={trKey(locale, "me.notifications.pushDescription")}
              />
              <Toggle
                checked={notifPrefs.emailEnabled}
                onChange={(v) => setNotifPrefs((prev) => ({ ...prev, emailEnabled: v }))}
                label={trKey(locale, "me.notifications.emailLabel")}
              />
            </div>

            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">{trKey(locale, "me.notifications.events")}</p>
            <div className="space-y-1 border-b border-gray-100 dark:border-gray-700 pb-3 mb-3">
              <Toggle checked={notifPrefs.assignment} onChange={(v) => setNotifPrefs((p) => ({ ...p, assignment: v }))} label={trKey(locale, "me.notifications.assignment")} />
              <Toggle checked={notifPrefs.comment} onChange={(v) => setNotifPrefs((p) => ({ ...p, comment: v }))} label={trKey(locale, "me.notifications.comment")} />
              <Toggle checked={notifPrefs.mention} onChange={(v) => setNotifPrefs((p) => ({ ...p, mention: v }))} label={trKey(locale, "me.notifications.mention")} />
              <Toggle checked={notifPrefs.dueSoon} onChange={(v) => setNotifPrefs((p) => ({ ...p, dueSoon: v }))} label={trKey(locale, "me.notifications.dueSoon")} />
              <Toggle checked={notifPrefs.automation} onChange={(v) => setNotifPrefs((p) => ({ ...p, automation: v }))} label={trKey(locale, "me.notifications.automations")} />
              <Toggle checked={notifPrefs.overdue} onChange={(v) => setNotifPrefs((p) => ({ ...p, overdue: v }))} label={trKey(locale, "me.notifications.overdue")} />
              <Toggle checked={notifPrefs.dailySummary} onChange={(v) => setNotifPrefs((p) => ({ ...p, dailySummary: v }))} label={trKey(locale, "me.notifications.dailySummary")} />
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{trKey(locale, "me.notifications.dailySummaryTime")}</label>
                <input
                  type="time"
                  value={notifPrefs.dailySummaryTime}
                  onChange={(e) => setNotifPrefs((p) => ({ ...p, dailySummaryTime: e.target.value }))}
                  className="w-full sm:w-56 datetime-field"
                />
              </div>
            </div>

            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">{trKey(locale, "me.notifications.dnd")}</p>
            <div className="space-y-3">
              <Toggle
                checked={notifPrefs.dndEnabled}
                onChange={(v) => setNotifPrefs((prev) => ({ ...prev, dndEnabled: v }))}
                label={trKey(locale, "me.notifications.silentMode")}
              />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{trKey(locale, "common.start")}</label>
                  <input
                    type="time"
                    value={notifPrefs.dndStart}
                    onChange={(e) => setNotifPrefs((p) => ({ ...p, dndStart: e.target.value }))}
                    className="w-full datetime-field"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{trKey(locale, "common.end")}</label>
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
                label={trKey(locale, "me.notifications.weekendsOnly")}
              />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={openPushManager}
                className="text-sm text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-900/60 rounded-lg px-3 py-2 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors cursor-pointer"
              >
                {trKey(locale, "me.notifications.managePermissions")}
              </button>
              <button
                type="button"
                onClick={sendLocalTestNotification}
                className="text-sm text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer"
              >
                {trKey(locale, "common.test")}
              </button>
              <button
                type="button"
                onClick={handleSaveNotifPrefs}
                className="bg-indigo-600 text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-indigo-700 transition-colors cursor-pointer"
              >
                {trKey(locale, "common.save")}
              </button>
            </div>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-2">
              {trKey(locale, "me.notifications.syncedHint")}
            </p>
            {notifError ? <p className="text-xs text-red-600 mt-1">{notifError}</p> : null}
            {notifSaved ? <p className="text-xs text-green-600 mt-2">{trKey(locale, "me.preferences.saved")}</p> : null}
          </section>

          <section id="affichage" className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-sm p-5 sm:p-6">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-50 mb-4">{trKey(locale, "common.display")}</h2>
            <div className="mb-4 border-b border-gray-100 dark:border-gray-700 pb-4">
              <Toggle
                checked={displayPrefs.syncAcrossDevices}
                onChange={(v) => setDisplayPrefs((p) => ({ ...p, syncAcrossDevices: v }))}
                label={trKey(locale, "me.display.syncAcrossDevices")}
                description={trKey(locale, "me.display.syncAcrossDevicesDescription")}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">{trKey(locale, "me.display.defaultProjectView")}</label>
                <select
                  value={displayPrefs.defaultView}
                  onChange={(e) =>
                    setDisplayPrefs((p) => ({ ...p, defaultView: e.target.value as DisplayPrefs["defaultView"] }))
                  }
                  className="w-full select-unified"
                >
                  <option value="SPREADSHEET">{trKey(locale, "me.display.view.spreadsheet")}</option>
                  <option value="KANBAN">{trKey(locale, "me.display.view.kanban")}</option>
                  <option value="CARDS">{trKey(locale, "me.display.view.cards")}</option>
                  <option value="GANTT">{trKey(locale, "me.display.view.gantt")}</option>
                  <option value="TIMELINE">{trKey(locale, "me.display.view.timeline")}</option>
                  <option value="CALENDAR">{trKey(locale, "me.display.view.calendar")}</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">{trKey(locale, "me.display.density")}</label>
                <select
                  value={displayPrefs.density}
                  onChange={(e) =>
                    setDisplayPrefs((p) => ({ ...p, density: e.target.value as DisplayPrefs["density"] }))
                  }
                  className="w-full select-unified"
                >
                  <option value="comfortable">{trKey(locale, "me.display.density.comfortable")}</option>
                  <option value="compact">{trKey(locale, "me.display.density.compact")}</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">{trKey(locale, "me.display.language")}</label>
                <select
                  value={displayPrefs.language}
                  onChange={(e) =>
                    setDisplayPrefs((p) => ({ ...p, language: e.target.value as DisplayPrefs["language"] }))
                  }
                  className="w-full select-unified"
                >
                  <option value="fr">{trKey(locale, "me.display.language.fr")}</option>
                  <option value="en">{trKey(locale, "me.display.language.en")}</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">{trKey(locale, "me.display.theme")}</label>
                <select
                  value={displayPrefs.themeMode}
                  onChange={(e) =>
                    setDisplayPrefs((p) => ({ ...p, themeMode: e.target.value as DisplayPrefs["themeMode"] }))
                  }
                  className="w-full select-unified"
                >
                  <option value="system">{trKey(locale, "me.display.theme.system")}</option>
                  <option value="light">{trKey(locale, "me.display.theme.light")}</option>
                  <option value="dark">{trKey(locale, "me.display.theme.dark")}</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">{trKey(locale, "me.display.dateFormat")}</label>
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
                  label={trKey(locale, "me.display.mondayFirst")}
                />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={handleSaveDisplayPrefs}
                className="bg-indigo-600 text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-indigo-700 transition-colors cursor-pointer"
              >
                {trKey(locale, "common.apply")}
              </button>
              {displaySaved ? <p className="text-xs text-green-600">{trKey(locale, "me.preferences.saved")}</p> : null}
            </div>
          </section>

          <section id="securite" className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-sm p-5 sm:p-6">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-50 mb-4">{trKey(locale, "common.security")}</h2>
            <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
              <div className="grid grid-cols-3 gap-2 bg-gray-50 dark:bg-gray-900/40 px-3 py-2 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                <span>{trKey(locale, "common.device")}</span>
                <span>{trKey(locale, "common.status")}</span>
                <span>{trKey(locale, "me.security.lastActivity")}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 px-3 py-3 text-sm border-t border-gray-100 dark:border-gray-700">
                <span className="text-gray-800 dark:text-gray-100 truncate">{trKey(locale, "me.security.currentSession")}</span>
                <span className="text-green-600">{trKey(locale, "common.active")}</span>
                <span className="text-gray-500 dark:text-gray-400">{trKey(locale, "me.security.justNow")}</span>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled
                className="text-sm text-gray-400 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 cursor-not-allowed"
                title={trKey(locale, "me.security.backendFeatureToEnable")}
              >
                {trKey(locale, "me.security.signOutOthersSoon")}
              </button>
            </div>
          </section>

          <section id="donnees" className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-sm p-5 sm:p-6">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-50 mb-4">{trKey(locale, "common.data")}</h2>
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleExportMyData}
                  className="text-sm text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                >
                  {trKey(locale, "me.data.exportData")}
                </button>
                <button
                  type="button"
                  onClick={handleExportPushSubscription}
                  className="text-sm text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                >
                  {trKey(locale, "me.data.exportPushSubscription")}
                </button>
              </div>

              <div className="mt-4 rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 p-4">
                <p className="text-sm font-semibold text-red-700 dark:text-red-300">{trKey(locale, "me.data.dangerZone")}</p>
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                  {trKey(locale, "me.data.deleteAccountHint")}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {!dangerConfirm ? (
                    <button
                      type="button"
                      onClick={() => setDangerConfirm(true)}
                      className="text-sm text-red-700 border border-red-300 dark:border-red-800 rounded-lg px-3 py-2 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors cursor-pointer"
                    >
                      {trKey(locale, "me.data.deleteAccount")}
                    </button>
                  ) : (
                    <>
                      <a
                        href="mailto:felix.brossard@studio-n.fr?subject=Suppression%20de%20compte%20Task%20App"
                        className="text-sm text-white bg-red-600 rounded-lg px-3 py-2 hover:bg-red-700 transition-colors"
                      >
                        {trKey(locale, "me.data.confirmByAdminEmail")}
                      </a>
                      <button
                        type="button"
                        onClick={() => setDangerConfirm(false)}
                        className="text-sm text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                      >
                        {trKey(locale, "common.cancel")}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      {avatarCrop ? (
        <div className="fixed inset-0 z-[120] bg-black/55 backdrop-blur-[1px] flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-2xl p-4 sm:p-5">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{trKey(locale, "me.avatar.cropTitle")}</h3>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{trKey(locale, "me.avatar.cropHint")}</p>

            <div className="mt-4 flex justify-center">
              <div
                className="relative overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 touch-none select-none bg-gray-50 dark:bg-gray-800"
                style={{ width: AVATAR_CROP_VIEW_SIZE, height: AVATAR_CROP_VIEW_SIZE }}
                onPointerDown={onCropPointerDown}
                onPointerMove={onCropPointerMove}
                onPointerUp={onCropPointerUp}
                onPointerCancel={onCropPointerUp}
              >
                {(() => {
                  const scale = getAvatarScale(avatarCrop.imageWidth, avatarCrop.imageHeight, avatarCrop.zoom);
                  const renderedWidth = avatarCrop.imageWidth * scale;
                  const renderedHeight = avatarCrop.imageHeight * scale;
                  return (
                    <img
                      src={avatarCrop.previewUrl}
                      alt="avatar crop"
                      draggable={false}
                      className="absolute max-w-none"
                      style={{
                        width: `${renderedWidth}px`,
                        height: `${renderedHeight}px`,
                        left: `calc(50% + ${avatarCrop.offsetX}px)`,
                        top: `calc(50% + ${avatarCrop.offsetY}px)`,
                        transform: "translate(-50%, -50%)",
                      }}
                    />
                  );
                })()}
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">{trKey(locale, "me.avatar.zoom")}</label>
              <input
                type="range"
                min={1}
                max={3}
                step={0.01}
                value={avatarCrop.zoom}
                onChange={(event) => {
                  const zoom = Number(event.target.value);
                  setAvatarCrop((prev) => {
                    if (!prev) return prev;
                    const scale = getAvatarScale(prev.imageWidth, prev.imageHeight, zoom);
                    const renderedWidth = prev.imageWidth * scale;
                    const renderedHeight = prev.imageHeight * scale;
                    const maxX = Math.max(0, (renderedWidth - AVATAR_CROP_VIEW_SIZE) / 2);
                    const maxY = Math.max(0, (renderedHeight - AVATAR_CROP_VIEW_SIZE) / 2);
                    return {
                      ...prev,
                      zoom,
                      offsetX: clamp(prev.offsetX, -maxX, maxX),
                      offsetY: clamp(prev.offsetY, -maxY, maxY),
                    };
                  });
                }}
                className="w-full accent-indigo-600"
              />
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeAvatarCrop}
                className="text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
              >
                {trKey(locale, "common.cancel")}
              </button>
              <button
                type="button"
                onClick={applyAvatarCrop}
                disabled={avatarUploading}
                className="text-sm px-3 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60 cursor-pointer"
              >
                {trKey(locale, "common.save")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
