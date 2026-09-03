// IndexedDB-backed blob storage for photos.
//
// Photos used to be base64 dataURLs embedded in the single localStorage state
// blob, which capped the whole app at roughly 5MB — a few dozen references —
// and threw an uncaught QuotaExceededError once full. Pixels now live here;
// only metadata stays in localStorage.
//
// sw.js opens this same database to stash share-target uploads. Keep DB_NAME,
// DB_VERSION and the store names in sync with the copy there.

const DB_NAME = 'photowalk';
const DB_VERSION = 1;
const STORE_IMAGES = 'images';
const STORE_INBOX = 'share-inbox';

let dbPromise = null;

export function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_IMAGES)) db.createObjectStore(STORE_IMAGES);
      if (!db.objectStoreNames.contains(STORE_INBOX)) db.createObjectStore(STORE_INBOX, { autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB upgrade blocked by another tab'));
  });
  return dbPromise;
}

function run(storeName, mode, fn) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const req = fn(tx.objectStore(storeName));
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }));
}

export function putImage(id, blob) {
  return run(STORE_IMAGES, 'readwrite', (store) => store.put(blob, id));
}

export function getImage(id) {
  return run(STORE_IMAGES, 'readonly', (store) => store.get(id));
}

export function deleteImage(id) {
  revokeImageUrl(id);
  return run(STORE_IMAGES, 'readwrite', (store) => store.delete(id));
}

export function allImageIds() {
  return run(STORE_IMAGES, 'readonly', (store) => store.getAllKeys());
}

/**
 * Object URLs are cached per image id for the lifetime of the session so a
 * re-render of the album grid reuses one blob URL per photo instead of leaking
 * a fresh one each time. Caching the promise (not the URL) keeps concurrent
 * callers from racing to create two URLs for the same image.
 */
const urlCache = new Map();

export function imageUrl(id) {
  if (!id) return Promise.resolve(null);
  let pending = urlCache.get(id);
  if (!pending) {
    pending = getImage(id)
      .then((blob) => (blob ? URL.createObjectURL(blob) : null))
      .catch(() => null);
    urlCache.set(id, pending);
  }
  return pending;
}

export function revokeImageUrl(id) {
  const pending = urlCache.get(id);
  if (!pending) return;
  urlCache.delete(id);
  pending.then((url) => url && URL.revokeObjectURL(url)).catch(() => {});
}

/** Fills in background images for every [data-image] element under `root`. */
export function hydrateImages(root) {
  root.querySelectorAll('[data-image]').forEach((el) => {
    const id = el.dataset.image;
    if (!id) return;
    imageUrl(id).then((url) => {
      if (url) el.style.backgroundImage = `url("${url}")`;
    });
  });
}

/** Pulls everything the OS share sheet handed us and empties the inbox. */
export async function takeSharedFiles() {
  const items = await run(STORE_INBOX, 'readonly', (store) => store.getAll());
  if (items && items.length) await run(STORE_INBOX, 'readwrite', (store) => store.clear());
  return items || [];
}

export async function requestPersistence() {
  try {
    if (!navigator.storage || !navigator.storage.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch (err) {
    return false;
  }
}

/** Returns { usage, quota, ratio } or null when the browser won't say. */
export async function storageEstimate() {
  try {
    if (!navigator.storage || !navigator.storage.estimate) return null;
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    if (!quota) return null;
    return { usage, quota, ratio: usage / quota };
  } catch (err) {
    return null;
  }
}
