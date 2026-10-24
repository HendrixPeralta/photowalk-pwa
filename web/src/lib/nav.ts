// Navigation for code outside React components (actions, pop-ups). The shell
// registers the Next.js router once it mounts; calls made before that wait.

import type { Route } from "next";
import { ROUTES, viewForPath, type View } from "@/routes";

type Push = (href: Route) => void;

let push: Push | null = null;
let pending: Route | null = null;

export function setNavigator(next: Push | null): void {
  push = next;
  if (push && pending) {
    const href = pending;
    pending = null;
    push(href);
  }
}

/**
 * Goes to a screen by its view name. Already there, it does nothing: pushing
 * the same screen would add a history entry, and offline it would fall back
 * to a full page load.
 */
export function navigate(view: View): void {
  if (typeof window !== "undefined" && viewForPath(window.location.pathname) === view) return;
  navigateTo(ROUTES[view]);
}

/** Goes to an exact address, such as a screen with a query on it. */
export function navigateTo(href: Route): void {
  if (push) push(href);
  else pending = href;
}
