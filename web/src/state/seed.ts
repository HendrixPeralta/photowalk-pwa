// Three months of sample practice, loaded on request from the Demo data
// switch in Settings (or ?history=seed). A new account starts empty; this
// fills the heatmap, streak and rewards for trying the app out or showing it.
// Once loaded it is ordinary history that real walks add to, and Restore
// mine hands back the profile from before.

import { applyBackstory, buildBackstory, STARTER, type BackstoryConfig } from "@/lib/backstory";
import { reloadPage } from "@/lib/page";
import { uid } from "@/lib/util";
import { STATE_KEY, update } from "./appStore";

/** Where the profile from before the first seed is parked, so it can be handed back. */
export const PRE_SEED_KEY = "photoeye:pre-backstory-state";
/** Writes the sample history for keeps. */
export function seedStarterHistory(options: Partial<BackstoryConfig> = {}, now = new Date()): void {
  const cfg = { ...STARTER, ...options };
  parkCurrentState();
  const story = buildBackstory(cfg, { now, uid });
  update((draft) => {
    applyBackstory(draft, story);
    draft.seededHistory = { seed: cfg.seed, days: cfg.days, seededAt: now.getTime() };
  });
}

function parkCurrentState(): void {
  if (localStorage.getItem(PRE_SEED_KEY) !== null) return; // already parked
  try {
    localStorage.setItem(PRE_SEED_KEY, localStorage.getItem(STATE_KEY) || "");
  } catch (err) {
    console.warn("PhotoEYE: could not park the profile before seeding history.", err);
  }
}

/**
 * Hands back the profile parked before the first seed, and reloads (the store
 * was built from the seeded data). Returns false when nothing is parked.
 */
export function undoStarterHistory(): boolean {
  const parked = localStorage.getItem(PRE_SEED_KEY);
  if (parked === null) return false;
  localStorage.removeItem(PRE_SEED_KEY);
  restoreSavedState(parked);
  return true;
}

/** Puts a parked copy of the saved data back and reloads onto it. */
export function restoreSavedState(parked: string): void {
  if (parked) localStorage.setItem(STATE_KEY, parked);
  else localStorage.removeItem(STATE_KEY);
  reloadPage();
}
