"use client";

import { useState, useTransition } from "react";
import { acceptInvitation, registerUser } from "@/lib/actions";
import { signIn } from "next-auth/react";
import { usePathname } from "next/navigation";
import { localeFromPathname, tr } from "@/lib/i18n/client";

interface Props {
  token: string;
  projectName: string;
  invitedEmail: string;
  isLoggedIn: boolean;
  loggedInEmail: string;
  loggedInUserId: string;
  emailMatch: boolean;
}

type Mode = "choice" | "login" | "register";

export default function InviteClient({
  token,
  projectName,
  invitedEmail,
  isLoggedIn,
  loggedInEmail,
  loggedInUserId,
  emailMatch,
}: Props) {
  const pathname = usePathname();
  const locale = localeFromPathname(pathname);
  const [mode, setMode] = useState<Mode>("choice");
  const [name, setName] = useState("");
  const [email, setEmail] = useState(invitedEmail);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  // Cas : connecté mais email différent
  if (isLoggedIn && !emailMatch) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center px-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-8 w-full max-w-sm">
          <ProjectBadge name={projectName} />
          <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
            <p className="font-medium mb-1">{tr(locale, "Email différent", "Different email")}</p>
            <p>
              {tr(locale, "Cette invitation est destinée à", "This invitation is for")} <strong>{invitedEmail}</strong>, {tr(locale, "mais vous êtes connecté avec", "but you are signed in with")} <strong>{loggedInEmail}</strong>.
            </p>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-4 text-center">
            {tr(locale, "Déconnectez-vous puis reconnectez-vous avec le bon compte, ou créez un compte pour", "Sign out, then sign in with the correct account, or create an account for")}{" "}
            <strong>{invitedEmail}</strong>.
          </p>
          <a
            href="/api/auth/signout"
            className="mt-4 block w-full text-center bg-indigo-600 text-white text-sm font-medium py-2.5 rounded-xl hover:bg-indigo-700 transition-colors"
          >
            {tr(locale, "Se déconnecter", "Sign out")}
          </a>
        </div>
      </div>
    );
  }

  // Mode "choice" : non connecté, choisir login ou register
  if (mode === "choice") {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center px-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-8 w-full max-w-sm">
          <ProjectBadge name={projectName} />
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-4 text-center">
            {tr(locale, "Vous avez été invité à rejoindre ce projet.", "You have been invited to join this project.")}
          </p>
          <div className="mt-6 space-y-3">
            <button
              onClick={() => setMode("login")}
              className="w-full bg-indigo-600 text-white text-sm font-medium py-2.5 rounded-xl hover:bg-indigo-700 transition-colors cursor-pointer"
            >
              {tr(locale, "J'ai déjà un compte — Se connecter", "I already have an account — Sign in")}
            </button>
            <button
              onClick={() => setMode("register")}
              className="w-full bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-sm font-medium py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors cursor-pointer"
            >
              {tr(locale, "Créer un compte", "Create an account")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Mode login
  if (mode === "login") {
    const handleLogin = (e: React.FormEvent) => {
      e.preventDefault();
      setError("");
      startTransition(async () => {
        const res = await signIn("credentials", {
          email,
          password,
          redirect: false,
        });
        if (res?.error) {
          setError(tr(locale, "Email ou mot de passe incorrect", "Invalid email or password"));
          return;
        }
        // Rafraîchir la page pour que le serveur reprenne la main
        window.location.reload();
      });
    };

    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center px-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-8 w-full max-w-sm">
          <ProjectBadge name={projectName} />
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-50 mt-5 mb-4">{tr(locale, "Se connecter", "Sign in")}</h2>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                className="w-full px-3 py-2.5 text-sm text-gray-900 dark:text-gray-50 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">{tr(locale, "Mot de passe", "Password")}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-3 py-2.5 text-sm text-gray-900 dark:text-gray-50 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 transition-colors"
              />
            </div>
            {error && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={isPending}
              className="w-full bg-indigo-600 text-white text-sm font-medium py-2.5 rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-60 cursor-pointer"
            >
              {isPending ? tr(locale, "Connexion…", "Signing in...") : tr(locale, "Se connecter et rejoindre", "Sign in and join")}
            </button>
          </form>
          <button
            onClick={() => setMode("choice")}
            className="mt-4 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 w-full text-center cursor-pointer"
          >
            {tr(locale, "← Retour", "← Back")}
          </button>
        </div>
      </div>
    );
  }

  // Mode register
  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    startTransition(async () => {
      try {
        await registerUser(email, name, password, token);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : tr(locale, "Erreur lors de l'inscription", "Error while signing up"));
      }
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center px-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-8 w-full max-w-sm">
        <ProjectBadge name={projectName} />
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-50 mt-5 mb-4">{tr(locale, "Créer mon compte", "Create my account")}</h2>
        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">{tr(locale, "Nom complet", "Full name")}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              className="w-full px-3 py-2.5 text-sm text-gray-900 dark:text-gray-50 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 transition-colors"
              placeholder="Jean Dupont"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2.5 text-sm text-gray-900 dark:text-gray-50 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">{tr(locale, "Mot de passe", "Password")}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full px-3 py-2.5 text-sm text-gray-900 dark:text-gray-50 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 transition-colors"
              placeholder={tr(locale, "Minimum 6 caractères", "Minimum 6 characters")}
            />
          </div>
          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={isPending}
            className="w-full bg-indigo-600 text-white text-sm font-medium py-2.5 rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-60 cursor-pointer"
          >
            {isPending ? tr(locale, "Création…", "Creating...") : tr(locale, "Créer mon compte et rejoindre", "Create my account and join")}
          </button>
        </form>
        <button
          onClick={() => setMode("choice")}
          className="mt-4 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 w-full text-center cursor-pointer"
        >
          {tr(locale, "← Retour", "← Back")}
        </button>
      </div>
    </div>
  );
}

// ── Shared ──────────────────────────────────────────────────────────────────

function ProjectBadge({ name }: { name: string }) {
  const pathname = usePathname();
  const locale = localeFromPathname(pathname);
  return (
    <div className="text-center">
      <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
        <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">{tr(locale, "Projet", "Project")}</p>
      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-50">{name}</h1>
    </div>
  );
}
