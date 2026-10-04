// Numbers derived from the saved activity: lifetime totals, per-period hours,
// and per-theme walk counts. Pure functions of the data passed in.

import { WALK_HISTORY_LIMIT } from "@/state/defaults";
import type { AppData, GoalPeriod, WalkRecord } from "@/state/types";
import { localDateKey } from "./util";

/** Lifetime hours logged to the heatmap: the currency rewards are priced in. */
export function totalActivityHours(activityLog: AppData["activityLog"]): number {
  return Object.values(activityLog).reduce((sum, h) => sum + (h || 0), 0);
}

/** Lifetime frames logged, summed from the same daily log the film strip reads. */
export function totalFramesLogged(frameLog: AppData["frameLog"] | null | undefined): number {
  return Object.values(frameLog || {}).reduce((sum, n) => sum + (n || 0), 0);
}

/** Midnight at the start of the given period's current instance: this week/month/year. */
export function periodStart(period: GoalPeriod, now: Date = new Date()): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  if (period === "month") { d.setDate(1); return d; }
  if (period === "year") { d.setMonth(0, 1); return d; }
  d.setDate(d.getDate() - d.getDay()); // week: rewind to the preceding Sunday
  return d;
}

/** Hours logged since the start of the current week/month/year, matching the heatmap's week start. */
export function hoursInPeriod(activityLog: AppData["activityLog"], period: GoalPeriod, now: Date = new Date()): number {
  const start = periodStart(period, now);
  let total = 0;
  for (const d = new Date(start); d <= now; d.setDate(d.getDate() + 1)) {
    total += activityLog[localDateKey(d)] || 0;
  }
  return total;
}

/** Hours logged toward one specific theme within the given period, read from walk history. */
export function hoursForThemeInPeriod(walkHistory: readonly WalkRecord[], themeId: string, period: GoalPeriod, now: Date = new Date()): number {
  const start = periodStart(period, now).getTime();
  const end = now.getTime();
  let total = 0;
  for (const w of walkHistory) {
    if (w.themeId === themeId && w.endedAt >= start && w.endedAt <= end) total += w.hours || 0;
  }
  return total;
}

/** How many times each theme has been walked, keyed by theme id. */
export function themeWalkCounts(walkHistory: readonly WalkRecord[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const w of walkHistory) {
    if (w.themeId) counts[w.themeId] = (counts[w.themeId] || 0) + 1;
  }
  return counts;
}

/** Adds hours spent shooting to a day's tally in the activity heatmap (mutates `data`). */
export function addActivityHours(data: Pick<AppData, "activityLog">, hours: number, dateKey: string = localDateKey()): void {
  if (!hours || hours <= 0) return;
  data.activityLog[dateKey] = (data.activityLog[dateKey] || 0) + hours;
}

/**
 * Counts one photo against a day (mutates `data`). Logged from Live Walk and
 * when a reference is saved to the album, so "photos" means the same thing
 * everywhere it is shown.
 */
export function addFrame(data: Pick<AppData, "frameLog">, dateKey: string = localDateKey()): void {
  data.frameLog[dateKey] = (data.frameLog[dateKey] || 0) + 1;
}

/** Files a finished walk at the front of the history, capped at WALK_HISTORY_LIMIT (mutates `data`). */
export function recordWalk(data: Pick<AppData, "walkHistory">, entry: WalkRecord): void {
  data.walkHistory.unshift(entry);
  if (data.walkHistory.length > WALK_HISTORY_LIMIT) data.walkHistory.length = WALK_HISTORY_LIMIT;
}
