// What the Walks screen holds between taps but never saves: the mode picked
// for the next walk and the theme on hand for it. A running walk keeps its own
// mode and theme id in the saved data, so those always win while one is open.

import { create } from "zustand";
import { themeById, type Theme } from "@/lib/content/themes";
import { getData, useAppStore } from "@/state/appStore";
import type { AppData, WalkMode } from "@/state/types";

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

/**
 * Mini-challenges belong to the Challenge Walk. A casual walk is the theme on its
 * own: nothing to tick off, stop whenever you're done.
 */
export function challengesFor(theme: Theme | null, mode: WalkMode): string[] {
  return theme && mode === "guided" ? theme.challenges : [];
}
