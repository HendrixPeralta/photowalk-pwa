import { describe, expect, it } from "vitest";
import { defaultState } from "@/state/defaults";
import type { ActiveWalk } from "@/state/types";
import {
  CASUAL_MAX_HOURS, clockText, computeElapsedHours, currentStreak, dueNudges, nudgeMessage, nudgePlan,
  resumeTimes, updateStreak, validGuidedDuration, walkClock,
} from "./walk";

const T0 = Date.UTC(2026, 5, 1, 9, 0, 0);
const guided = (over: Partial<ActiveWalk> = {}): ActiveWalk => ({
  mode: "guided", themeId: "light", startedAt: T0, durationMin: 30, challengesChecked: [false, false, false],
  nudges: nudgePlan(T0, 30), pausedAt: null, ...over,
});

describe("clock and nudges", () => {
  it("clock text reads mm:ss, and h:mm:ss past the hour", () => {
    const shown = [0, 999, 59_000, 61_000, 3_599_000, 3_600_000, 7_384_000, -5].map(clockText);
    expect(shown).toEqual(["00:00", "00:01", "00:59", "01:01", "59:59", "1:00:00", "2:03:04", "00:00"]);
    expect(clockText(3_725_000)).toBe("1:02:05");
  });

  it("nudges at half time, 85% and the end", () => {
    expect(nudgePlan(T0, 30).map((n) => [n.id, n.at - T0, n.fired])).toEqual([
      ["half", 15 * 60_000, false], ["wrap", 25.5 * 60_000, false], ["end", 30 * 60_000, false],
    ]);
  });

  it("the end nudge is due at the end (it never fired in the old app's page)", () => {
    const walk = guided();
    const end = T0 + 30 * 60000;
    expect(dueNudges(walk, end).map((n) => n.id)).toEqual(["half", "wrap", "end"]);
    expect(dueNudges(walk, T0 + 16 * 60000).map((n) => n.id)).toEqual(["half"]);
    walk.nudges[0].fired = true;
    expect(dueNudges(walk, T0 + 16 * 60000)).toEqual([]);
  });

  it("the halfway nudge suggests the first open challenge", () => {
    const challenges = ["Find a puddle", "Shoot low", "Hide the subject"];
    expect(nudgeMessage("half", challenges, [true, false, false])).toBe("Halfway there! Try: Shoot low");
    expect(nudgeMessage("half", challenges, [true, true, true])).toBe("Halfway there! Try: revisit your favorite shot from a new angle");
    expect(nudgeMessage("half")).toBe("Halfway there! Try: a new angle on your theme");
  });

  it("walkClock reports every phase", () => {
    expect(walkClock(guided({ startedAt: null }), T0).phase).toBe("brief");
    expect(walkClock(guided(), T0 + 60_000)).toMatchObject({ phase: "guided", remaining: 29 * 60_000 });
    expect(walkClock(guided(), T0 + 31 * 60_000).phase).toBe("expired");
    expect(walkClock(guided({ pausedAt: T0 + 5_000 }), T0 + 99_000)).toEqual({ phase: "paused", elapsed: 5_000 });
    expect(walkClock(guided({ mode: "casual", durationMin: null }), T0 + 7_000)).toEqual({ phase: "casual", elapsed: 7_000 });
  });
});

describe("banked hours", () => {
  it("caps at the guided length or 8 casual hours, and stops at a pause", () => {
    const now = T0 + 45 * 60000;
    const hours = [
      guided(), // capped at the 30 minute length
      guided({ pausedAt: T0 + 10 * 60000 }), // the time up to the pause
      guided({ mode: "casual", durationMin: null }),
      guided({ mode: "casual", durationMin: null, startedAt: T0 - 20 * 3600000 }), // left open overnight
    ].map((walk) => computeElapsedHours(walk, now));
    expect(hours[0]).toBe(0.5);
    expect(hours[1]).toBeCloseTo(10 / 60, 10);
    expect(hours[2]).toBe(0.75);
    expect(hours[3]).toBe(CASUAL_MAX_HOURS);
  });

  it("resuming slides the start and the nudges by the pause length", () => {
    const walk = guided({ pausedAt: T0 + 60_000 });
    const before = walk.nudges.map((n) => n.at);
    resumeTimes(walk, T0 + 5 * 60_000);
    expect(walk.startedAt).toBe(T0 + 4 * 60_000);
    expect(walk.nudges.map((n) => n.at)).toEqual(before.map((at) => at + 4 * 60_000));
    expect(walk.pausedAt).toBeNull();
  });

  it("only accepts the offered lengths", () => {
    expect(validGuidedDuration(45)).toBe(45);
    expect(validGuidedDuration("15")).toBe(15);
    expect(validGuidedDuration(17)).toBe(30);
  });
});

describe("streak", () => {
  const day = (d: number, h = 12) => new Date(2026, 5, d, h);

  it("grows on consecutive days, resets after a gap, and counts each day once", () => {
    const { profile } = defaultState();
    updateStreak(profile, day(1));
    updateStreak(profile, day(1, 20));
    updateStreak(profile, day(2));
    expect(profile.streak).toBe(2);
    expect(profile.walksCompleted).toBe(3);
    updateStreak(profile, day(5));
    expect(profile.streak).toBe(1);
    expect(profile.longestStreak).toBe(2);
  });

  it("the live streak dies after a missed day", () => {
    const { profile } = defaultState();
    updateStreak(profile, day(1));
    updateStreak(profile, day(2));
    expect(currentStreak(profile, day(3))).toBe(2);
    expect(currentStreak(profile, day(4))).toBe(0);
  });
});
