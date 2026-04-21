"use client";

import { useEffect, useState } from "react";
import type { AppLocale } from "@/i18n/config";
import { resolveClientLocale } from "@/lib/i18n/client";

export function useClientLocale(pathname: string | null | undefined): AppLocale {
  const [locale, setLocale] = useState<AppLocale>(() => resolveClientLocale(pathname));

  useEffect(() => {
    setLocale(resolveClientLocale(pathname));
  }, [pathname]);

  useEffect(() => {
    const sync = () => setLocale(resolveClientLocale(pathname));
    const onStorage = (event: StorageEvent) => {
      if (event.key && event.key !== "taskapp:display-prefs") return;
      sync();
    };
    window.addEventListener("taskapp:display-prefs-updated", sync);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("taskapp:display-prefs-updated", sync);
      window.removeEventListener("storage", onStorage);
    };
  }, [pathname]);

  return locale;
}
