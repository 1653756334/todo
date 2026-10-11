/* Self-hosted multi-user PWA: cache only static assets and the public offline page.
 * Never cache personal HTML, RSC, API responses or imported images. Activation
 * removes all legacy page snapshots before taking control of existing clients. */
const VERSION = "2026-10-10.4";
const STATIC_CACHE = `todo-static-${VERSION}`;
const OFFLINE_CACHE = `todo-offline-${VERSION}`;
const KEEP = [STATIC_CACHE, OFFLINE_CACHE];
self.addEventListener("install", event => event.waitUntil((async () => {
  const cache = await caches.open(OFFLINE_CACHE);
  await cache.addAll(["/offline", "/favicon.ico", "/icons/icon-192.png", "/icons/icon-512.png"]);
})()));
self.addEventListener("activate", event => event.waitUntil((async () => {
  await Promise.all((await caches.keys()).filter(k => k.startsWith("todo-") && !KEEP.includes(k)).map(k => caches.delete(k)));
  await self.clients.claim();
})()));
self.addEventListener("message", event => { if (event.data?.type === "SKIP_WAITING") self.skipWaiting(); });
self.addEventListener("fetch", event => {
  const r = event.request, url = new URL(r.url);
  if (r.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/") || url.searchParams.has("_rsc")) return;
  if (r.mode === "navigate") {
    event.respondWith((async () => {
      try { const result = await fetch(r, { signal: AbortSignal.timeout(10000) }); if (![502,503,504].includes(result.status)) return result; } catch {}
      return await (await caches.open(OFFLINE_CACHE)).match("/offline") ?? Response.error();
    })()); return;
  }
  if (!(url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || ["/favicon.ico","/favicon.svg","/apple-touch-icon.png"].includes(url.pathname))) return;
  event.respondWith((async () => {
    const cache = await caches.open(STATIC_CACHE), existing = await cache.match(r);
    if (existing) return existing;
    const result = await fetch(r);
    if (result.ok && result.type === "basic") await cache.put(r, result.clone());
    return result;
  })());
});
