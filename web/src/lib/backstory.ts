/**
 * Generates a plausible practice history (the activity log, the walks behind
 * it, the frames, the reward ladder and the theme goals), all derived from one
 * generated log so the heatmap, the streak badge, the goal bars and the reward
 * timeline can never disagree with each other.
 *
 * Two callers, same generator:
 *  - the demo fixture seeds a full year for screenshots, parked over the real
 *    profile and reversible;
 *  - a brand-new profile gets three months written in for keeps, so it has
 *    something to show instead of an empty grid.
 *
 * Pure: buildBackstory() returns the history instead of writing it, and the
 * current time and id generator are passed in, so the same seed and clock
 * always produce the same result.
 */

import { RAW_THEMES } from "./content/catalog";
import { t } from "./i18n/core";
import { earnedMilestones } from "./milestones";
import { totalActivityHours } from "./stats";
import { formatHours, localDateKey } from "./util";
import type { AppData, GoalPeriod, Profile, Reward, ThemeGoal, WalkRecord } from "@/state/types";

export interface BackstoryConfig {
  seed: number;
  /** Length of the window, ending today. */
  days: number;
  /** Consecutive active days ending today. */
  streakDays: number;
  /** How full this week's goal bar reads, 0 to 1. */
  weekFill: number;
  weeklyGoal: number;
  monthlyGoal: number;
  yearlyGoal: number;
  /** Chance of going out on a day at the start of the window... */
  baseChance: number;
  /** ...rising by this much by today, as the habit takes hold. */
  rampChance: number;
  weekendBonus: number;
  /** Gaps cut into the history, in days ago (from is the older edge). */
  slumps: { from: number; to: number }[];
  /** Ages in days of the four rewards: claimed, just earned, next, later. */
  rewardAgeDays: [number, number, number, number];
}

/** Three months of practice for a new profile. Written once, then ordinary history. */
export const STARTER: BackstoryConfig = {
  seed: 20260608,
  days: 91,
  streakDays: 6,
  weekFill: 0.68,
  weeklyGoal: 3,
  // Denser than the year fixture: three months has to read as a habit already
  // forming, and the same odds that fill a year leave a quarter looking sparse.
  baseChance: 0.28,
  rampChance: 0.3,
  weekendBonus: 0.18,
  monthlyGoal: 15,
  yearlyGoal: 150,
  // Two gaps inside the window: a week off and a long weekend, because three
  // unbroken months of shooting is not a history anyone recognises.
  slumps: [{ from: 74, to: 67 }, { from: 38, to: 34 }],
  rewardAgeDays: [86, 58, 32, 14],
};

/** A full heatmap year, for screenshots and demos. */
export const DEMO_YEAR: BackstoryConfig = {
  seed: 20260908,
  days: 364,
  streakDays: 9, // must cover the current week
  weekFill: 0.72,
  weeklyGoal: 3,
  // Sized so Month and Year also read as progress in flight if the segment is
  // tapped during a demo, instead of one bar full and another empty.
  monthlyGoal: 15,
  yearlyGoal: 200,
  baseChance: 0.16,
  rampChance: 0.34,
  weekendBonus: 0.2,
  slumps: [{ from: 250, to: 232 }, { from: 128, to: 111 }],
  rewardAgeDays: [300, 70, 40, 20],
};

/** Deterministic PRNG (mulberry32): the same seed always generates the same history. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

type Rand = () => number;
type Log = Record<string, number>;

const round = (h: number) => Math.round(h * 10) / 10;

function midnight(now: Date, offsetDays = 0): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - offsetDays);
  return d;
}

/**
 * A session length in hours. Most walks are the 30 to 90 minute kind; the long
 * weekend outing is rare on purpose, because it is what paints the darkest
 * squares on the heatmap and those should feel earned.
 */
function sessionHours(rand: Rand, weekend: boolean): number {
  const roll = rand();
  if (weekend && roll > 0.88) return round(4.2 + rand() * 1.6); // level 4
  if (roll > 0.78) return round(2.2 + rand() * 1.6); // level 3
  if (roll > 0.42) return round(1.1 + rand() * 0.9); // level 2
  return round(0.5 + rand() * 0.5); // level 1
}

