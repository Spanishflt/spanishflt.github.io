const CACHE = "basic-spanish-v94";
const AUDIO_CACHE = "basic-spanish-audio";
const FILES = ["./", "./index.html", "./manifest.json", "./icons/icon-192.png", "./icons/icon-512.png"];
const isAudio = url => /\/audio\/[^\/]+\.mp3$/i.test(new URL(url).pathname);

self.addEventListener("install", e => {
  // always take the files fresh from the server, never from the browser's HTTP cache
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(u => new Request(u, {cache: "reload"})))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const audio = await caches.open(AUDIO_CACHE);
    for (const k of await caches.keys()) {
      if (k === CACHE || k === AUDIO_CACHE) continue;
      const old = await caches.open(k);
      for (const req of await old.keys()) {
        if (isAudio(req.url) && !(await audio.match(req, {ignoreSearch: true}))) {
          const res = await old.match(req);
          if (res) await audio.put(req, res);
        }
      }
      await caches.delete(k);
    }
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (isAudio(e.request.url)) {
    e.respondWith(caches.open(AUDIO_CACHE).then(c => c.match(e.request, {ignoreSearch: true}).then(hit => hit || fetch(e.request).then(res => {
      if (res && res.ok) c.put(e.request, res.clone());
      return res;
    }))));
    return;
  }
  // the app page: try the network first (fresh), fall back to the saved copy when offline or slow
  const appPage = url.origin === self.location.origin && /^\/(index\.html)?$/.test(url.pathname);
  // other pages of the site (like promo.html): always from the internet, saved copy only when offline
  if (e.request.mode === "navigate" && !appPage) {
    e.respondWith(fetch(e.request, {cache: "no-cache"}).then(res => {
      if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, {ignoreSearch: true}).then(hit => hit || caches.match("./index.html"))));
    return;
  }
  if (appPage) {
    e.respondWith((async () => {
      const cached = await caches.match("./index.html");
      try {
        const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), cached ? 4000 : 15000);
        const res = await fetch(new Request("./index.html", {cache: "no-cache", signal: ctrl.signal}));
        clearTimeout(t);
        if (res && res.ok) { const c = await caches.open(CACHE); c.put("./index.html", res.clone()); return res; }
        return cached || res;
      } catch (err) { return cached || Response.error(); }
    })());
    return;
  }
  // everything else: answer from the phone and refresh it in the background
  e.respondWith(
    caches.match(e.request, {ignoreSearch: true}).then(hit => {
      const net = fetch(e.request, {cache: "no-cache"}).then(res => {
        if (res && (res.ok || res.type === "opaque")) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
