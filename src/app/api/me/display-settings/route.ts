import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type DisplaySettings = {
  syncAcrossDevices: boolean;
  defaultView: "SPREADSHEET" | "KANBAN" | "CARDS" | "GANTT" | "TIMELINE" | "CALENDAR";
  density: "compact" | "comfortable";
  mondayFirst: boolean;
  dateFormat: "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD";
  language: "fr" | "en";
  themeMode: "system" | "light" | "dark";
};

const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  syncAcrossDevices: false,
  defaultView: "SPREADSHEET",
  density: "comfortable",
  mondayFirst: true,
  dateFormat: "DD/MM/YYYY",
  language: "fr",
  themeMode: "system",
};

function normalizeSettings(input: Partial<DisplaySettings> | null | undefined): DisplaySettings {
  if (!input) return DEFAULT_DISPLAY_SETTINGS;
  return {
    syncAcrossDevices: Boolean(input.syncAcrossDevices),
    defaultView:
      input.defaultView === "KANBAN" ||
      input.defaultView === "CARDS" ||
      input.defaultView === "GANTT" ||
      input.defaultView === "TIMELINE" ||
      input.defaultView === "CALENDAR"
        ? input.defaultView
        : "SPREADSHEET",
    density: input.density === "compact" ? "compact" : "comfortable",
    mondayFirst: input.mondayFirst === undefined ? true : Boolean(input.mondayFirst),
    dateFormat:
      input.dateFormat === "MM/DD/YYYY" || input.dateFormat === "YYYY-MM-DD"
        ? input.dateFormat
        : "DD/MM/YYYY",
    language: input.language === "en" ? "en" : "fr",
    themeMode: input.themeMode === "light" || input.themeMode === "dark" ? input.themeMode : "system",
  };
}

export async function GET() {
  const session = await auth();
  const user = session?.user as { id?: string } | undefined;
  const userId = user?.id;
  if (!userId) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let rows: Array<{
    syncAcrossDevices: boolean;
    defaultView: string;
    density: string;
    mondayFirst: boolean;
    dateFormat: string;
    language: string;
    themeMode?: string;
  }> = [];
  try {
    rows = await prisma.$queryRawUnsafe<Array<{
      syncAcrossDevices: boolean;
      defaultView: string;
      density: string;
      mondayFirst: boolean;
      dateFormat: string;
      language: string;
      themeMode?: string;
    }>>(
      `SELECT "syncAcrossDevices","defaultView","density","mondayFirst","dateFormat","language","themeMode"
       FROM "UserDisplaySettings"
       WHERE "userId" = ?
       LIMIT 1`,
      userId
    );
  } catch {
    // Legacy DB fallback (themeMode column absent)
    try {
      rows = await prisma.$queryRawUnsafe<Array<{
        syncAcrossDevices: boolean;
        defaultView: string;
        density: string;
        mondayFirst: boolean;
        dateFormat: string;
        language: string;
      }>>(
        `SELECT "syncAcrossDevices","defaultView","density","mondayFirst","dateFormat","language"
         FROM "UserDisplaySettings"
         WHERE "userId" = ?
         LIMIT 1`,
        userId
      );
    } catch {
      rows = [];
    }
  }

  const settings = normalizeSettings((rows[0] as Partial<DisplaySettings> | undefined) ?? null);
  return Response.json({ ok: true, settings });
}
