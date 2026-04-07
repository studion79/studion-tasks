import { prisma } from "@/lib/db";
import { DEFAULT_LOCALE, isLocale, type AppLocale } from "@/i18n/config";

export type DailySummaryInput = {
  activeTasks: number;
  dueTodayCount: number;
  blockedCount: number;
  todayTasks: string[];
};

function extractLocaleFromCookie(cookieHeader: string | null): AppLocale | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";").map((v) => v.trim());
  for (const part of parts) {
    if (!part.startsWith("taskapp_locale=")) continue;
    const raw = decodeURIComponent(part.slice("taskapp_locale=".length)).trim().toLowerCase();
    if (isLocale(raw)) return raw;
  }
  return null;
}

export function normalizeLocale(value: unknown): AppLocale {
  if (typeof value !== "string") return DEFAULT_LOCALE;
  const lowered = value.trim().toLowerCase();
  return isLocale(lowered) ? lowered : DEFAULT_LOCALE;
}

export function getRequestLocale(request?: Request): AppLocale {
  if (!request) return DEFAULT_LOCALE;
  const headerLocale = request.headers.get("x-taskapp-locale");
  if (headerLocale) return normalizeLocale(headerLocale);

  const cookieLocale = extractLocaleFromCookie(request.headers.get("cookie"));
  if (cookieLocale) return cookieLocale;

  const acceptLanguage = request.headers.get("accept-language")?.toLowerCase() ?? "";
  if (acceptLanguage.includes("en")) return "en";
  if (acceptLanguage.includes("fr")) return "fr";
  return DEFAULT_LOCALE;
}

export async function getUserLocale(userId: string): Promise<AppLocale> {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ language: string }>>(
      `SELECT "language" FROM "UserDisplaySettings" WHERE "userId" = ? LIMIT 1`,
      userId
    );
    return normalizeLocale(rows[0]?.language);
  } catch {
    return DEFAULT_LOCALE;
  }
}

export function formatDueSoonMessage(locale: AppLocale, taskTitle: string, daysUntil: number): string {
  if (locale === "en") {
    if (daysUntil === 0) return `"${taskTitle}" is due today`;
    return `"${taskTitle}" is due in ${daysUntil} day${daysUntil > 1 ? "s" : ""}`;
  }
  if (daysUntil === 0) return `"${taskTitle}" est à rendre aujourd'hui`;
  return `"${taskTitle}" est à rendre dans ${daysUntil} jour${daysUntil > 1 ? "s" : ""}`;
}

export function formatOverdueMessage(locale: AppLocale, taskTitle: string): string {
  if (locale === "en") return `Task "${taskTitle}" is past due.`;
  return `La tâche "${taskTitle}" a dépassé sa date d'échéance.`;
}

export function formatDailySummary(locale: AppLocale, input: DailySummaryInput): string {
  const { activeTasks, dueTodayCount, blockedCount, todayTasks } = input;
  if (locale === "en") {
    const summaryLine = `${activeTasks} tasks to follow, ${dueTodayCount} due today, ${blockedCount} blocker${blockedCount > 1 ? "s" : ""}.`;
    const detailsBlock = todayTasks.length === 0
      ? "Today task details:\n- No tasks due today."
      : `Today task details:\n${todayTasks.map((title) => `- ${title}`).join("\n")}`;
    return `${summaryLine}\n\n${detailsBlock}`;
  }
  const summaryLine = `${activeTasks} tâches à suivre, ${dueTodayCount} échéance${dueTodayCount > 1 ? "s" : ""} aujourd'hui, ${blockedCount} point${blockedCount > 1 ? "s" : ""} bloquant${blockedCount > 1 ? "s" : ""}.`;
  const detailsBlock = todayTasks.length === 0
    ? "Détail des tâches du jour:\n- Aucune tâche avec échéance aujourd'hui."
    : `Détail des tâches du jour:\n${todayTasks.map((title) => `- ${title}`).join("\n")}`;
  return `${summaryLine}\n\n${detailsBlock}`;
}
