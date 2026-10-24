// What the Walks screen holds between taps but never saves: the mode picked
// for the next walk and the theme on hand for it. A running walk keeps its own
// mode and theme id in the saved data, so those always win while one is open.

import { create } from "zustand";
import { RAW_THEMES } from "@/lib/content/catalog";
import { themeById, type Theme } from "@/lib/content/themes";
import { getData, useAppStore } from "@/state/appStore";
import type { ActiveWalk, AppData, WalkMode } from "@/state/types";

interface WalkUi {
  /** The mode the next walk starts in. */
  mode: WalkMode;
  /** The theme on hand for the next walk (or the open walk's brief). */
  theme: Theme | null;
  /** Why the theme was suggested, shown in the brief. */
  reason: string;
  /** Set by the Live tab so the walk starts once the Live screen is showing. */
  launchOnArrival: boolean;
}

export const useWalkUi = create<WalkUi>(() => ({
  mode: "casual",
  theme: null,
  reason: "",
  launchOnArrival: false,
}));

/** The open walk's theme, or the one on hand for the next walk. */
export function walkTheme(data: AppData = getData()): Theme | null {
  const walk = data.activeWalk;
  if (walk) return themeById(walk.themeId, data.customThemes) ?? null;
  return useWalkUi.getState().theme;
}

export function useWalkTheme(): Theme | null {
  const themeId = useAppStore((s) => s.activeWalk?.themeId ?? null);
  const custom = useAppStore((s) => s.customThemes);
  const onHand = useWalkUi((s) => s.theme);
  return themeId ? themeById(themeId, custom) ?? null : onHand;
}

/** The mode that counts right now: the open walk's, else the one picked for the next. */
export function walkMode(data: AppData = getData()): WalkMode {
  return data.activeWalk?.mode ?? useWalkUi.getState().mode;
}

/** How many mini-challenges a Challenge Walk on a built-in theme hands out. */
export const CHALLENGES_PER_WALK = 3;

/**
 * Picks a walk's mini-challenges, as indexes into the theme's list. Built-in
 * themes carry more than a walk needs, so a few are drawn at random (kept in
 * list order); a custom theme's are all the user's own choice, so it gets
 * every one. A casual walk gets none.
 */
export function pickChallenges(theme: Theme, mode: WalkMode, random: () => number = Math.random): number[] {
  if (mode !== "guided") return [];
  const all = theme.challenges.map((_, i) => i);
  if (!RAW_THEMES.some((th) => th.id === theme.id)) return all;
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all.slice(0, CHALLENGES_PER_WALK).sort((a, b) => a - b);
}

/**
 * Mini-challenges belong to the Challenge Walk. A casual walk is the theme on its
 * own: nothing to tick off, stop whenever you're done.
 */
export function challengesFor(theme: Theme | null, walk: Pick<ActiveWalk, "mode" | "challengePicks" | "challengesChecked">): string[] {
  if (!theme || walk.mode !== "guided") return [];
  const picks = walk.challengePicks ?? walk.challengesChecked.map((_, i) => i);
  return picks.map((i) => theme.challenges[i]).filter((c) => c !== undefined);
}