/**
 * Builds the activity log back to front. The chance of going out climbs across
 * the window and the configured slumps are cut into it, because unbroken
 * practice looks synthetic.
 */
function buildActivityLog(rand: Rand, cfg: BackstoryConfig, now: Date): Log {
  const inSlump = (ago: number) => cfg.slumps.some((s) => ago <= s.from && ago >= s.to);
  const log: Log = {};
  for (let ago = cfg.days; ago >= 0; ago--) {
    const day = midnight(now, ago);
    const weekend = day.getDay() === 0 || day.getDay() === 6;
    const progress = 1 - ago / cfg.days; // 0 at the start of the window, 1 today
    let p = cfg.baseChance + progress * cfg.rampChance + (weekend ? cfg.weekendBonus : 0);
    if (inSlump(ago)) p = 0.04;
    if (rand() > p) continue;
    log[localDateKey(day)] = sessionHours(rand, weekend);
  }
  return log;
}

/** Guarantees the badge number: the last N days, today included, are all active. */
function forceStreak(log: Log, rand: Rand, cfg: BackstoryConfig, now: Date): void {
  for (let ago = cfg.streakDays - 1; ago >= 0; ago--) {
    const day = midnight(now, ago);
    const key = localDateKey(day);
    if (!log[key]) log[key] = sessionHours(rand, day.getDay() === 0 || day.getDay() === 6);
  }
}

/**
 * Rewrites this week's hours so the goal bar lands on a readable fraction of
 * the target. The days stay active (the streak depends on them); only the
 * amounts are redistributed, so the bar and the heatmap still tell one story.
 */
function tuneCurrentWeek(log: Log, rand: Rand, cfg: BackstoryConfig, now: Date): void {
  const target = round(cfg.weeklyGoal * cfg.weekFill);
  const days: Date[] = [];
  for (let ago = now.getDay(); ago >= 0; ago--) days.push(midnight(now, ago));

  // Weight the days randomly, then scale them to hit the target exactly.
  const weights = days.map(() => 0.6 + rand());
  const sum = weights.reduce((a, b) => a + b, 0);
  let assigned = 0;
  days.forEach((day, i) => {
    const isLast = i === days.length - 1;
    const hours = isLast ? round(target - assigned) : round((target * weights[i]) / sum);
    assigned = round(assigned + hours);
    log[localDateKey(day)] = Math.max(0.2, hours);
  });
}

/** The run of consecutive active days ending today: what the badge must say. */
function runEndingToday(log: Log, now: Date): number {
  let run = 0;
  for (let ago = 0; log[localDateKey(midnight(now, ago))]; ago++) run++;
  return run;
}

/** The longest run of consecutive active days anywhere in the log. */
function longestRun(log: Log, cfg: BackstoryConfig, now: Date): number {
  let best = 0;
  let run = 0;
  for (let ago = cfg.days; ago >= 0; ago--) {
    run = log[localDateKey(midnight(now, ago))] ? run + 1 : 0;
    if (run > best) best = run;
  }
  return best;
}

/**
 * One walk record per active day (occasionally two, split across the day), so
 * theme goals and theme suggestions read the same hours the heatmap shows.
 * Themes are drawn from a small favourites pool plus the long tail, the way a
 * real user's history skews.
 */
