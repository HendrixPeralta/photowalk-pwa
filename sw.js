const CACHE_NAME = 'photowalk-v16';
const RUNTIME_CACHE = 'photowalk-runtime-v1';
const CURRENT_CACHES = [CACHE_NAME, RUNTIME_CACHE];

const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/util.js',
  './js/db.js',
  './js/store.js',
  './js/exif.js',
  './js/qr.js',
  './js/concepts.js',
  './js/openverse.js',
  './js/modal.js',
  './js/toast.js',
  './js/heatmap.js',
  './js/interpret.js',
  './js/scopes.js',
  './js/rewards.js',
  './js/reminders.js',
  './js/milestones.js',
  './js/profile.js',
  './js/walks.js',
  './js/analysis.js',
  './js/album.js',
  './js/share.js',
  './js/app.js',
  './icons/icon.svg',
  './icons/icon-maskable.svg'
];

// Public-domain concept examples are fetched from here and cached so the
// explainer keeps working after the first view, offline included.
const PHOTO_API_HOST = 'api.openverse.org';

/* ---------- IndexedDB (mirrors js/db.js — keep the names in sync) ---------- */

const DB_NAME = 'photowalk';
const DB_VERSION = 1;
const STORE_IMAGES = 'images';
const STORE_INBOX = 'share-inbox';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_IMAGES)) db.createObjectStore(STORE_IMAGES);
      if (!db.objectStoreNames.contains(STORE_INBOX)) db.createObjectStore(STORE_INBOX, { autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function putInbox(files) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_INBOX, 'readwrite');
    const store = tx.objectStore(STORE_INBOX);
    files.forEach((file) => store.add(file));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }));
}

/* ---------- Lifecycle ---------- */

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => !CURRENT_CACHES.includes(key)).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

/* ---------- Share target ---------- */

/**
 * Receives photos posted straight from the OS share sheet, parks them in
 * IndexedDB, and bounces to the app, which picks them up on boot. This is the
 * fix for the PRD's "uploading is such a hassle they'll just use AirDrop" risk.
 */
async function handleShareTarget(request) {
  try {
    const form = await request.formData();
    const files = form.getAll('photos').filter((file) => file && file.size);
    if (files.length) await putInbox(files);
  } catch (err) {
    // Still open the app — better than a dead-end error page.
  }
  return Response.redirect(new URL('./index.html?shared=1', self.registration.scope).toString(), 303);
}

/* ---------- Fetch ---------- */

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (event.request.method === 'POST' && url.pathname.endsWith('/share-target')) {
    event.respondWith(handleShareTarget(event.request));
    return;
  }

  if (event.request.method !== 'GET') return;

  if (url.hostname === PHOTO_API_HOST) {
    event.respondWith(cacheFirstRuntime(event.request));
    return;
  }

  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if (response && response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => {
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
          return undefined;
        });
    })
  );
});

function cacheFirstRuntime(request) {
  return caches.match(request).then((cached) => {
    if (cached) return cached;
    return fetch(request)
      .then((response) => {
        if (response && (response.ok || response.type === 'opaque')) {
          const copy = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => undefined);
  });
}

/* ---------- Notifications ---------- */

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const scope = self.registration.scope;
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (client.url.startsWith(scope) && 'focus' in client) return client.focus();
    }
    if (self.clients.openWindow) return self.clients.openWindow('./index.html');
    return undefined;
  })());
});
