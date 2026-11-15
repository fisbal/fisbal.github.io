// TechFix as an installed web app (Chrome / Edge on Linux, ChromeOS, Windows, Mac, Android).
// Network first, so every visit gets the newest TechFix (it updates itself like the other apps);
// the last good copy is kept so TechFix still opens offline.
const CACHE = "techfix-web-v1";
self.addEventListener("install", (e) => { self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(fetch(req).then((res) => {
    if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {}); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match("./index.html"))));
});