function buildWalkHistory(log: Log, rand: Rand, cfg: BackstoryConfig, now: Date, uid: () => string): WalkRecord[] {
  const favourites = ["golden-hour", "street-candid", "leading-lines", "night-lights", "reflections"];
  const ids = RAW_THEMES.map((th) => th.id);
  const pickTheme = () => (rand() < 0.55
    ? favourites[Math.floor(rand() * favourites.length)]
    : ids[Math.floor(rand() * ids.length)]);

  const history: WalkRecord[] = [];
  for (let ago = cfg.days; ago >= 0; ago--) {
    const day = midnight(now, ago);
    const hours = log[localDateKey(day)];
    if (!hours) continue;

    const split = hours > 2.5 && rand() < 0.35;
    const parts = split ? [round(hours * 0.6), round(hours - round(hours * 0.6))] : [hours];

    parts.forEach((part, i) => {
      const endedAt = new Date(day);
      endedAt.setHours(i === 0 ? 11 + Math.floor(rand() * 4) : 18 + Math.floor(rand() * 2), Math.floor(rand() * 60));
      const guided = rand() < 0.6;
      // Casual walks carry no checklist: mini-challenges are a Guided walk
      // feature, and the history has to agree with that.
      const challengeCount = guided ? 3 : 0;
      history.push({
        id: uid(),
        themeId: pickTheme(),
        mode: guided ? "guided" : "casual",
        durationMin: Math.round(part * 60),
        hours: part,
        challengesDone: guided ? Math.min(challengeCount, Math.floor(rand() * 4)) : 0,
        challengeCount,
        // Today's walk cannot have ended in the future, and period totals drop
        // anything past now.
        endedAt: Math.min(endedAt.getTime(), now.getTime() - 60000),
        tipDismissed: true,
      });
    });
  }
  return history.sort((a, b) => b.endedAt - a.endedAt);
}

/**
 * Four rewards positioned against the lifetime hour total: one claimed early
 * on, one just earned (the timeline's "Last"), and two ahead of the current
 * total so the Home bar has a "Next" and a "Then" to point at. Baselines are
 * offsets back from the total, so the geometry holds whether the window is
 * three months or a year.
 */
function buildRewards(total: number, nowMs: number, cfg: BackstoryConfig, uid: () => string): Reward[] {
  const day = 86400000;
  const [oldest, earnedAge, nextAge, laterAge] = cfg.rewardAgeDays;
  return [
    {
      id: uid(),
      title: t("Coffee and a contact sheet"),
      targetHours: 5,
      baselineHours: round(Math.max(0, total - 48)),
      createdAt: nowMs - oldest * day,
      claimedAt: nowMs - Math.round(oldest * 0.4) * day,
      notified: true,
    },
    {
      id: uid(),
      title: t("Roll of Portra 400"),
      targetHours: 12,
      // Earned 8 hours back, so the timeline has room behind the marker as
      // well as ahead of it: the fill sits along the bar instead of pinned left.
      baselineHours: round(Math.max(0, total - 20)),
      createdAt: nowMs - earnedAge * day,
      claimedAt: null,
      notified: true,
    },
    {
      id: uid(),
      title: t("New 35mm lens"),
      targetHours: 20,
      baselineHours: round(Math.max(0, total - 16)), // 80% of the way there
      createdAt: nowMs - nextAge * day,
      claimedAt: null,
      notified: false,
    },
    {
      id: uid(),
      title: t("Weekend trip to shoot the coast"),
      targetHours: 30,
      baselineHours: round(Math.max(0, total - 14)),
      createdAt: nowMs - laterAge * day,
      claimedAt: null,
      notified: false,
    },
  ];
}

/** Hours per theme since a moment, mirroring hoursForThemeInPeriod. */
function themeHoursSince(history: WalkRecord[], since: number): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const w of history) {
    if (w.endedAt >= since) counts[w.themeId] = (counts[w.themeId] || 0) + w.hours;
  }
  return counts;
}

/**
 * Theme goals for whatever the generated history actually favours, each priced
 * against the hours already logged in its own period: a weekly goal sized off
 * a month of shooting would render as a nearly empty bar.
 */
function buildThemeGoals(history: WalkRecord[], now: Date, uid: () => string): ThemeGoal[] {
  const weekStart = midnight(now, now.getDay()).getTime();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const top = (counts: Record<string, number>) => Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const weekTop = top(themeHoursSince(history, weekStart));
  const monthTop = top(themeHoursSince(history, monthStart));

  const goals: ThemeGoal[] = [];
  // 1.35x what has been shot puts each bar around three-quarters full.
  if (weekTop) {
    goals.push({ id: uid(), themeId: weekTop[0], hours: Math.max(1, Math.round(weekTop[1] * 1.35 * 2) / 2), period: "week" as GoalPeriod });
  }
  if (monthTop && (!weekTop || monthTop[0] !== weekTop[0])) {
    goals.push({ id: uid(), themeId: monthTop[0], hours: Math.max(2, Math.round(monthTop[1] * 1.35 * 2) / 2), period: "month" as GoalPeriod });
  }
  return goals;
}

