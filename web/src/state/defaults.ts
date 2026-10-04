import type { AppData } from "./types";

export const WALK_HISTORY_LIMIT = 200;

export function defaultState(): AppData {
  return {
    profile: {
      streak: 0,
      longestStreak: 0,
      lastWalkDate: null,
      walksCompleted: 0,
      photosAnalyzed: 0,
      goals: { week: 3, month: 12, year: 100 },
      goalPeriod: "week",
      themeGoals: [],
      guidedDurationMin: 30,
      milestonesSeen: [],
      displayName: "",
    },
    album: [],
    rooms: {},
    currentRoom: null,
    activeWalk: null,
    lastWalk: null,
    walkHistory: [],
    activityLog: {},
    frameLog: {},
    rewards: [],
    customThemes: [],
    demoMode: null,
    seededHistory: null,
    seededAlbum: null,
    reminder: { enabled: false, time: "18:00", days: [1, 3, 5] },
  };
}

/**
 * Fills in anything a saved blob is missing from the defaults, so data saved
 * by an older build keeps loading as fields are added. The profile is merged
 * one level deeper because new profile fields are the common case.
 */
export function withDefaults(saved: Partial<AppData> | null | undefined): AppData {
  const base = defaultState();
  if (!saved || typeof saved !== "object") return base;
  return { ...base, ...saved, profile: { ...base.profile, ...(saved.profile ?? {}) } };
}
