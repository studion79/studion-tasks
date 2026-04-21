import type { AppLocale } from "@/i18n/config";
import type { ColumnType } from "@/lib/types";

type ColumnLike = {
  type: ColumnType;
  label: string;
};

const SYSTEM_COLUMN_LABELS: Record<ColumnType, { fr: string; en: string; aliases: string[] }> = {
  OWNER: {
    fr: "Assigné à",
    en: "Owner",
    aliases: ["assigne a", "assigne", "assignee", "assigned to", "responsable", "owner"],
  },
  STATUS: {
    fr: "Statut",
    en: "Status",
    aliases: ["etat d avancement", "etat", "status", "statut"],
  },
  DUE_DATE: {
    fr: "Date d'échéance",
    en: "Due date",
    aliases: ["date d echeance", "echeance", "due date", "deadline"],
  },
  PRIORITY: {
    fr: "Priorité",
    en: "Priority",
    aliases: ["priorite", "priority"],
  },
  TIMELINE: {
    fr: "Période",
    en: "Timeline",
    aliases: ["periode", "timeline", "time range"],
  },
  BUDGET: {
    fr: "Budget",
    en: "Budget",
    aliases: ["budget"],
  },
  NOTES: {
    fr: "Notes",
    en: "Notes",
    aliases: ["note", "notes"],
  },
};

function normalizeLabel(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function getSystemColumnLabel(type: ColumnType, locale: AppLocale): string {
  const entry = SYSTEM_COLUMN_LABELS[type];
  if (locale === "en") return entry.en;
  return entry.fr;
}

export function getDisplayColumnLabel(column: ColumnLike, locale: AppLocale): string {
  const entry = SYSTEM_COLUMN_LABELS[column.type];
  const raw = (column.label ?? "").trim();
  if (!raw) return getSystemColumnLabel(column.type, locale);

  const normalized = normalizeLabel(raw);
  const known = new Set([
    normalizeLabel(entry.fr),
    normalizeLabel(entry.en),
    ...entry.aliases.map(normalizeLabel),
  ]);

  // Keep user-custom labels untouched, only localize known system defaults/aliases.
  if (!known.has(normalized)) return raw;
  return getSystemColumnLabel(column.type, locale);
}
