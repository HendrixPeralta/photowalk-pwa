// The service worker: PhotoEYE offline, photos from the share sheet, and
// taps on notifications. Built by Serwist (see app/serwist/[path]/route.ts),
// which fills in __SW_MANIFEST with every file of the build to precache.

import { defaultCache } from "@serwist/turbopack/worker";
import { Serwist, type PrecacheEntry, type SerwistGlobalConfig } from "serwist";
import { DB_NAME, DB_VERSION, STORE_INBOX, upgradeDb } from "../lib/db/schema";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

/* ---------- Share target ---------- */

function putInbox(files: File[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => upgradeDb(req.result);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const tx = req.result.transaction(STORE_INBOX, "readwrite");
      files.forEach((file) => tx.objectStore(STORE_INBOX).add(file));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    };
  });
}

/**
 * Photos posted from the phone's share sheet: parked in the inbox, then on
 * to Partners, which picks them up for Upload.
 */
async function receiveShare(request: Request): Promise<Response> {
  try {
    const form = await request.formData();
    const files = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length) await putInbox(files);
  } catch {
    // Still open the app: better than a dead-end error page.
  }
  return Response.redirect(new URL("/partners/?shared=1", self.location.origin).href, 303);
}

// Before Serwist's own listener, which only handles GET requests.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method === "POST" && url.origin === self.location.origin && url.pathname.replace(/\/$/, "") === "/share-target") {
    event.respondWith(receiveShare(event.request));
  }
});

/* ---------- Notifications ---------- */

// A walk nudge opens Live Walk; anything else opens the app where it was.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = event.notification.tag?.startsWith("walk-") ? "/live/" : "/";
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const open = windows.find((client) => client.url.startsWith(self.location.origin));
    if (open) {
      await open.focus();
      return;
    }
    await self.clients.openWindow(path);
  })());
});

/* ---------- Offline ---------- */

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  precacheOptions: {
    cleanupOutdatedCaches: true,
    // /partners/?room=CODE is still the Partners page.
    ignoreURLParametersMatching: [/.*/],
  },
  // A new version waits until the page says so (the "new version" toast):
  // swapping files under an open page can break it mid-walk.
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
  fallbacks: {
    entries: [{ url: "/", matcher: ({ request }) => request.destination === "document" }],
  },
});

serwist.addEventListeners();
