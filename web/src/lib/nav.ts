// Navigation for code outside React components (actions, pop-ups). The shell
// registers the Next.js router once it mounts; calls made before that wait.

import { ROUTES, type View } from "@/routes";

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

/** Goes to a screen by its view name. */
export function navigate(view: View): void {
  if (push) push(ROUTES[view]);
  else pending = view;
}
