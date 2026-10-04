// The year heatmap and the hour goals: grid layout, shading levels, and the
// sentences that report progress. Pure; the components render what this returns.

import { t } from "./i18n/core";
import { formatHours, localDateKey } from "./util";
import type { AppData, GoalPeriod } from "@/state/types";

export const HEATMAP_WEEKS = 52;

// Different periods call for different-sized quick-picks: "3h" makes no sense
// as a yearly suggestion, and "300h" makes no sense as a weekly one.
export const GOAL_PRESETS: Record<GoalPeriod, readonly number[]> = {
  week: [1, 2, 3, 5, 7, 10],
  month: [5, 10, 15, 20, 30, 40],
  year: [50, 100, 150, 200, 300],
};

/** Short month name, translated. */
export function monthName(month: number): string {
  switch (month) {
    case 0: return t("Jan");
    case 1: return t("Feb");
    case 2: return t("Mar");
    case 3: return t("Apr");
    case 4: return t("May");
    case 5: return t("Jun");
    case 6: return t("Jul");
    case 7: return t("Aug");
    case 8: return t("Sep");
    case 9: return t("Oct");
    case 10: return t("Nov");
    default: return t("Dec");
  }
}

/** Shading level 0 to 4 for a day's hours. */
export function levelFor(hours: number): 0 | 1 | 2 | 3 | 4 {
  if (!hours) return 0;
  if (hours <= 1) return 1;
  if (hours <= 2) return 2;
  if (hours <= 4) return 3;
  return 4;
}

/**
 * The last 52 weeks plus this one, as Sunday-first weeks of dates. The final
 * week runs to Saturday, so days after `now` are padding the grid shows empty.
 */
export function buildWeeks(now: Date = new Date()): { weeks: Date[][]; today: Date } {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const start = new Date(today);
  start.setDate(start.getDate() - HEATMAP_WEEKS * 7);
  start.setDate(start.getDate() - start.getDay()); // rewind to the preceding Sunday

  const days: Date[] = [];
  for (const d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) days.push(new Date(d));
  while (days[days.length - 1].getDay() !== 6) {
    const next = new Date(days[days.length - 1]);
    next.setDate(next.getDate() + 1);
    days.push(next);
  }

  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return { weeks, today };
}

/** Totals for the heatmap's footer line, counted over the visible grid. */
export function heatmapTotals(activityLog: AppData["activityLog"], weeks: Date[][], today: Date): { totalHours: number; activeDays: number } {
  let totalHours = 0;
  let activeDays = 0;
  for (const week of weeks) {
    for (const day of week) {
      if (day > today) continue;
      const hours = activityLog[localDateKey(day)] || 0;
      if (hours > 0) { totalHours += hours; activeDays += 1; }
    }
  }
  return { totalHours, activeDays };
}

export function heatmapSummary(activeDays: number, totalHours: number): string {
  const params = { n: activeDays, hours: formatHours(totalHours) };
  return activeDays === 1
    ? t("{n} day out in the last year · {hours} shooting", params)
    : t("{n} days out in the last year · {hours} shooting", params);
}

// Whole sentences per period, so Japanese can place the period word where it needs to.

export function goalStatusText(period: GoalPeriod, done: number, goal: number): string {
  const d = formatHours(done), g = formatHours(goal);
  if (done >= goal) {
    switch (period) {
      case "week": return t("Goal met: {done} this week", { done: d });
      case "month": return t("Goal met: {done} this month", { done: d });
      case "year": return t("Goal met: {done} this year", { done: d });
    }
  }
  switch (period) {
    case "week": return t("{done} of {goal} this week", { done: d, goal: g });
    case "month": return t("{done} of {goal} this month", { done: d, goal: g });
    case "year": return t("{done} of {goal} this year", { done: d, goal: g });
  }
}

export function perPeriodText(period: GoalPeriod, done: number, goal: number): string {
  const params = { done: formatHours(Math.min(done, goal)), goal: formatHours(goal) };
  switch (period) {
    case "week": return t("{done} / {goal} per week", params);
    case "month": return t("{done} / {goal} per month", params);
    case "year": return t("{done} / {goal} per year", params);
  }
}

export function metThisPeriodText(period: GoalPeriod): string {
  switch (period) {
    case "week": return t("Goal met this week");
    case "month": return t("Goal met this month");
    case "year": return t("Goal met this year");
  }
}
