import type { AppLocale } from "@/i18n/config";

export function localeFromPathname(pathname: string | null | undefined): AppLocale {
  const segment = (pathname ?? "").split("/")[1] ?? "";
  return segment === "en" ? "en" : "fr";
}

export function tr(locale: AppLocale, fr: string, en: string): string {
  return locale === "en" ? en : fr;
}
