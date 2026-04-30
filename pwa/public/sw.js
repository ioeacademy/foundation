// Cache-first service worker for the PWA shell.
const CACHE = 'foundation-shell-v4';
const SHELL = [
  '/pwa/',
  '/pwa/index.html',
  '/pwa/manifest.webmanifest',
  '/pwa/css/app.css',
  '/pwa/icons/icon-192.svg',
  '/pwa/icons/icon-512.svg',
  '/pwa/vendor/jszip.min.js',
  '/pwa/vendor/qrcode-generator.js',
  '/pwa/vendor/jsQR.js',
  '/pwa/vendor/pako.min.js',
  '/pwa/js/app.js',
  '/pwa/js/storage.js',
  '/pwa/js/lineage.js',
  '/pwa/js/catalog.js',
  '/pwa/js/bundle.js',
  '/pwa/js/sync.js',
  '/pwa/js/courseware/runner.js',
  '/pwa/js/courseware/xapi-collector.js',
  '/pwa/js/qr/encoder.js',
  '/pwa/js/qr/scanner.js',
  '/pwa/js/webrtc/peer.js',
  '/pwa/js/webrtc/transfer.js',
  '/pwa/js/webrtc/signaling-qr.js',
  '/pwa/js/ui/i18n-it.js',
  '/pwa/js/ui/util.js',
  '/pwa/js/ui/views-catalog.js',
  '/pwa/js/ui/views-library.js',
  '/pwa/js/ui/views-share.js',
  '/pwa/js/ui/views-receive.js',
  '/pwa/js/ui/views-player.js',
  '/pwa/js/ui/views-diagnostics.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Virtual courseware origin: /pwa/_course/<instanceId>/<path>
  // Each course instance has its own Cache (`courseware-<instanceId>`), populated
  // by the main thread when the course is opened.
  const courseMatch = url.pathname.match(/^\/pwa\/_course\/([^\/]+)\/(.*)$/);
  if (courseMatch) {
    const [, instanceId] = courseMatch;
    const cacheName = 'courseware-' + decodeURIComponent(instanceId);
    e.respondWith((async () => {
      const c = await caches.open(cacheName);
      let hit = await c.match(e.request, { ignoreSearch: true, ignoreVary: true });
      if (!hit) hit = await c.match(url.toString(), { ignoreSearch: true, ignoreVary: true });
      if (hit) return hit;
      return new Response('Course asset not found', { status: 404 });
    })());
    return;
  }

  // Network-first for API + courseware bundles, cache-first for shell.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/dashboard')) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }
  if (!url.pathname.startsWith('/pwa/')) return;
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => hit))
  );
});
