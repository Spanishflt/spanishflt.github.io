const CACHE = "basic-spanish-v66";
const AUDIO_CACHE = "basic-spanish-audio";
const FILES = ["./", "./index.html", "./manifest.json", "./icons/icon-192.png", "./icons/icon-512.png"];
const isAudio = url => /\/audio\/[^\/]+\.mp3$/i.test(new URL(url).pathname);

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const audio = await caches.open(AUDIO_CACHE);
    for (const k of await caches.keys()) {
      if (k === CACHE || k === AUDIO_CACHE) continue;
      // keep the audio an older version already downloaded, then drop the old cache
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
  if (isAudio(e.request.url)) {
    // audio files never change (each version has its own name): download once, then always from the phone
    e.respondWith(caches.open(AUDIO_CACHE).then(c => c.match(e.request, {ignoreSearch: true}).then(hit => hit || fetch(e.request).then(res => {
      if (res && res.ok) c.put(e.request, res.clone());
      return res;
    }))));
    return;
  }
  // the app itself: answer from the phone, and quietly check for a newer version
  e.respondWith(
    caches.match(e.request, {ignoreSearch: true}).then(hit => {
      const net = fetch(e.request).then(res => {
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
