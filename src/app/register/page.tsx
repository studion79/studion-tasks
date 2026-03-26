"use client";

import { useState, useTransition } from "react";
import { registerUser } from "@/lib/actions";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    startTransition(async () => {
      try {
        await registerUser(email, name, password);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Erreur lors de l'inscription");
      }
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 w-full max-w-sm">
        <div className="mb-6">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center mb-4">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900">Créer un compte</h1>
          <p className="text-sm text-gray-500 mt-1">Rejoignez votre espace de travail</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Nom complet</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 transition-colors"
              placeholder="Jean Dupont"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 transition-colors"
              placeholder="vous@exemple.com"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Mot de passe</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 transition-colors"
              placeholder="Minimum 6 caractères"
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
            className="w-full bg-indigo-600 text-white text-sm font-medium py-2.5 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-60 cursor-pointer"
          >
            {isPending ? "Création…" : "Créer mon compte"}
          </button>
        </form>

        <p className="mt-5 text-center text-xs text-gray-500">
          Déjà un compte ?{" "}
          <a href="/login" className="text-indigo-600 hover:text-indigo-700 font-medium">
            Se connecter
          </a>
        </p>
      </div>
    </div>
  );
}
