import { describe, expect, it } from "vitest";
import { defaultState } from "@/state/defaults";
import type { WalkRecord } from "@/state/types";
import { backfillMilestones, claimNewMilestones, earnedMilestones } from "./milestones";

const sweep: WalkRecord = { id: "w", themeId: "x", mode: "guided", durationMin: 30, hours: 0.5, challengesDone: 3, challengeCount: 3, endedAt: 0 };

describe("milestones", () => {
  it("earns the marks the stats have passed", () => {
    const ids = earnedMilestones({ totalHours: 12, walksCompleted: 5, streak: 3 }, sweep).map((m) => m.id);
    expect(ids).toEqual(["hours-1", "hours-5", "hours-10", "walks-1", "walks-5", "streak-3", "clean-sweep"]);
  });

  it("celebrates each milestone once", () => {
    const { profile } = defaultState();
    expect(claimNewMilestones(profile, { totalHours: 1, walksCompleted: 1, streak: 1 }, null)).toHaveLength(2);
    expect(claimNewMilestones(profile, { totalHours: 1, walksCompleted: 1, streak: 1 }, null)).toEqual([]);
    expect(claimNewMilestones(profile, { totalHours: 5, walksCompleted: 1, streak: 1 }, null).map((m) => m.id)).toEqual(["hours-5"]);
  });

  it("backfill marks existing achievements as seen without celebrating", () => {
    const { profile } = defaultState();
    expect(backfillMilestones(profile, { totalHours: 30, walksCompleted: 12, streak: 0 })).toBe(true);
    expect(claimNewMilestones(profile, { totalHours: 30, walksCompleted: 12, streak: 0 }, null)).toEqual([]);
    expect(backfillMilestones(profile, { totalHours: 300, walksCompleted: 120, streak: 0 })).toBe(false);
  });
});
