// ⚠️ Mettre à jour ce numéro à chaque release pour invalider le cache SW
const CACHE_NAME = "task-app-v1.5";

// Assets statiques immuables à précacher (hors HTML)
const PRECACHE_URLS = [
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

// Install — précache uniquement les assets non-HTML
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
});

// Activate — nettoie tous les anciens caches (autre nom = ancienne version)
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Fetch — stratégie :
//   - Pages HTML (navigation) → network only — JAMAIS en cache
//     (les pages contiennent les hashes de server actions qui changent à chaque build)
//   - Assets _next/static/ → cache-first (ces fichiers sont immuables, hash dans l'URL)
//   - API / auth → network only
//   - Icônes / manifest → cache-first
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ne pas intercepter les requêtes cross-origin
  if (url.origin !== self.location.origin) return;

  // API / auth / server actions → network only (jamais intercepté)
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/auth/") ||
    url.pathname.includes("_next/data") ||
    request.method !== "GET"
  ) {
    return;
  }

  // Assets JS/CSS Next.js → network-first
  // En dev (Turbopack), les chunks changent à chaque restart sans changer d'URL.
  // On ne cache JAMAIS les chunks JS/CSS pour éviter les "module factory not available".
  if (url.pathname.startsWith("/_next/static/")) {
    return; // network only — le navigateur gère son propre HTTP cache
  }

  // Icônes et manifest → cache-first
  if (
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest"
  ) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            if (res.ok) {
              const clone = res.clone();
              caches.open(CACHE_NAME).then((c) => c.put(request, clone));
            }
            return res;
          })
      )
    );
    return;
  }

  // Pages HTML → network only, SANS mise en cache
  // Raison : les pages contiennent les hashes de server actions Next.js.
  // Les mettre en cache provoque des erreurs "Server Action not found" après upgrade.
  // Le service worker ne gère pas le fallback offline pour les pages.
});
