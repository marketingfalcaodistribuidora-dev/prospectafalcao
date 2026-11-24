/* Service worker: deixa o app abrir sem internet (na estrada). Nunca mexe nas marcações do usuário. */
const VERSAO = "v1";
const CACHE = "prospeccao-falcao-" + VERSAO;
const ARQUIVOS = [
  "./",
  "index.html",
  "style.css",
  "app.js",
  "manifest.webmanifest",
  "icon-192.png",
  "icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(ARQUIVOS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((ks) =>
        Promise.all(
          ks
            .filter((k) => k.startsWith("prospeccao-falcao-") && k !== CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// dados e páginas: tenta a rede e, sem internet, usa o que está guardado
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin)
    return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copia = res.clone();
        if (res.ok) caches.open(CACHE).then((c) => c.put(req, copia));
        return res;
      })
      .catch(() =>
        caches.match(req).then((r) => r || caches.match("index.html")),
      ),
  );
});
