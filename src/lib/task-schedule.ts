export type DateTimeParts = {
  date: string;
  time: string;
  hasTime: boolean;
};

export type TimelineValue = {
  start?: string;
  end?: string;
};

export const TASK_REMINDER_MINUTES = {
  AT_TIME: 0,
  TWO_MIN: 2,
  FIVE_MIN: 5,
  FIFTEEN_MIN: 15,
  THIRTY_MIN: 30,
} as const;

export function isValidDatePart(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function isValidTimePart(value: string): boolean {
  return /^\d{2}:\d{2}$/.test(value);
}

export function composeDateTimeValue(date: string, time?: string | null): string {
  const normalizedDate = date.trim();
  const normalizedTime = (time ?? "").trim();
  if (!isValidDatePart(normalizedDate)) return "";
  if (!normalizedTime || !isValidTimePart(normalizedTime)) return normalizedDate;
  return `${normalizedDate}T${normalizedTime}`;
}

export function splitDateTimeValue(value: string | null | undefined): DateTimeParts {
  if (!value) return { date: "", time: "", hasTime: false };
  const raw = value.trim();
  if (!raw) return { date: "", time: "", hasTime: false };

  const direct = raw.match(/^(\d{4}-\d{2}-\d{2})(?:[T\s](\d{2}:\d{2}))?/);
  if (direct) {
    return {
      date: direct[1] ?? "",
      time: direct[2] ?? "",
      hasTime: Boolean(direct[2]),
    };
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return { date: "", time: "", hasTime: false };
  const date = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
  const time = `${String(parsed.getHours()).padStart(2, "0")}:${String(parsed.getMinutes()).padStart(2, "0")}`;
  return { date, time, hasTime: true };
}

export function hasExplicitTime(value: string | null | undefined): boolean {
  return splitDateTimeValue(value).hasTime;
}

export function dateKeyFromValue(value: string | null | undefined): string | null {
  const parts = splitDateTimeValue(value);
  return parts.date || null;
}

export function parseTimelineValue(value: string | null | undefined): TimelineValue | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as TimelineValue;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      start: typeof parsed.start === "string" && parsed.start.trim() ? parsed.start.trim() : undefined,
      end: typeof parsed.end === "string" && parsed.end.trim() ? parsed.end.trim() : undefined,
    };
  } catch {
    return null;
  }
}

export function composeTimelineValue(start: string, end: string): string | null {
  const normalizedStart = start.trim();
  const normalizedEnd = end.trim();
  if (!normalizedStart && !normalizedEnd) return null;
  return JSON.stringify({
    start: normalizedStart || undefined,
    end: normalizedEnd || undefined,
  });
}

export function parseDateTimeToDate(value: string | null | undefined): Date | null {
  const parts = splitDateTimeValue(value);
  if (!parts.date) return null;
  return new Date(parts.hasTime ? `${parts.date}T${parts.time}:00` : `${parts.date}T00:00:00`);
}

export function toLocalIsoMinute(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}
