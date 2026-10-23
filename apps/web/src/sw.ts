/**
 * LexVM service worker (hand-written, no Workbox).
 *
 * Built by the `lexvm-pwa` plugin in vite.config.ts: the plugin transpiles this
 * file and defines __PRECACHE__ (every emitted file, relative to the scope) and
 * __CACHE_NAME__ (derived from a content hash of those files).
 *
 * - install:  precache everything (a failed download fails the install).
 * - activate: delete old LexVM caches, take control of open pages.
 * - fetch:    cache-first for precached same-origin GETs; navigations get the
 *             cached app shell and fall back to cached index.html offline.
 *             Cross-origin requests are never touched or cached.
 * - message:  {type: "SKIP_WAITING"} activates a waiting update.
 */

declare const self: ServiceWorkerGlobalScope;
declare const __PRECACHE__: string[];
declare const __CACHE_NAME__: string;

const CACHE_PREFIX = "lexvm-";
const scope = new URL(self.registration.scope);
const indexUrl = new URL("index.html", scope).href;
const precached = new Set(__PRECACHE__.map((path) => new URL(path, scope).href));

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(__CACHE_NAME__)
      .then((cache) => cache.addAll([...precached].map((href) => new Request(href, { cache: "reload" })))),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== __CACHE_NAME__).map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  const data: unknown = event.data;
  if (typeof data === "object" && data !== null && (data as { type?: unknown }).type === "SKIP_WAITING") {
    void self.skipWaiting();
  }
});

function cacheKey(url: URL): string {
  const copy = new URL(url.href);
  copy.search = "";
  copy.hash = "";
  return copy.href;
}

async function fromCache(key: string): Promise<Response | undefined> {
  const cache = await caches.open(__CACHE_NAME__);
  return cache.match(key);
}

async function cacheFirst(request: Request, key: string): Promise<Response> {
  return (await fromCache(key)) ?? fetch(request);
}

async function navigate(request: Request, key: string): Promise<Response> {
  const target = key === scope.href ? indexUrl : key;
  if (precached.has(target)) {
    const cached = await fromCache(target);
    if (cached) return cached;
  }
  try {
    return await fetch(request);
  } catch (error) {
    const shell = await fromCache(indexUrl);
    if (shell) return shell;
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const key = cacheKey(url);
  if (request.mode === "navigate") {
    event.respondWith(navigate(request, key));
    return;
  }
  if (precached.has(key)) event.respondWith(cacheFirst(request, key));
});

export {};
