// The three months of practice a brand-new profile starts with. An empty
// profile makes every screen look broken (an empty heatmap, a dead streak,
// reward bars with nowhere to point), so a new profile is given a history
// once, and from then on it is ordinary history that real walks add to.

import { applyBackstory, buildBackstory, STARTER, THIN_PROFILE_HOURS, type BackstoryConfig } from "@/lib/backstory";
import { totalActivityHours } from "@/lib/stats";
import { uid } from "@/lib/util";
import { getData, STATE_KEY, update } from "./appStore";

/** Where the profile from before the first seed is parked, so it can be handed back. */
export const PRE_SEED_KEY = "photoeye:pre-backstory-state";
/**
 * Set when the user restores their own profile. It lives outside the saved
 * state, because restoring replaces that wholesale, and without it restoring
 * an empty profile would land straight back on a freshly seeded one.
 */
export const DECLINED_KEY = "photoeye:backstory-declined";

/**
 * Seeds the starting history unless there is a reason not to: demo mode owns
 * the stats while it is on, a profile that already has one keeps it, and a
 * profile with real practice in it is left exactly as it is.
 */
export function maybeSeedStarterHistory(now = new Date()): boolean {
  const data = getData();
  if (data.demoMode) return false;
  if (localStorage.getItem(DECLINED_KEY)) return false;
  if (data.seededHistory) return false;
  if (totalActivityHours(data.activityLog) >= THIN_PROFILE_HOURS) return false;
  seedStarterHistory({}, now);
  return true;
}

/** Writes the starting history for keeps (also used to re-seed on request). */
export function seedStarterHistory(options: Partial<BackstoryConfig> = {}, now = new Date()): void {
  const cfg = { ...STARTER, ...options };
  // Asking for a history outright un-declines it.
  localStorage.removeItem(DECLINED_KEY);
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
