// IndexedDB names, in one place. The service worker imports this too (it
// stores photos shared into the app from the OS share sheet), so the page and
// the worker can't drift apart.

export const DB_NAME = "photoeye";
export const DB_VERSION = 1;
/** Photo blobs, keyed by imageId. */
export const STORE_IMAGES = "images";
/** Files handed over by the OS share sheet, waiting for the app to pick them up. */
export const STORE_INBOX = "share-inbox";

/** Creates the stores on first open or upgrade. Shared by the page and the worker. */
export function upgradeDb(db: IDBDatabase): void {
  if (!db.objectStoreNames.contains(STORE_IMAGES)) db.createObjectStore(STORE_IMAGES);
  if (!db.objectStoreNames.contains(STORE_INBOX)) db.createObjectStore(STORE_INBOX, { autoIncrement: true });
}
