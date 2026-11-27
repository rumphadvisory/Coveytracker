/* CoveyTracker service worker: lets the installed app open with no signal.
 * - Page navigations: network first, fall back to the last cached copy of that page.
 * - Build assets (/_next/static), icons, fonts: cache first (they're content-hashed).
 * - Supabase, Open-Meteo, map tiles and anything else cross-origin: untouched.
 * Pages are static shells (data loads client-side), so cached HTML holds no user data.
 */
const VERSION = "v1";
const PAGES = `ct-pages-${VERSION}`;
const ASSETS = `ct-assets-${VERSION}`;
const MAX_ASSETS = 250;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([PAGES, ASSETS]);
      for (const k of await caches.keys()) if (!keep.has(k)) await caches.delete(k);
      await self.clients.claim();
    })(),
  );
});

// The app asks us to pre-cache key pages once the user is signed in.
self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "warm" && Array.isArray(data.urls)) {
    event.waitUntil(
      (async () => {
        const cache = await caches.open(PAGES);
        await Promise.all(
          data.urls.map(async (u) => {
            try {
              const res = await fetch(u, { credentials: "same-origin" });
              if (res.ok && !res.redirected) await cache.put(u, res);
            } catch {}
          }),
        );
      })(),
    );
  }
  if (data.type === "warm" && Array.isArray(data.assets)) {
    event.waitUntil(
      (async () => {
        const cache = await caches.open(ASSETS);
        await Promise.all(
          data.assets.map(async (u) => {
            try {
              if (await cache.match(u)) return;
              const res = await fetch(u, { mode: new URL(u).origin === self.location.origin ? "same-origin" : "cors" });
              if (res.ok) await cache.put(u, res);
            } catch {}
          }),
        );
      })(),
    );
  }
  if (data.type === "clear") {
    event.waitUntil(caches.delete(PAGES));
  }
});

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Google Fonts (icons + text) — cache first so icons render offline.
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(cacheFirst(req));
    return;
  }
  if (url.origin !== self.location.origin) return;

  // Next.js client-side navigation payloads: let them fail offline; the router falls back to a full load.
  if (req.headers.get("RSC") === "1" || url.searchParams.has("_rsc")) return;

  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(PAGES);
        const key = url.pathname;
        try {
          const res = await fetch(req);
          if (res.ok && !res.redirected) cache.put(key, res.clone());
          return res;
        } catch {
          return (
            (await cache.match(key)) ||
            (await cache.match("/field")) ||
            new Response(
              "<h1 style='font-family:sans-serif;padding:24px'>No signal</h1><p style='font-family:sans-serif;padding:0 24px'>Open CoveyTracker once with signal so it can work offline.</p>",
              { headers: { "content-type": "text/html" }, status: 503 },
            )
          );
        }
      })(),
    );
    return;
  }

  if (
    url.pathname.startsWith("/_next/static/") ||
    /\.(png|svg|ico|webp|woff2?)$/.test(url.pathname) ||
    url.pathname === "/manifest.json"
  ) {
    event.respondWith(cacheFirst(req));
  }
});

async function cacheFirst(req) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === "opaque") {
    cache.put(req, res.clone());
    trim(ASSETS, MAX_ASSETS);
  }
  return res;
}
