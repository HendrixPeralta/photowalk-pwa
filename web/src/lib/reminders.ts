// Walk reminders: which days and time, the copy they carry, and when the
// in-app fallback should speak up. Pure; delivery lives in lib/notify (later).
//
// The old app tried to schedule notifications ahead through Notification
// Triggers, which never shipped in any browser outside an experiment, so that
// path is gone. What remains is what actually ran: reminders while the app is
// open, and a nudge on the next open on a planned day.

import { getLang, t } from "./i18n/core";
import { earnedHours } from "./rewards";
import { localDateKey } from "./util";
import type { AppData, Reminder, Reward } from "@/state/types";

export const SCHEDULE_AHEAD_DAYS = 14;

/** One-letter chip labels. Single letters repeat (S, T), so they can't be t() keys; Japanese gets its own set. */
export function dayLabels(): string[] {
  return getLang() === "ja" ? ["日", "月", "火", "水", "木", "金", "土"] : ["S", "M", "T", "W", "T", "F", "S"];
}

export function dayName(day: number): string {
  switch (day) {
    case 0: return t("Sunday");
    case 1: return t("Monday");
    case 2: return t("Tuesday");
    case 3: return t("Wednesday");
    case 4: return t("Thursday");
    case 5: return t("Friday");
    default: return t("Saturday");
  }
}

export function dayShort(day: number): string {
  switch (day) {
    case 0: return t("Sun");
    case 1: return t("Mon");
    case 2: return t("Tue");
    case 3: return t("Wed");
    case 4: return t("Thu");
    case 5: return t("Fri");
    default: return t("Sat");
  }
}

const parseTime = (time: string) => {
  const [hh, mm] = String(time || "18:00").split(":").map(Number);
  return { hh: hh || 0, mm: mm || 0 };
};

/** The next reminder timestamps, soonest first, over the scheduling window. */
export function upcomingTimes(reminder: Reminder, now: Date = new Date()): number[] {
  if (!reminder.days.length) return [];
  const { hh, mm } = parseTime(reminder.time);
  const times: number[] = [];
  for (let offset = 0; offset <= SCHEDULE_AHEAD_DAYS; offset++) {
    const d = new Date(now);
    d.setDate(d.getDate() + offset);
    d.setHours(hh, mm, 0, 0);
    if (reminder.days.includes(d.getDay()) && d.getTime() > now.getTime()) times.push(d.getTime());
  }
  return times;
}

/** The reminder's message: the nearest unclaimed reward if there's one to chase. */
export function reminderBody(rewards: readonly Reward[], totalHours: number): string {
  const pending = rewards.find((r) => !r.claimedAt);
  if (pending) {
    const left = Math.round((pending.targetHours - earnedHours(pending, totalHours)) * 10) / 10;
    if (left > 0) return t('Time for a walk! {hours} of shooting left to earn "{title}".', { hours: t("{n}h", { n: left }), title: pending.title });
  }
  return t("Time for a walk! Grab a theme and go shoot for a bit.");
}

/**
 * Whether to show the "you planned a walk today" toast on open: a planned
 * day, past the reminder time, no walk running, and nothing logged yet today.
 */
export function shouldNudgeOnOpen(data: Pick<AppData, "reminder" | "activeWalk" | "activityLog">, now: Date = new Date()): boolean {
  const { enabled, days, time } = data.reminder;
  if (!enabled || !days.includes(now.getDay())) return false;
  if (data.activeWalk) return false;
  if (data.activityLog[localDateKey(now)]) return false; // already been out today
  const { hh, mm } = parseTime(time);
  const due = new Date(now);
  due.setHours(hh, mm, 0, 0);
  return now.getTime() >= due.getTime();
}

export type NotificationAccess = NotificationPermission | "unsupported";

/** The line under the reminder settings. */
export function reminderStatus(reminder: Reminder, access: NotificationAccess): string {
  if (!reminder.enabled) return "";
  if (!reminder.days.length) return t("Pick at least one day.");
  const names = reminder.days.map(dayShort).join(getLang() === "ja" ? "・" : ", ");
  if (access !== "granted") return t("{days}. PhotoEYE will remind you the next time you open the app.", { days: names });
  return t("{days}. This browser only shows reminders while PhotoEYE is open.", { days: names });
}
