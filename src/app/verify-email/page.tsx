import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { verifyEmailToken } from "@/lib/email-verification";
import { pickByLocale } from "@/lib/i18n/pick";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams?: Promise<{ token?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const token = typeof params.token === "string" ? params.token : "";
  const headerStore = await headers();
  const locale = headerStore.get("x-taskapp-locale") === "en" ? "en" : "fr";
  const result = await verifyEmailToken(token);

  if (result.ok) {
    const next = result.nextPath && result.nextPath !== "/" ? `&next=${encodeURIComponent(result.nextPath)}` : "";
    redirect(`/login?verified=1${next}`);
  }

  const title =
    result.reason === "expired"
      ? pickByLocale(locale, "Lien expiré", "Link expired")
      : pickByLocale(locale, "Lien invalide", "Invalid link");
  const body =
    result.reason === "expired"
      ? pickByLocale(
          locale,
          "Ce lien de confirmation a expiré. Vous pouvez recommencer la création de compte pour recevoir un nouveau lien.",
          "This confirmation link has expired. You can register again to receive a new link."
        )
      : pickByLocale(
          locale,
          "Ce lien de confirmation est invalide ou a déjà été utilisé.",
          "This confirmation link is invalid or has already been used."
        );

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-900">
      <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300">
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
          </svg>
        </div>
        <h1 className="text-lg font-bold text-gray-900 dark:text-gray-50">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">{body}</p>
        <Link href="/register" className="mt-6 inline-flex rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700">
          {pickByLocale(locale, "Créer un compte", "Create an account")}
        </Link>
      </div>
    </div>
  );
}
