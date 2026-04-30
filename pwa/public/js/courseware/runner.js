// Loads a course bundle into a sandboxed iframe via a service-worker virtual
// origin. We extract the bundle into a Cache (`courseware-<instanceId>`) keyed
// by `/pwa/_course/<instanceId>/<path>`, then point the iframe at the entry
// HTML. Internal relative links navigate to other paths under the same prefix,
// which the service worker intercepts and serves from the same cache.
//
// Why not blob: URLs? Chromium blocks iframe navigation between distinct blob
// URLs (treated as cross-origin), which breaks any courseware with multiple
// pages. Real same-origin URLs avoid the problem and let us use a stricter
// sandbox.

const JSZip = globalThis.JSZip;

const MIME = {
  html: 'text/html', htm: 'text/html', css: 'text/css',
  js: 'application/javascript', mjs: 'application/javascript',
  json: 'application/json', png: 'image/png', jpg: 'image/jpeg',
  jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp'
};
function mimeFor(p) {
  return MIME[(p.split('.').pop() || '').toLowerCase()] || 'application/octet-stream';
}

function cacheNameFor(instanceId) { return 'courseware-' + instanceId; }
function virtualPrefix(instanceId) { return `/pwa/_course/${encodeURIComponent(instanceId)}/`; }

export async function loadCourseIntoIframe({ blob, iframe, instanceId }) {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const manifestFile = zip.file('course.json');
  if (!manifestFile) throw new Error('Bundle invalido (course.json mancante)');
  const manifest = JSON.parse(await manifestFile.async('string'));

  const cacheName = cacheNameFor(instanceId);
  // Wipe and repopulate to keep things deterministic across re-opens.
  await caches.delete(cacheName);
  const cache = await caches.open(cacheName);
  const prefix = virtualPrefix(instanceId);

  for (const a of manifest.assets) {
    const f = zip.file(a.path);
    if (!f) throw new Error(`Asset mancante: ${a.path}`);
    const bytes = await f.async('uint8array');
    const url = new URL(prefix + a.path, location.origin).toString();
    await cache.put(url, new Response(bytes, {
      status: 200,
      headers: { 'Content-Type': mimeFor(a.path), 'X-Foundation-Course': instanceId }
    }));
  }

  const entry = manifest.entry || 'index.html';
  const entryUrl = prefix + entry;

  // We need `allow-same-origin` so the iframe inherits the host origin and
  // is therefore controlled by our service worker (sandboxed null-origin
  // iframes bypass the parent's SW). The courseware is hash-verified before
  // we ever reach this point, so granting same-origin is acceptable for the PoC.
  iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms');
  iframe.src = entryUrl;

  return {
    manifest,
    instanceId,
    revoke() { caches.delete(cacheName).catch(() => {}); }
  };
}
