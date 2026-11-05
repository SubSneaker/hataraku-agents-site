// Hataraku Agents service worker: app shell cache, update hand-off and Web Push.
//
// Never cached: /api/*, /ws, requests with an Authorization header and anything whose URL carries
// a token. The page registers this file in production builds only (web/src/pwa.ts).
// `npm run build` stamps BUILD and PRECACHE (vite.config.ts) so every new build is a new worker,
// which is what makes the page's "Update available" toast appear.

const BUILD = 'ec9393ec9187';
/** Hashed build assets (JS, CSS, fonts) relative to the scope. */
const PRECACHE = ["assets/CanvasPool-AVnmSNKq.js","assets/RenderTargetSystem-C_1yGmji.js","assets/ar-8VdurW1v.js","assets/browserAll-DfaM6sKw.js","assets/canvasUtils-D9PJXwz_.js","assets/de-YEoKzk5g.js","assets/es-BaTQirCE.js","assets/fil-D9hpJ0aw.js","assets/fr-B09nqQxQ.js","assets/getTexelRangeRects--bWe3apc.js","assets/getTextureBatchBindGroup-Ck77k8EI.js","assets/he-Dgtk82YV.js","assets/hi-DVuzVQsN.js","assets/id-CsIJerSo.js","assets/index-BmjVa_b1.js","assets/index-vTOGMLm2.css","assets/init-Cxp1Iv11.js","assets/it-XWBx-e89.js","assets/ja-CUWy7K51.js","assets/ko-CCmbv3oh.js","assets/ms-4aOj4h6v.js","assets/pixelify-sans-latin-400-normal-DLrIX9QE.woff2","assets/pixelify-sans-latin-500-normal-DC052d-m.woff2","assets/pixelify-sans-latin-600-normal-Dd_Dy7u5.woff2","assets/pixelify-sans-latin-700-normal-D3Xxx3QE.woff2","assets/pixelify-sans-latin-ext-400-normal-DdH6zlBQ.woff2","assets/pixelify-sans-latin-ext-500-normal-BHT4w5qI.woff2","assets/pixelify-sans-latin-ext-600-normal-Dha6RiOG.woff2","assets/pixelify-sans-latin-ext-700-normal-ClyJstAh.woff2","assets/pt-C3QaFGZ4.js","assets/silkscreen-latin-400-normal-CtPo2yA5.woff2","assets/th-C6KoHg_U.js","assets/vi-6Y3OvFSY.js","assets/webworkerAll-Nwy7yfjQ.js","assets/zh-Hans-CFafL8ua.js","assets/zh-Hant-CSPGgRck.js"];

const PREFIX = 'hataraku-shell-';
const CACHE = `${PREFIX}${BUILD}`;
const SCOPE = new URL(self.registration.scope);
/** The page shell (index.html) is stored under the scope URL, whatever the navigation URL was. */
const SHELL = SCOPE.href;
const STATIC = ['manifest.webmanifest', 'favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/badge-96.png', 'icons/apple-touch-icon.png'];
const ICON = new URL('icons/icon-192.png', SCOPE).href;
const BADGE = new URL('icons/badge-96.png', SCOPE).href;
/** A navigation that takes longer than this falls back to the cached shell (daemon unreachable). */
const NAV_TIMEOUT_MS = 4000;

const url = (p) => new URL(p, SCOPE).href;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // One missing file must not fail the whole install.
      await Promise.all(
        [SHELL, ...STATIC.map(url), ...PRECACHE.map(url)].map((u) =>
          fetch(u, { cache: 'no-cache', credentials: 'same-origin' })
            .then((res) => (res.ok ? cache.put(u, res) : undefined))
            .catch(() => undefined),
        ),
      );
      // The first install takes over at once. Later builds wait until the page asks (skip-waiting).
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'skip-waiting') self.skipWaiting();
});

/** Requests that must always go to the network untouched. */
function bypass(req, u) {
  if (req.method !== 'GET') return true;
  if (u.origin !== SCOPE.origin) return true;
  if (/\/(api|ws)(\/|$)/.test(u.pathname)) return true;
  if (req.headers.has('authorization')) return true;
  if (/token/i.test(u.search) || /token/i.test(u.hash)) return true;
  return false;
}

async function fromNetwork(req, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(req, { signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Navigations: network first (fresh index.html), cached shell when offline. */
async function navigate(event) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fromNetwork(event.request, NAV_TIMEOUT_MS);
    if (res.ok && res.type === 'basic' && (res.headers.get('content-type') || '').includes('text/html')) {
      event.waitUntil(cache.put(SHELL, res.clone()));
    }
    return res;
  } catch (err) {
    const cached = await cache.match(SHELL);
    if (cached) return cached;
    throw err;
  }
}

/** Hashed assets never change: cache first, filled on first use. */
async function cacheFirst(event) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(event.request);
  if (hit) return hit;
  const res = await fetch(event.request);
  if (res.ok && res.type === 'basic') event.waitUntil(cache.put(event.request, res.clone()));
  return res;
}

/** Icons, manifest, favicon: answer from the cache, refresh in the background. */
async function staleWhileRevalidate(event) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(event.request);
  const refresh = fetch(event.request)
    .then((res) => {
      if (res.ok && res.type === 'basic') return cache.put(event.request, res.clone()).then(() => res);
      return res;
    })
    .catch(() => undefined);
  if (hit) {
    event.waitUntil(refresh);
    return hit;
  }
  const res = await refresh;
  return res || Response.error();
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const u = new URL(req.url);
  if (bypass(req, u)) return;
  if (req.mode === 'navigate') {
    event.respondWith(navigate(event));
    return;
  }
  const rel = u.pathname.slice(SCOPE.pathname.length);
  if (rel.startsWith('assets/')) event.respondWith(cacheFirst(event));
  else if (STATIC.includes(rel)) event.respondWith(staleWhileRevalidate(event));
});

// --- Web Push -------------------------------------------------------------------------------------

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  const title = typeof data.title === 'string' && data.title ? data.title : 'Hataraku Agents';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof data.body === 'string' ? data.body : '',
      tag: typeof data.tag === 'string' ? data.tag : undefined,
      data: { url: typeof data.url === 'string' ? data.url : undefined, agentId: typeof data.agentId === 'string' ? data.agentId : undefined },
      icon: ICON,
      badge: BADGE,
      requireInteraction: data.urgent === true,
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const { url: target, agentId } = event.notification.data || {};
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const ours = windows.filter((c) => new URL(c.url).origin === SCOPE.origin);
      // Prefer the full office over the pet window.
      const client = ours.find((c) => !c.url.includes('mode=pet')) || ours[0];
      if (client) {
        try {
          await client.focus();
        } catch {
          // focus can be refused; the message still selects the worker
        }
        if (agentId) client.postMessage({ type: 'focus-agent', agentId });
        return;
      }
      const open = new URL(target || './', SCOPE);
      if (open.origin === SCOPE.origin && agentId && !open.searchParams.has('agent')) open.searchParams.set('agent', agentId);
      await self.clients.openWindow(open.href);
    })(),
  );
});
