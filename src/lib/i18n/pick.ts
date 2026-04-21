export function pickByIsEn(isEn: boolean, fr: string, en: string): string {
  return [fr, en][Number(isEn)] ?? fr;
}

export function pickByLocale(locale: string, fr: string, en: string): string {
  return [fr, en][Number(locale === "en")] ?? fr;
}
