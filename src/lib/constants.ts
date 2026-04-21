import type { ColumnType } from "@/lib/types";
import type { AppLocale } from "@/i18n/config";
import { pickByIsEn } from "@/lib/i18n/pick";

export const STATUS_OPTIONS = [
  { value: "NOT_STARTED", label: "Not started", color: "bg-gray-100 text-gray-600" },
  { value: "WORKING",     label: "Working on it", color: "bg-amber-100 text-amber-800" },
  { value: "DONE",        label: "Done",          color: "bg-green-100 text-green-800" },
  { value: "STUCK",       label: "Stuck",         color: "bg-red-100 text-red-700" },
] as const;

export function getStatusLabelByLocale(value: string, locale: AppLocale): string {
  const isEn = locale === "en";
  if (value === "NOT_STARTED") return pickByIsEn(isEn, "Pas commencé", "Not started");
  if (value === "WORKING") return pickByIsEn(isEn, "En cours", "Working on it");
  if (value === "DONE") return pickByIsEn(isEn, "Terminé", "Done");
  if (value === "STUCK") return pickByIsEn(isEn, "Bloqué", "Stuck");
  return value;
}

export function getStatusOptions(locale: AppLocale) {
  return STATUS_OPTIONS.map((opt) => ({
    ...opt,
    label: getStatusLabelByLocale(opt.value, locale),
  }));
}

export const PRIORITY_OPTIONS = [
  { value: "LOW",    label: "Low",    color: "bg-blue-50 text-blue-700" },
  { value: "MEDIUM", label: "Medium", color: "bg-yellow-100 text-yellow-700" },
  { value: "HIGH",   label: "High",   color: "bg-red-100 text-red-600" },
] as const;

export function getPriorityLabelByLocale(value: string, locale: AppLocale): string {
  const isEn = locale === "en";
  if (value === "LOW") return pickByIsEn(isEn, "Basse", "Low");
  if (value === "MEDIUM") return pickByIsEn(isEn, "Moyenne", "Medium");
  if (value === "HIGH") return pickByIsEn(isEn, "Haute", "High");
  return value;
}

export function getPriorityOptions(locale: AppLocale) {
  return PRIORITY_OPTIONS.map((opt) => ({
    ...opt,
    label: getPriorityLabelByLocale(opt.value, locale),
  }));
}

export const COLUMN_WIDTHS: Partial<Record<ColumnType, number>> = {
  OWNER:    140,
  STATUS:   150,
  DUE_DATE: 130,
  PRIORITY: 110,
  TIMELINE: 200,
  BUDGET:   110,
  NOTES:    200,
};

export const NOTIF_TYPES = [
  { type: "TASK_ASSIGNED" },
  { type: "COMMENT_ADDED" },
  { type: "MENTIONED" },
  { type: "DUE_DATE_SOON" },
  { type: "OVERDUE" },
  { type: "DAILY_SUMMARY" },
  { type: "AUTOMATION" },
  { type: "INVITATION" },
] as const;

export type NotifType = (typeof NOTIF_TYPES)[number]["type"];

export function getNotifTypeLabel(type: NotifType, locale: AppLocale): string {
  const isEn = locale === "en";
  switch (type) {
    case "TASK_ASSIGNED":
      return pickByIsEn(isEn, "Tâche assignée", "Task assigned");
    case "COMMENT_ADDED":
      return pickByIsEn(isEn, "Nouveau commentaire", "New comment");
    case "MENTIONED":
      return "Mention (@)";
    case "DUE_DATE_SOON":
      return pickByIsEn(isEn, "Échéance proche", "Due soon");
    case "OVERDUE":
      return pickByIsEn(isEn, "Échéance dépassée", "Overdue");
    case "DAILY_SUMMARY":
      return pickByIsEn(isEn, "Résumé quotidien", "Daily summary");
    case "AUTOMATION":
      return pickByIsEn(isEn, "Automatisations", "Automations");
    case "INVITATION":
      return pickByIsEn(isEn, "Invitation", "Invitation");
    default:
      return type;
  }
}
