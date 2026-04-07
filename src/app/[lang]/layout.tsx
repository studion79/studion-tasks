import { notFound } from "next/navigation";
import { SUPPORTED_LOCALES, type AppLocale } from "@/i18n/config";

export async function generateStaticParams() {
  return SUPPORTED_LOCALES.map((lang) => ({ lang }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!SUPPORTED_LOCALES.includes(lang as AppLocale)) notFound();
  return children;
}
