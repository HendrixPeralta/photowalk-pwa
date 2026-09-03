import { state, save, totalActivityHours, currentStreak } from './store.js';

// Milestones are pure derived facts: each rule reads the stats that already
// exist and says whether it has been earned. `profile.milestonesSeen` records
// the ones that have been celebrated, so each fires exactly once.

const HOUR_MARKS = [1, 5, 10, 25, 50, 100, 250, 500];
const WALK_MARKS = [1, 5, 10, 25, 50, 100];
const STREAK_MARKS = [3, 7, 14, 30, 100];

/** @returns {{id: string, title: string, detail: string}[]} every milestone earned so far. */
function earnedMilestones(walk) {
  const earned = [];
  const hours = totalActivityHours();
  const streak = currentStreak();

  for (const mark of HOUR_MARKS) {
    if (hours >= mark) {
      earned.push({
        id: `hours-${mark}`,
        title: `${mark} hour${mark === 1 ? '' : 's'} shot`,
        detail: 'Time behind the camera is the only thing that compounds.'
      });
    }
  }

  for (const mark of WALK_MARKS) {
    if (state.profile.walksCompleted >= mark) {
      earned.push({
        id: `walks-${mark}`,
        title: `${mark} walk${mark === 1 ? '' : 's'} completed`,
        detail: 'The habit is the point — the photos are the receipt.'
      });
    }
  }

  for (const mark of STREAK_MARKS) {
    if (streak >= mark) {
      earned.push({
        id: `streak-${mark}`,
        title: `${mark}-day streak`,
        detail: 'Showing up on the dull days is what makes the good ones happen.'
      });
    }
  }

  if (walk && walk.challengeCount > 0 && walk.challengesDone === walk.challengeCount) {
    earned.push({
      id: 'clean-sweep',
      title: 'Clean sweep',
      detail: 'Every mini-challenge on a single walk.'
    });
  }

  return earned;
}

/**
 * Awards anything newly earned and returns it, so the caller can celebrate.
 * Pass the just-finished walk record to let per-walk milestones apply.
 */
export function claimNewMilestones(walk) {
  const seen = state.profile.milestonesSeen;
  const fresh = earnedMilestones(walk).filter((m) => !seen.includes(m.id));
  if (!fresh.length) return [];

  seen.push(...fresh.map((m) => m.id));
  save();
  return fresh;
}

/**
 * Marks every already-earned milestone as seen without celebrating. Run once for
 * users who built up stats before milestones existed, so they aren't buried in
 * retroactive badges on their next walk.
 */
export function backfillMilestones() {
  if (state.profile.milestonesSeen.length) return;
  state.profile.milestonesSeen = earnedMilestones(null).map((m) => m.id);
  if (state.profile.milestonesSeen.length) save();
}
