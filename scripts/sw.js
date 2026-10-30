// Service worker template; scripts/build.mjs stamps the version and writes it to dist/sw.js.
// Pages and data: network first, cached copy when offline. Assets, icons and fonts: cache first,
// refreshed in the background. Ads, analytics and other third parties are never touched.
const VERSION = '__VERSION__';
const CACHE = `blendwire-${VERSION}`;
const OFFLINE = '/offline.html';
const PRECACHE = ['/', OFFLINE, '/assets/styles.css', '/assets/app.js', '/favicon.svg', '/icons/pwa-192.png'];
const MAX_PAGES = 80;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

const put = async (req, res) => {
  if (!res || !(res.ok || res.type === 'opaque')) return;
  const c = await caches.open(CACHE);
  await c.put(req, res);
};

// Keep the page cache from growing without bound: drop the oldest HTML entries.
const trim = async () => {
  const c = await caches.open(CACHE);
  const pages = (await c.keys()).filter((r) => /(\/|\.html)$/.test(new URL(r.url).pathname) && !PRECACHE.includes(new URL(r.url).pathname));
  for (const r of pages.slice(0, Math.max(0, pages.length - MAX_PAGES))) await c.delete(r);
};

// Cache keys drop the query string, so cache-busted polls (version.json?t=…) reuse one entry.
const networkFirst = async (e, fallback) => {
  const key = e.request.url.split('?')[0];
  try {
    const res = await fetch(e.request);
    e.waitUntil(put(key, res.clone()).then(trim));
    return res;
  } catch {
    const hit = await caches.match(e.request, { ignoreSearch: true });
    return hit || (fallback && await caches.match(fallback)) || Response.error();
  }
};

// Exact URL match, so a new ?v= (a new deploy's assets) misses and comes straight from the network;
// any cached version only stands in when the network is down.
const staleWhileRevalidate = async (e) => {
  const hit = await caches.match(e.request);
  const net = fetch(e.request).then((res) => { e.waitUntil(put(e.request, res.clone())); return res; });
  if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
  return net.catch(async () => (await caches.match(e.request, { ignoreSearch: true })) || Response.error());
};

self.addEventListener('fetch', (e) => {
  const { request: req } = e;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (req.mode === 'navigate') return e.respondWith(networkFirst(e, OFFLINE));
  if (/\.(json|xml)$/.test(url.pathname)) return e.respondWith(networkFirst(e));
  if (/^\/(assets|icons)\/|\.(png|svg|ico|webp|jpe?g|woff2?)$/.test(url.pathname)) return e.respondWith(staleWhileRevalidate(e));
});
