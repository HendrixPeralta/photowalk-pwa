// Walk timing: lengths, the guided nudge plan, the clock, pause/resume and
// the streak. Pure, so the walk engine (a component) only wires these to time.

import { N, t } from "./i18n/core";
import type { ActiveWalk, Nudge, NudgeId, Profile, WalkMode } from "@/state/types";

export const GUIDED_DURATIONS = [2, 15, 30, 45, 60] as const;
export const DEFAULT_GUIDED_MIN = 30;

// A casual walk has no timer, so cap what a forgotten one can log to the heatmap.
export const CASUAL_MAX_HOURS = 8;
// Past this, a casual walk was probably left open rather than actually walked.
// Hours buy rewards, so confirm the number instead of banking it silently.
export const CASUAL_CONFIRM_HOURS = 2;

/** The length choices for the walk brief's select. */
export function durationOptions(): { value: number; label: string }[] {
  return GUIDED_DURATIONS.map((value) => ({
    value,
    label: value === 2 ? t("2 min (quick demo)") : t("{n} min", { n: value }),
  }));
}

/** A stored guided length, falling back to the default if it isn't one of the choices. */
export function validGuidedDuration(minutes: unknown): number {
  const n = Number(minutes);
  return (GUIDED_DURATIONS as readonly number[]).includes(n) ? n : DEFAULT_GUIDED_MIN;
}

const MODE_INFO: Record<WalkMode, { title: string; desc: string; best: string }> = {
  casual: {
    title: N("Casual Walk"),
    desc: N("You get a theme to look for, like Reflections or Look Up, and that's it. There's no timer and no checklist, so wander at your own pace and stop whenever you like."),
    best: N("Best for: easing in, walks with friends, or when you just want an excuse to get out with your camera."),
  },
  guided: {
    title: N("Guided Walk"),
    desc: N("The same themes, with more structure. You pick a length (15 to 60 minutes), get a few mini-challenges to tick off, and receive a nudge halfway through and another near the end."),
    best: N("Best for: building skills, or when you tend to run out of ideas once you are out."),
  },
};

/** The "Learn more" explanation for each walk mode, translated. */
export function modeInfo(mode: WalkMode): { title: string; desc: string; best: string } {
  const info = MODE_INFO[mode];
  return { title: t(info.title), desc: t(info.desc), best: t(info.best) };
}

/* ---------- Guided nudges ---------- */

export function nudgePlan(startedAt: number, durationMin: number): Nudge[] {
  const totalMs = durationMin * 60000;
  return [
    { id: "half", at: startedAt + Math.round(totalMs * 0.5), fired: false },
    { id: "wrap", at: startedAt + Math.round(totalMs * 0.85), fired: false },
    { id: "end", at: startedAt + totalMs, fired: false },
  ];
}

/** Nudges that are due and haven't fired yet, in plan order. */
export function dueNudges(walk: Pick<ActiveWalk, "nudges">, now: number): Nudge[] {
  return (walk.nudges || []).filter((n) => !n.fired && n.at <= now);
}

/**
 * What a nudge says. The halfway nudge suggests the first challenge not yet
 * ticked off, so it nudges toward something actually left to do.
 */
export function nudgeMessage(id: NudgeId, challenges: readonly string[] = [], checked: readonly boolean[] = []): string {
  if (id === "half") {
    let challenge: string;
    if (!challenges.length) challenge = t("a new angle on your theme");
    else {
      const idx = checked.findIndex((c) => !c);
      challenge = idx === -1 ? t("revisit your favorite shot from a new angle") : challenges[idx] ?? t("a new angle on your theme");
    }
    return t("Halfway there! Try: {challenge}", { challenge });
  }
  if (id === "wrap") return t("Almost time to wrap up. Grab one more shot before you go.");
  return t("Time's up, nice work! Now share your best shots with your walk partners.");
}

/* ---------- Clock ---------- */

/** mm:ss, or h:mm:ss once a walk passes the hour; casual walks often do. */
export function clockText(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const mm = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export type WalkClock =
  | { phase: "brief" }
  | { phase: "paused"; elapsed: number }
  | { phase: "casual"; elapsed: number }
  | { phase: "guided"; elapsed: number; remaining: number; totalMs: number; progress: number }
  | { phase: "expired"; elapsed: number };

/**
 * Where a walk's clock stands at `now`. A paused walk reports the time up to
 * the pause; a guided walk past its length is "expired" and should finish.
 */
export function walkClock(walk: ActiveWalk, now: number): WalkClock {
  if (!walk.startedAt) return { phase: "brief" };
  if (walk.pausedAt) return { phase: "paused", elapsed: walk.pausedAt - walk.startedAt };
  const elapsed = now - walk.startedAt;
  if (walk.mode !== "guided" || !walk.durationMin) return { phase: "casual", elapsed };
  const totalMs = walk.durationMin * 60000;
  if (elapsed >= totalMs) return { phase: "expired", elapsed };
  return { phase: "guided", elapsed, remaining: totalMs - elapsed, totalMs, progress: Math.max(0, Math.min(1, elapsed / totalMs)) };
}

/**
 * Hours a finished walk banks. Capped at the guided length, or at
 * CASUAL_MAX_HOURS for a casual walk. Finishing from a paused walk banks the
 * time up to the pause, not the wall-clock time since, or a walk left paused
 * overnight logs the night.
 */
export function computeElapsedHours(walk: ActiveWalk, now: number): number {
  if (!walk.startedAt) return 0;
  const capMs = walk.mode === "guided" && walk.durationMin ? walk.durationMin * 60000 : CASUAL_MAX_HOURS * 3600000;
  const until = walk.pausedAt || now;
  return Math.max(0, Math.min(until - walk.startedAt, capMs)) / 3600000;
}

/**
 * Resumes a paused walk in place. Rather than track a separate "paused for"
 * total, resuming slides startedAt (and every scheduled nudge) forward by the
 * length of the pause, so elapsed time, the countdown, the nudge plan and the
 * hours banked at the end all stay consistent with one number.
 */
export function resumeTimes(walk: ActiveWalk, now: number): void {
  if (!walk.pausedAt || !walk.startedAt) return;
  const delta = now - walk.pausedAt;
  walk.startedAt += delta;
  (walk.nudges || []).forEach((n) => { n.at += delta; });
  walk.pausedAt = null;
}

/* ---------- Streak ---------- */

const dayBefore = (now: Date) => {
  const d = new Date(now);
  d.setDate(d.getDate() - 1);
  return d;
};

/** Counts a finished walk toward the streak and the lifetime total (mutates `profile`). */
export function updateStreak(profile: Profile, now: Date = new Date()): void {
  const todayKey = now.toDateString();
  if (profile.lastWalkDate !== todayKey) {
    profile.streak = profile.lastWalkDate === dayBefore(now).toDateString() ? profile.streak + 1 : 1;
    profile.lastWalkDate = todayKey;
    profile.longestStreak = Math.max(profile.longestStreak || 0, profile.streak);
  }
  profile.walksCompleted += 1;
}

/**
 * The streak as of `now`. profile.streak is only rewritten when a walk
 * finishes, so reading it raw keeps showing a dead streak for days; anything
 * user-facing should ask here instead.
 */
export function currentStreak(profile: Pick<Profile, "streak" | "lastWalkDate">, now: Date = new Date()): number {
  const { streak, lastWalkDate } = profile;
  if (!streak || !lastWalkDate) return 0;
  const alive = lastWalkDate === now.toDateString() || lastWalkDate === dayBefore(now).toDateString();
  return alive ? streak : 0;
}
