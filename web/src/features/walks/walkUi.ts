// What the Walks screen holds between taps but never saves: the mode picked
// for the next walk, the theme on hand for it, and the walk being set up on
// its brief. A walk only lands in the saved data once shooting starts, and
// then its own mode and theme id always win.

import { create } from "zustand";
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
  /**
   * The walk being set up on its brief, not started and not saved. Start
   * shooting turns it into the open walk; leaving the brief just drops it.
   */
  draft: ActiveWalk | null;
  /** Set by the Live tab so the brief opens once the Live screen is showing. */
  launchOnArrival: boolean;
}

export const useWalkUi = create<WalkUi>(() => ({
  mode: "casual",
  theme: null,
  reason: "",
  draft: null,
  launchOnArrival: false,
}));

/** The open walk, or else the one being set up on its brief. */
export function useBriefWalk(): ActiveWalk | null {
  const open = useAppStore((s) => s.activeWalk);
  const draft = useWalkUi((s) => s.draft);
  return open ?? draft;
}

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
 * Mini-challenges belong to the Guided Walk. A casual walk is the theme on its
 * own: nothing to tick off, stop whenever you're done.
 */
export function challengesFor(theme: Theme | null, mode: WalkMode): string[] {
  return theme && mode === "guided" ? theme.challenges : [];
}
