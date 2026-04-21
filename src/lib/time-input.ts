function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function isValid(h: number, m: number): boolean {
  return Number.isFinite(h) && Number.isFinite(m) && h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

function normalizeExact(raw: string): string {
  const match = raw.match(/^(\d{1,2}):(\d{1,2})$/);
  if (!match) return "";
  const h = Number.parseInt(match[1], 10);
  const m = Number.parseInt(match[2], 10);
  if (!isValid(h, m)) return "";
  return `${pad2(h)}:${pad2(m)}`;
}

export function normalizeTimeInput(rawInput: string, fallbackTime = ""): string {
  const raw = rawInput.trim();
  const fallback = normalizeExact(fallbackTime);
  if (!raw) return fallback || "";

  const exact = normalizeExact(raw);
  if (exact) return exact;

  const hourOnly = raw.match(/^(\d{1,2})$/);
  if (!hourOnly) return fallback || "";

  const h = Number.parseInt(hourOnly[1], 10);
  if (!Number.isFinite(h) || h < 0 || h > 23) return fallback || "";
  const fallbackMinute = fallback ? Number.parseInt(fallback.slice(3, 5), 10) : 0;
  return `${pad2(h)}:${pad2(fallbackMinute)}`;
}
