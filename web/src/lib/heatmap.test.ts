import { describe, expect, it } from "vitest";
import { legacyFunction } from "@/test/legacy";
import { buildWeeks, goalStatusText, heatmapTotals, levelFor } from "./heatmap";
import { localDateKey } from "./util";

describe("heatmap", () => {
  it("lays out 53 Sunday-first weeks ending on a Saturday", () => {
    const now = new Date(2026, 5, 10, 15); // a Wednesday
    const { weeks, today } = buildWeeks(now);
    expect(weeks).toHaveLength(53);
    expect(weeks.every((w) => w.length === 7 && w[0].getDay() === 0)).toBe(true);
    expect(weeks.at(-1)!.at(-1)!.getDay()).toBe(6);
    expect(localDateKey(today)).toBe("2026-06-10");
  });

  it("shades like the old app", () => {
    const old = legacyFunction("heatmap.js", "levelFor");
    for (const h of [0, 0.1, 1, 1.01, 2, 3.5, 4, 4.01, 9]) expect(levelFor(h)).toBe(old(h));
  });

  it("totals only the days up to today", () => {
    const now = new Date(2026, 5, 10, 15);
    const { weeks, today } = buildWeeks(now);
    const totals = heatmapTotals({ "2026-06-10": 1.5, "2026-06-01": 2, "2026-06-12": 9, "2020-01-01": 4 }, weeks, today);
    expect(totals).toEqual({ totalHours: 3.5, activeDays: 2 });
  });

  it("reports goal progress per period", () => {
    expect(goalStatusText("week", 1.5, 3)).toBe("1.5h of 3h this week");
    expect(goalStatusText("year", 120, 100)).toBe("Goal met: 120h this year");
  });
});
