// Rewards are priced in hours of shooting. Each one snapshots the lifetime hour
// total when it's created, so "20h" always means twenty fresh hours of walking:
// hours banked before the goal was set don't count toward it.
//
// Every function takes the rewards and the lifetime hour total explicitly.

import { t } from "./i18n/core";
import { clamp, formatDate, formatHours, uid } from "./util";
import type { Reward } from "@/state/types";

export const MAX_TARGET_HOURS = 1000;

// The Home bar plots rewards on one lifetime-hours axis; a goal that is already
// met would otherwise squash the axis to nothing.
const MIN_AXIS_SPAN_HOURS = 0.5;

export function earnedHours(reward: Reward, totalHours: number): number {
  return Math.max(0, totalHours - reward.baselineHours);
}

export function isEarned(reward: Reward, totalHours: number): boolean {
  return Boolean(reward.claimedAt) || earnedHours(reward, totalHours) >= reward.targetHours;
}

/** The lifetime-hour total at which a reward comes due: its spot on the axis. */
export function targetTotalHours(reward: Reward): number {
  return reward.baselineHours + reward.targetHours;
}

const byTargetTotal = (a: Reward, b: Reward) => targetTotalHours(a) - targetTotalHours(b);

/**
 * A new reward priced at `hours`, counting from `totalHours`. Returns an error
 * message instead when the input doesn't make a reward.
 */
export function newReward(title: string, hours: number, totalHours: number, now = Date.now()): Reward | { error: string } {
  const name = title.trim();
  if (!name) return { error: t("Name the reward you are walking toward.") };
  if (!Number.isFinite(hours) || hours <= 0) return { error: t("Set how many hours of shooting the reward costs.") };
  return {
    id: uid(),
    title: name,
    targetHours: clamp(Math.round(hours * 10) / 10, 0.1, MAX_TARGET_HOURS),
    baselineHours: totalHours,
    createdAt: now,
    claimedAt: null,
    notified: false,
  };
}

export interface RewardProgress {
  id: string;
  title: string;
  earned: number;
  target: number;
  remaining: number;
  done: boolean;
}

/** Active rewards with their progress, nearest to completion first. */
export function activeRewardProgress(rewards: readonly Reward[], totalHours: number): RewardProgress[] {
  return rewards
    .filter((r) => !r.claimedAt)
    .map((r) => {
      const earned = earnedHours(r, totalHours);
      return {
        id: r.id,
        title: r.title,
        earned,
        target: r.targetHours,
        remaining: Math.max(0, r.targetHours - earned),
        done: earned >= r.targetHours,
      };
    })
    .sort((a, b) => a.remaining - b.remaining);
}

/**
 * Flags rewards that have just crossed their target (mutates them) and returns
 * them so the caller can celebrate. The `notified` flag makes each unlock fire
 * once, even though the reward bar re-renders on every visit to Home.
 */
export function claimRewardUnlocks(rewards: Reward[], totalHours: number): Reward[] {
  const unlocked: Reward[] = [];
  for (const r of rewards) {
    if (r.claimedAt || r.notified) continue;
    if (earnedHours(r, totalHours) >= r.targetHours) {
      r.notified = true;
      unlocked.push(r);
    }
  }
  return unlocked;
}

export interface TimelineStop {
  kind: "earned" | "next";
  label: string;
  title: string;
  /** Set on the earned stop, for its Claim button. */
  id?: string;
  /** Position along the bar, 0 to 100. */
  pct: number;
  ready: boolean;
  remaining?: string;
  note: string;
}

export interface RewardTimeline {
  now: number;
  nowPct: number;
  stops: TimelineStop[];
  upcoming: number;
}

/**
 * Places the most recently earned reward and the next two due onto a single
 * lifetime-hours axis, so Home can show where the current hour total sits
 * between the reward just banked and the ones still ahead.
 */
export function rewardTimeline(rewards: readonly Reward[], totalHours: number): RewardTimeline {
  const now = totalHours;
  const earned = rewards.filter((r) => isEarned(r, now)).sort(byTargetTotal);
  const upcoming = rewards.filter((r) => !isEarned(r, now)).sort(byTargetTotal).slice(0, 2);
  const last = earned[earned.length - 1] || null;

  // Without a reward behind us the axis starts where the nearest goal's clock
  // started, not at hour zero; otherwise banked hours inflate the fill.
  const start = last ? targetTotalHours(last)
    : upcoming.length ? Math.min(...upcoming.map((r) => r.baselineHours))
      : 0;

  // The axis is piecewise, not linear in hours: every leg between two stops
  // gets an equal slice of the bar. A far-off reward (say 200h) would otherwise
  // squash the walk toward the next one (10h) into a sliver of fill.
  const nodes = [start, ...upcoming.map(targetTotalHours)];
  const legPct = 100 / Math.max(nodes.length - 1, 1);
  const pctOf = (hours: number) => {
    for (let i = 1; i < nodes.length; i++) {
      if (hours > nodes[i]) continue;
      const leg = Math.max(nodes[i] - nodes[i - 1], MIN_AXIS_SPAN_HOURS);
      const within = (hours - nodes[i - 1]) / leg;
      return clamp((i - 1 + within) * legPct, 0, 100);
    }
    return nodes.length > 1 ? 100 : 0;
  };

  const stops: TimelineStop[] = [];
  if (last) {
    stops.push({
      kind: "earned",
      label: t("Last"),
      title: last.title,
      id: last.id,
      pct: pctOf(targetTotalHours(last)),
      ready: !last.claimedAt,
      note: last.claimedAt ? t("Claimed {date}", { date: formatDate(last.claimedAt) }) : t("Earned: ready to claim"),
    });
  }
  upcoming.forEach((r, i) => {
    stops.push({
      kind: "next",
      label: i === 0 ? t("Next") : t("Then"),
      title: r.title,
      pct: pctOf(targetTotalHours(r)),
      ready: false,
      remaining: formatHours(targetTotalHours(r) - now),
      note: t("{hours} of shooting to go", { hours: formatHours(targetTotalHours(r) - now) }),
    });
  });

  return { now, nowPct: pctOf(now), stops, upcoming: upcoming.length };
}
