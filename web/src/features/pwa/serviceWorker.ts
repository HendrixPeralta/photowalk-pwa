// Registers the service worker, and offers a reload when a new version has
// installed. The new version waits for that tap rather than taking over an
// open page: Vercel's free plan doesn't keep old files around, so swapping
// versions under a running page could break it mid-walk.

import { Serwist } from "@serwist/window";
import { t } from "@/lib/i18n/core";
import { reloadPage } from "@/lib/page";
import { showToast } from "@/state/ui";

/**
 * Off in development (it would cache files mid-edit) and in the static
 * export, which is for the phone app and can't send the header that lets
 * /serwist/sw.js control the whole site.
 */
export function serviceWorkerEnabled(): boolean {
  return process.env.NODE_ENV === "production"
    && process.env.NEXT_PUBLIC_STATIC_EXPORT !== "1"
    && typeof navigator !== "undefined"
    && "serviceWorker" in navigator;
}

let registered = false;

export function registerServiceWorker(): void {
  if (registered || !serviceWorkerEnabled()) return;
  registered = true;
  const sw = new Serwist("/serwist/sw.js", { scope: "/", type: "module" });
  sw.addEventListener("waiting", () => {
    showToast(t("A new version is ready."), 30 * 60_000, {
      label: t("Reload"),
      run: () => {
        sw.addEventListener("controlling", () => reloadPage());
        sw.messageSkipWaiting();
      },
    });
  });
  sw.register().catch((err) => console.warn("PhotoEYE: service worker registration failed.", err));
}
