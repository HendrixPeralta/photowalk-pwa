import { describe, expect, it } from "vitest";
import { defaultState, WALK_HISTORY_LIMIT } from "@/state/defaults";
import type { WalkRecord } from "@/state/types";
import { addActivityHours, addFrame, hoursForThemeInPeriod, hoursInPeriod, periodStart, recordWalk, themeWalkCounts, totalActivityHours } from "./stats";

const walk = (themeId: string, endedAt: number, hours = 1): WalkRecord =>
  ({ id: themeId + endedAt, themeId, mode: "casual", durationMin: null, hours, challengesDone: 0, challengeCount: 0, endedAt });

describe("stats", () => {
  // Wednesday 2026-06-10.
  const wed = new Date(2026, 5, 10, 15, 0);

  it("weeks start on Sunday, months on the 1st, years on Jan 1", () => {
    expect(periodStart("week", wed)).toEqual(new Date(2026, 5, 7));
    expect(periodStart("month", wed)).toEqual(new Date(2026, 5, 1));
    expect(periodStart("year", wed)).toEqual(new Date(2026, 0, 1));
  });

  it("sums hours inside the period only", () => {
    const data = defaultState();
    addActivityHours(data, 1, "2026-06-06"); // last Saturday: previous week
    addActivityHours(data, 2, "2026-06-07");
    addActivityHours(data, 0.5, "2026-06-10");
    addActivityHours(data, 0.5, "2026-06-10");
    addActivityHours(data, -3, "2026-06-10"); // ignored
    expect(hoursInPeriod(data.activityLog, "week", wed)).toBe(3);
    expect(hoursInPeriod(data.activityLog, "month", wed)).toBe(4);
    expect(totalActivityHours(data.activityLog)).toBe(4);
  });

  it("counts hours and walks per theme", () => {
    const history = [walk("a", wed.getTime() - 3600000, 2), walk("a", new Date(2026, 4, 1).getTime()), walk("b", wed.getTime() - 60000)];
    expect(hoursForThemeInPeriod(history, "a", "week", wed)).toBe(2);
    expect(hoursForThemeInPeriod(history, "a", "year", wed)).toBe(3);
    expect(themeWalkCounts(history)).toEqual({ a: 2, b: 1 });
  });

  it("caps the walk history", () => {
    const data = defaultState();
    for (let i = 0; i < WALK_HISTORY_LIMIT + 5; i++) recordWalk(data, walk("x", i));
    expect(data.walkHistory).toHaveLength(WALK_HISTORY_LIMIT);
    expect(data.walkHistory[0].endedAt).toBe(WALK_HISTORY_LIMIT + 4);
  });
});

describe("addFrame", () => {
  it("counts photos per day", () => {
    const data = defaultState();
    addFrame(data, "2026-06-01");
    addFrame(data, "2026-06-01");
    addFrame(data, "2026-06-02");
    expect(data.frameLog).toEqual({ "2026-06-01": 2, "2026-06-02": 1 });
  });
});
