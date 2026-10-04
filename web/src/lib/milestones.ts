// Milestones are pure derived facts: each rule reads stats that already exist
// and says whether it has been earned. `profile.milestonesSeen` records the
// ones that have been celebrated, so each fires exactly once.

import { t } from "./i18n/core";
import type { Profile, WalkRecord } from "@/state/types";

const HOUR_MARKS = [1, 5, 10, 25, 50, 100, 250, 500];
const WALK_MARKS = [1, 5, 10, 25, 50, 100];
const STREAK_MARKS = [3, 7, 14, 30, 100];

export interface Milestone { id: string; title: string; detail: string }

/** The stats milestones are judged on. */
export interface MilestoneFacts {
  totalHours: number;
  walksCompleted: number;
  /** The live streak (currentStreak), not the stored one. */
  streak: number;
}

/** Every milestone earned so far. Pass the just-finished walk to include per-walk ones. */
export function earnedMilestones(facts: MilestoneFacts, walk: WalkRecord | null): Milestone[] {
  const earned: Milestone[] = [];

  for (const mark of HOUR_MARKS) {
    if (facts.totalHours >= mark) {
      earned.push({
        id: `hours-${mark}`,
        title: mark === 1 ? t("{n} hour shot", { n: mark }) : t("{n} hours shot", { n: mark }),
        detail: t("Time behind the camera is the only thing that compounds."),
      });
    }
  }

  for (const mark of WALK_MARKS) {
    if (facts.walksCompleted >= mark) {
      earned.push({
        id: `walks-${mark}`,
        title: mark === 1 ? t("{n} walk completed", { n: mark }) : t("{n} walks completed", { n: mark }),
        detail: t("The habit is the point. The photos are the proof."),
      });
    }
  }

  for (const mark of STREAK_MARKS) {
    if (facts.streak >= mark) {
      earned.push({
        id: `streak-${mark}`,
        title: t("{n}-day streak", { n: mark }),
        detail: t("Showing up on the dull days is what makes the good ones happen."),
      });
    }
  }

  if (walk && walk.challengeCount > 0 && walk.challengesDone === walk.challengeCount) {
    earned.push({
      id: "clean-sweep",
      title: t("Clean sweep"),
      detail: t("Every mini-challenge on a single walk."),
    });
  }

  return earned;
}

/**
 * Marks anything newly earned as seen (mutates `profile`) and returns it, so
 * the caller can celebrate.
 */
export function claimNewMilestones(profile: Profile, facts: MilestoneFacts, walk: WalkRecord | null): Milestone[] {
  const seen = profile.milestonesSeen;
  const fresh = earnedMilestones(facts, walk).filter((m) => !seen.includes(m.id));
  seen.push(...fresh.map((m) => m.id));
  return fresh;
}

/**
 * Marks every already-earned milestone as seen without celebrating, for a
 * profile that built up stats before milestones existed, so it isn't buried
 * in retroactive badges on its next walk. Returns true when anything changed.
 */
export function backfillMilestones(profile: Profile, facts: MilestoneFacts): boolean {
  if (profile.milestonesSeen.length) return false;
  profile.milestonesSeen = earnedMilestones(facts, null).map((m) => m.id);
  return profile.milestonesSeen.length > 0;
}
