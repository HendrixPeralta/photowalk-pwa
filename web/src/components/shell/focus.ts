// Focus helpers shared by the pop-up and the drawer.

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Moves focus to the first focusable element inside `container`, or the container itself. */
export function focusFirst(container: HTMLElement | null, { skip }: { skip?: string } = {}): void {
  if (!container) return;
  const candidates = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE));
  const target = candidates.find((el) => !skip || !el.matches(skip)) ?? candidates[0] ?? container;
  target.focus({ preventScroll: true });
}

/**
 * Makes everything outside an open overlay inert (unfocusable, hidden from
 * screen readers) and returns a function that undoes it. The app chrome marks
 * itself with data-app-chrome.
 */
export function inertAppChrome(): () => void {
  const els = Array.from(document.querySelectorAll<HTMLElement>("[data-app-chrome]"));
  els.forEach((el) => { el.inert = true; });
  return () => els.forEach((el) => { el.inert = false; });
}
