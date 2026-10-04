// Reloading the page, in its own module so tests can stand in for it.

export function reloadPage(): void {
  window.location.reload();
}
