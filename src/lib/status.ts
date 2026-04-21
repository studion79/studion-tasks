import type { AppLocale } from "@/i18n/config";
import { getStatusLabelByLocale } from "@/lib/constants";

export function toCanonicalStatus(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toUpperCase().replace(/[\s-]+/g, "_");

  if (normalized === "DONE") return "DONE";
  if (normalized === "NOT_STARTED" || normalized === "NOTSTARTED") return "NOT_STARTED";
  if (normalized === "WORKING" || normalized === "IN_PROGRESS" || normalized === "WORKING_ON_IT") return "WORKING";
  if (normalized === "STUCK") return "STUCK";
  if (normalized === "IN_REVIEW" || normalized === "INREVIEW") return "IN_REVIEW";
  if (normalized === "WAITING") return "WAITING";

  return normalized;
}

export function isDoneStatus(value: string | null | undefined): boolean {
  return toCanonicalStatus(value) === "DONE";
}

export function getStatusLabel(value: string | null | undefined, locale: AppLocale = "en"): string | null {
  const canonical = toCanonicalStatus(value);
  if (!canonical) return null;

  if (canonical === "NOT_STARTED" || canonical === "WORKING" || canonical === "DONE" || canonical === "STUCK") {
    return getStatusLabelByLocale(canonical, locale);
  }
  if (canonical === "IN_REVIEW") return "In review";
  if (canonical === "WAITING") return "Waiting";

  return value ?? canonical;
}
