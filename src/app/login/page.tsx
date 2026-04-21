"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { trKey } from "@/lib/i18n/client";
import { useClientLocale } from "@/lib/i18n/useClientLocale";

function LoginForm() {
  const router = useRouter();
  const pathname = usePathname();
  const locale = useClientLocale(pathname);
  const params = useSearchParams();
  const registered = params.get("registered");
  const verification = params.get("verification");
  const verified = params.get("verified");
  const nextPath = params.get("next");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await signIn("credentials", {
      email: identifier,
      password,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError(trKey(locale, "auth.invalidCredentials"));
    } else {
      const safeNext = nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/";
      router.push(safeNext);
      router.refresh();
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-8 w-full max-w-sm">
        <div className="mb-6">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center mb-4">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-50">{trKey(locale, "auth.signIn")}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{trKey(locale, "auth.accessProjects")}</p>
        </div>

        {registered && (
          <div className="mb-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
            {trKey(locale, "auth.accountCreatedSignIn")}
          </div>
        )}
        {verification === "sent" && (
          <div className="mb-4 text-sm text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2">
            {trKey(locale, "auth.verificationEmailSent")}
          </div>
        )}
        {verified && (
          <div className="mb-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
            {trKey(locale, "auth.emailVerifiedSignIn")}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">{trKey(locale, "common.username")}</label>
            <input
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
              autoFocus
              className="w-full px-3 py-2.5 text-sm text-gray-900 dark:text-gray-50 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 transition-colors placeholder-gray-400 dark:placeholder-gray-500"
              placeholder={trKey(locale, "auth.adminOrEmailPlaceholder")}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">{trKey(locale, "common.password")}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2.5 text-sm text-gray-900 dark:text-gray-50 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 transition-colors"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 text-white text-sm font-medium py-2.5 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-60 cursor-pointer"
          >
            {loading ? trKey(locale, "auth.signingIn") : trKey(locale, "auth.signIn")}
          </button>
        </form>

        <p className="mt-5 text-center text-xs text-gray-500 dark:text-gray-400">
          {trKey(locale, "auth.noAccountYet")} {" "}
          <a href="/register" className="text-indigo-600 hover:text-indigo-700 font-medium">
            {trKey(locale, "auth.createAccount")}
          </a>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
