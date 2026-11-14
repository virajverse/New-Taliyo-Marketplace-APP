const STATIC_CACHE = 'taliyo-static-v2';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;

  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (data.type === 'CLEAR_CACHES') {
    event.waitUntil(
      (async () => {
        try {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        } catch {}
      })(),
    );
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(
          keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k)),
        );
      } catch {}
      try {
        await self.clients.claim();
      } catch {}
    })(),
  );
});

// Cache hashed /_next/static/ bundles & static image assets with SWR so repeat loads skip re-downloading,
// while HTML routes and /api/* stay 100% live on the network.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }

  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  const isStaticAsset =
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/icons/');

  if (!isStaticAsset) return;

  event.respondWith(
    (async () => {
      try {
        const cache = await caches.open(STATIC_CACHE);
        const cached = await cache.match(req);

        const networkFetch = fetch(req)
          .then((res) => {
            if (res && res.ok && res.status === 200) {
              cache.put(req, res.clone()).catch(() => {});
            }
            return res;
          })
          .catch(() => cached);

        return cached || (await networkFetch);
      } catch {
        return fetch(req);
      }
    })(),
  );
});
