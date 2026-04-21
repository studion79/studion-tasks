import type { AppLocale } from "@/i18n/config";
import { tKey, type MessageKey } from "@/lib/i18n/messages";

export function localeFromPathname(pathname: string | null | undefined): AppLocale {
  const segment = (pathname ?? "").split("/")[1] ?? "";
  return segment === "en" ? "en" : "fr";
}

export function localeFromDisplayPrefs(): AppLocale | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem("taskapp:display-prefs");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { language?: unknown };
    return parsed.language === "en" ? "en" : "fr";
  } catch {
    return null;
  }
}

export function resolveClientLocale(pathname: string | null | undefined): AppLocale {
  return localeFromDisplayPrefs() ?? localeFromPathname(pathname);
}

export function tr(locale: AppLocale, fr: string, en: string): string {
  if (locale === "en") return en;
  return fr;
}

export function trKey(locale: AppLocale, key: MessageKey): string {
  return tKey(locale, key);
}
