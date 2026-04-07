export function getUiLocale(): string {
  if (typeof window === "undefined") return "fr-FR";
  try {
    const raw = window.localStorage.getItem("taskapp:display-prefs");
    if (!raw) return "fr-FR";
    const parsed = JSON.parse(raw) as { language?: unknown };
    return parsed.language === "en" ? "en-US" : "fr-FR";
  } catch {
    return "fr-FR";
  }
}

