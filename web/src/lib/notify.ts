// System notifications. The one place that talks to the browser's
// Notification API, so a native build can swap in its own delivery later.

/** Read on every call: the user can grant or revoke permission at any time. */
export function notificationsGranted(): boolean {
  return typeof Notification !== "undefined" && Notification.permission === "granted";
}

/**
 * Shows a notification now, if permission is granted. Goes through the
 * service worker when there is one, because constructing a Notification
 * directly throws on Android Chrome.
 */
export async function showNow(body: string, tag: string): Promise<void> {
  if (!notificationsGranted()) return;
  const options: NotificationOptions = { body, tag, icon: "/icons/icon.svg" };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.showNotification("PhotoEYE", options);
      return;
    }
  } catch { /* fall through to the page-level API */ }
  try {
    new Notification("PhotoEYE", options);
  } catch { /* the in-app toast already covered it */ }
}
