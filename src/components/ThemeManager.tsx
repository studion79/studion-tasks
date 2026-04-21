"use client";

import { useEffect } from "react";

type ThemeMode = "system" | "light" | "dark";

function normalizeThemeMode(value: unknown): ThemeMode {
  if (value === "light" || value === "dark") return value;
  return "system";
}

function readThemeMode(): ThemeMode {
  try {
    const raw = window.localStorage.getItem("taskapp:display-prefs");
    if (!raw) return "system";
    const parsed = JSON.parse(raw) as { themeMode?: unknown };
    return normalizeThemeMode(parsed.themeMode);
  } catch {
    return "system";
  }
}

function applyThemeMode(mode: ThemeMode) {
  const root = document.documentElement;
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  const dark = mode === "dark" || (mode === "system" && prefersDark);

  root.dataset.theme = mode;
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
}

export default function ThemeManager() {
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");

    const sync = () => {
      applyThemeMode(readThemeMode());
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key && event.key !== "taskapp:display-prefs") return;
      sync();
    };

    sync();

    window.addEventListener("storage", onStorage);
    window.addEventListener("taskapp:display-prefs-updated", sync as EventListener);
    media.addEventListener("change", sync);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("taskapp:display-prefs-updated", sync as EventListener);
      media.removeEventListener("change", sync);
    };
  }, []);

  return null;
}
