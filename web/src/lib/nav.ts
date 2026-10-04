// Navigation for code outside React components (actions, pop-ups). The shell
// registers the Next.js router once it mounts; calls made before that wait.

import { ROUTES, viewForPath, type View } from "@/routes";

type Push = (href: (typeof ROUTES)[View]) => void;

let push: Push | null = null;
let pending: View | null = null;

export function setNavigator(next: Push | null): void {
  push = next;
  if (push && pending) {
    const view = pending;
    pending = null;
    push(ROUTES[view]);
  }
}

/**
 * Goes to a screen by its view name. Already there, it does nothing: pushing
 * the same screen would add a history entry, and offline it would fall back
 * to a full page load.
 */
export function navigate(view: View): void {
  if (typeof window !== "undefined" && viewForPath(window.location.pathname) === view) return;
  if (push) push(ROUTES[view]);
  else pending = view;
}
