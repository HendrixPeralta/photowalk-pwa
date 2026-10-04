// A year of practice for screenshots and demos, loaded from Settings or with
// ?demo. It stays on across reloads (the demoMode flag), and tops itself up
// on a later day so the streak always ends today. The real profile is parked
// first, so Restore mine can hand it back.

import { applyBackstory, buildBackstory, DEMO_YEAR, type BackstoryConfig } from "@/lib/backstory";
import { localDateKey, uid } from "@/lib/util";
import { getData, STATE_KEY, update } from "./appStore";
import { restoreSavedState } from "./seed";

export const PRE_DEMO_KEY = "photoeye:pre-demo-state";

/** Overwrites the stats with a year of history. Photos, rooms and custom themes are left alone. */
export function seedDemoData(options: Partial<BackstoryConfig> = {}, now = new Date()): void {
  const cfg = { ...DEMO_YEAR, ...options };
  if (localStorage.getItem(PRE_DEMO_KEY) === null) {
    try {
      localStorage.setItem(PRE_DEMO_KEY, localStorage.getItem(STATE_KEY) || "");
    } catch (err) {
      console.warn("PhotoEYE: could not park the profile before loading demo data.", err);
    }
  }
  const story = buildBackstory(cfg, { now, uid });
  update((d) => {
    applyBackstory(d, story);
    d.demoMode = { seed: cfg.seed, seededAt: now.getTime() };
  });
}

/**
 * Seeds only when there is something to fix: no demo data yet, a different
 * seed asked for, or a history that no longer reaches today.
 */
export function ensureDemoData(seed?: number, now = new Date()): boolean {
  const data = getData();
  const wanted = seed ?? data.demoMode?.seed ?? DEMO_YEAR.seed;
  const upToDate = data.demoMode?.seed === wanted
    && data.walkHistory.length > 0
    && (data.activityLog[localDateKey(now)] || 0) > 0
    && Object.keys(data.frameLog).length > 0;
  if (upToDate) return false;
  seedDemoData({ seed: wanted }, now);
  return true;
}

/**
 * Leaves demo mode. The profile parked at the first seed comes back with a
 * reload; with nothing parked the stats are simply wiped. Returns true when
 * the page is reloading.
 */
export function clearDemoData(): boolean {
  const parked = localStorage.getItem(PRE_DEMO_KEY);
  localStorage.removeItem(PRE_DEMO_KEY);
  if (parked !== null) {
    restoreSavedState(parked);
    return true;
  }
  update((d) => {
    d.activityLog = {};
    d.frameLog = {};
    d.walkHistory = [];
    d.rewards = [];
    d.lastWalk = null;
    d.demoMode = null;
    Object.assign(d.profile, {
      streak: 0, longestStreak: 0, lastWalkDate: null, walksCompleted: 0, photosAnalyzed: 0, themeGoals: [], milestonesSeen: [],
    });
  });
  return false;
}
