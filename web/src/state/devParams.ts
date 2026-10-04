// The URL switches for demos and testing:
//   ?demo (or ?demo=SEED)  a year of practice history; ?demo=clear leaves it
//   ?history=seed|undo     rewrite or hand back the starting history
//   ?photos=seed|clear     add or remove the starter album photos
// Read once and removed from the address straight away, so a reload doesn't
// run them again (the old app re-seeded, and duplicated the album, on every
// reload while one was in the address).

export interface DevParams {
  demo: string | null;
  history: string | null;
  photos: string | null;
}

const NAMES = ["demo", "history", "photos"] as const;
let taken: DevParams | null = null;

export function takeDevParams(): DevParams {
  if (taken) return taken;
  const url = new URL(window.location.href);
  taken = { demo: url.searchParams.get("demo"), history: url.searchParams.get("history"), photos: url.searchParams.get("photos") };
  if (NAMES.some((name) => url.searchParams.has(name))) {
    NAMES.forEach((name) => url.searchParams.delete(name));
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }
  return taken;
}
