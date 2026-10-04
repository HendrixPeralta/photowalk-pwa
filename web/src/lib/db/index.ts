// IndexedDB-backed blob storage for photos. Pixels live here; only metadata
// goes in the saved state, which keeps that small enough for localStorage.
// Browser-only: call from effects and handlers.

import { DB_NAME, DB_VERSION, STORE_IMAGES, STORE_INBOX, upgradeDb } from "./schema";

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => upgradeDb(req.result);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("IndexedDB upgrade blocked by another tab"));
  });
  // A failed open shouldn't poison every later attempt.
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}

function run<T>(storeName: string, mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return openDb().then((db) => new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const req = fn(tx.objectStore(storeName));
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }));
}

export function putImage(id: string, blob: Blob): Promise<unknown> {
  return run(STORE_IMAGES, "readwrite", (store) => store.put(blob, id));
}

export function getImage(id: string): Promise<Blob | undefined> {
  return run<Blob>(STORE_IMAGES, "readonly", (store) => store.get(id));
}

export function deleteImage(id: string): Promise<unknown> {
  revokeImageUrl(id);
  return run(STORE_IMAGES, "readwrite", (store) => store.delete(id));
}

export function clearImages(): Promise<unknown> {
  urlCache.forEach((_, id) => revokeImageUrl(id));
  return run(STORE_IMAGES, "readwrite", (store) => store.clear());
}

export async function allImageIds(): Promise<string[]> {
  return ((await run<IDBValidKey[]>(STORE_IMAGES, "readonly", (store) => store.getAllKeys())) ?? []) as string[];
}

/**
 * Object URLs are cached per image id for the lifetime of the session so a
 * re-render of a grid reuses one blob URL per photo instead of leaking a fresh
 * one each time. Caching the promise (not the URL) keeps concurrent callers
 * from racing to create two URLs for the same image.
 */
const urlCache = new Map<string, Promise<string | null>>();

export function imageUrl(id: string | null | undefined): Promise<string | null> {
  if (!id) return Promise.resolve(null);
  let pending = urlCache.get(id);
  if (!pending) {
    pending = getImage(id)
      .then((blob) => (blob ? URL.createObjectURL(blob) : null))
      .catch(() => null);
    urlCache.set(id, pending);
    // A miss is not remembered: the photo may still be on its way into the
    // store (a first-run seed), and a cached null would hide it for the session.
    pending.then((url) => { if (!url) urlCache.delete(id); });
  }
  return pending;
}

export function revokeImageUrl(id: string): void {
  const pending = urlCache.get(id);
  if (!pending) return;
  urlCache.delete(id);
  pending.then((url) => url && URL.revokeObjectURL(url)).catch(() => {});
}

/** Pulls everything the OS share sheet handed over and empties the inbox. */
export async function takeSharedFiles(): Promise<File[]> {
  const items = (await run<File[]>(STORE_INBOX, "readonly", (store) => store.getAll())) ?? [];
  if (items.length) await run(STORE_INBOX, "readwrite", (store) => store.clear());
  return items;
}

export async function requestPersistence(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

/** Storage use, or null when the browser won't say. */
export async function storageEstimate(): Promise<{ usage: number; quota: number; ratio: number } | null> {
  try {
    if (!navigator.storage?.estimate) return null;
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    if (!quota) return null;
    return { usage, quota, ratio: usage / quota };
  } catch {
    return null;
  }
}
