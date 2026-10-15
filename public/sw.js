// Service worker mínimo do Governanta: guarda só o "app shell" para a PWA abrir sem rede.
// Dados da API nunca são cacheados aqui (outra origem, e a lista precisa ser fresca).
const CACHE = "governanta-shell-v4";
// Modelo de voz (Whisper, 80–300 MB) baixado pelo transformers.js: nunca apagar numa atualização.
const KEEP = new Set([CACHE, "transformers-cache"]);
const SHELL = ["/", "/lista", "/previsoes", "/planejar", "/historico", "/escanear", "/configuracoes", "/despensa", "/perguntar", "/manifest.webmanifest", "/icons/icon.svg", "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !KEEP.has(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  // Páginas: rede primeiro (sempre a versão nova), cache se offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(url.pathname, copy));
          return res;
        })
        .catch(() => caches.match(url.pathname).then((hit) => hit || caches.match("/"))),
    );
    return;
  }

  // Assets com hash do Next são imutáveis: cache primeiro.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/voice/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});
