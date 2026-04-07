import type { ColumnType } from "@/lib/types";
import type { AppLocale } from "@/i18n/config";

export const STATUS_OPTIONS = [
  { value: "NOT_STARTED", label: "Not started", color: "bg-gray-100 text-gray-600" },
  { value: "WORKING",     label: "Working on it", color: "bg-amber-100 text-amber-800" },
  { value: "DONE",        label: "Done",          color: "bg-green-100 text-green-800" },
  { value: "STUCK",       label: "Stuck",         color: "bg-red-100 text-red-700" },
] as const;

export const PRIORITY_OPTIONS = [
  { value: "LOW",    label: "Low",    color: "bg-blue-50 text-blue-700" },
  { value: "MEDIUM", label: "Medium", color: "bg-yellow-100 text-yellow-700" },
  { value: "HIGH",   label: "High",   color: "bg-red-100 text-red-600" },
] as const;

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
] as const;

export type NotifType = (typeof NOTIF_TYPES)[number]["type"];

export function getNotifTypeLabel(type: NotifType, locale: AppLocale): string {
  const isEn = locale === "en";
  switch (type) {
    case "TASK_ASSIGNED":
      return isEn ? "Task assigned" : "Tâche assignée";
    case "COMMENT_ADDED":
      return isEn ? "New comment" : "Nouveau commentaire";
    case "MENTIONED":
      return "Mention (@)";
    case "DUE_DATE_SOON":
      return isEn ? "Due soon" : "Échéance proche";
    case "OVERDUE":
      return isEn ? "Overdue" : "Échéance dépassée";
    case "DAILY_SUMMARY":
      return isEn ? "Daily summary" : "Résumé quotidien";
    case "AUTOMATION":
      return isEn ? "Automations" : "Automatisations";
    default:
      return type;
  }
}