/**
 * Frames exposed per shooting day, derived from the hours actually logged so
 * the film strip and the heatmap can never disagree. Roughly 18 frames an hour
 * with some scatter: a working rate for someone shooting deliberately.
 */
function buildFrameLog(log: Log, rand: Rand): Log {
  const frames: Log = {};
  for (const [key, hours] of Object.entries(log)) {
    if (!hours) continue;
    frames[key] = Math.max(1, Math.round(hours * (14 + rand() * 10)));
  }
  return frames;
}

/** The slice of saved data a backstory replaces. */
export interface Backstory {
  activityLog: Log;
  frameLog: Log;
  walkHistory: WalkRecord[];
  lastWalk: WalkRecord | null;
  rewards: Reward[];
  /** Fields to overwrite on the profile. */
  profile: Pick<Profile, "streak" | "longestStreak" | "lastWalkDate" | "walksCompleted" | "photosAnalyzed" | "goals" | "goalPeriod" | "milestonesSeen" | "themeGoals">;
  summary: { seed: number; days: number; activeDays: number; walks: number; totalHours: string; streak: number; thisWeek: string };
}

/**
 * Generates a history. Photos, rooms, custom themes and reminders are not
 * part of it, so applying it leaves them alone.
 */
export function buildBackstory(cfg: BackstoryConfig, { now, uid }: { now: Date; uid: () => string }): Backstory {
  const rand = rng(cfg.seed);

  const log = buildActivityLog(rand, cfg, now);
  forceStreak(log, rand, cfg, now);
  tuneCurrentWeek(log, rand, cfg, now);

  const history = buildWalkHistory(log, rand, cfg, now, uid);
  const frameLog = buildFrameLog(log, rand);
  const walkHistory = history.slice(0, 200);

  const total = totalActivityHours(log);
  const walks = history.length;
  // Read the streak back off the log rather than asserting cfg.streakDays: the
  // random days either side can extend the run, and a badge that disagrees with
  // the squares next to it is the one thing that always reads as fake.
  const streak = runEndingToday(log, now);
  const rewards = buildRewards(total, now.getTime(), cfg, uid);
  const themeGoals = buildThemeGoals(walkHistory, now, uid);

  // Every milestone the history has already earned counts as seen, so the app
  // doesn't open to a badge storm.
  const milestonesSeen = earnedMilestones({ totalHours: total, walksCompleted: walks, streak }, null).map((m) => m.id);

  return {
    activityLog: log,
    frameLog,
    walkHistory,
    lastWalk: walkHistory[0] || null,
    rewards,
    profile: {
      streak,
      longestStreak: Math.max(streak, longestRun(log, cfg, now)),
      lastWalkDate: now.toDateString(),
      walksCompleted: walks,
      photosAnalyzed: Math.round(walks * 1.6),
      goals: { week: cfg.weeklyGoal, month: cfg.monthlyGoal, year: cfg.yearlyGoal },
      goalPeriod: "week",
      milestonesSeen,
      themeGoals,
    },
    summary: {
      seed: cfg.seed,
      days: cfg.days,
      activeDays: Object.keys(log).length,
      walks,
      totalHours: formatHours(total),
      streak,
      thisWeek: `${formatHours(cfg.weeklyGoal * cfg.weekFill)} of ${formatHours(cfg.weeklyGoal)}`,
    },
  };
}

/** Writes a backstory into saved data (mutates `data`). */
export function applyBackstory(data: AppData, story: Backstory): void {
  data.activityLog = story.activityLog;
  data.frameLog = story.frameLog;
  data.walkHistory = story.walkHistory;
  data.lastWalk = story.lastWalk;
  data.rewards = story.rewards;
  Object.assign(data.profile, story.profile);
}
