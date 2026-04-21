// ⚠️ Mettre à jour ce numéro à chaque release pour invalider le cache SW
const CACHE_NAME = "task-app-v1.8";

// Assets statiques immuables à précacher (hors HTML)
const PRECACHE_URLS = [
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

const BADGE_CACHE = "task-app-badge";
const BADGE_COUNT_KEY = "/__badge_count__";

async function readBadgeCount() {
  try {
    const cache = await caches.open(BADGE_CACHE);
    const response = await cache.match(BADGE_COUNT_KEY);
    if (!response) return 0;
    const payload = await response.json();
    const count = Number(payload?.count ?? 0);
    return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  } catch {
    return 0;
  }
}

async function writeBadgeCount(count) {
  try {
    const safeCount = Math.max(0, Math.floor(Number(count) || 0));
    const cache = await caches.open(BADGE_CACHE);
    await cache.put(
      BADGE_COUNT_KEY,
      new Response(JSON.stringify({ count: safeCount }), {
        headers: { "Content-Type": "application/json" },
      })
    );
  } catch {
    // ignore
  }
}

async function applyAppBadge(count) {
  const safeCount = Math.max(0, Math.floor(Number(count) || 0));
  try {
    const nav = self.navigator;
    if (nav && typeof nav.setAppBadge === "function") {
      if (safeCount > 0) await nav.setAppBadge(safeCount);
      else if (typeof nav.clearAppBadge === "function") await nav.clearAppBadge();
      else await nav.setAppBadge(0);
      return;
    }
  } catch {
    // continue fallback
  }

  try {
    if (self.registration && typeof self.registration.setAppBadge === "function") {
      if (safeCount > 0) await self.registration.setAppBadge(safeCount);
      else if (typeof self.registration.clearAppBadge === "function") await self.registration.clearAppBadge();
      else await self.registration.setAppBadge(0);
    }
  } catch {
    // ignore unsupported API/runtime
  }
}

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

self.addEventListener("push", (event) => {
  let data = {
    title: "Mise à jour d'équipe",
    body: "Ouvrez l'application pour consulter les changements.",
    url: "/",
    tag: "task-app",
    actions: [{ action: "open", title: "Ouvrir" }],
  };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // ignore malformed payload
  }
  event.waitUntil((async () => {
    const currentCount = await readBadgeCount();
    const nextCount = currentCount + 1;
    await writeBadgeCount(nextCount);
    await applyAppBadge(nextCount);

    await self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: data.tag || "task-app",
      renotify: false,
      actions: Array.isArray(data.actions) ? data.actions.slice(0, 2) : [],
      data: { url: data.url || "/" },
    });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const action = event.action || "open";
  if (action !== "open") return;
  const targetUrl = event.notification?.data?.url || "/";
  event.waitUntil((async () => {
    const currentCount = await readBadgeCount();
    const nextCount = Math.max(0, currentCount - 1);
    await writeBadgeCount(nextCount);
    await applyAppBadge(nextCount);

    return clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        const clientUrl = "url" in client ? client.url : "";
        if ("focus" in client && clientUrl) {
          const existing = new URL(clientUrl);
          const target = new URL(targetUrl, self.location.origin);
          if (existing.origin === target.origin) {
            client.navigate?.(target.href);
            return client.focus();
          }
        }
      }
      return clients.openWindow(targetUrl);
    });
  })());
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || typeof data !== "object") return;
  if (data.type !== "TASKAPP_BADGE_SYNC") return;

  const count = Number(data.count ?? 0);
  event.waitUntil((async () => {
    await writeBadgeCount(count);
    await applyAppBadge(count);
  })());
});
