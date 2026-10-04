import { describe, expect, it } from "vitest";
import { legacy } from "@/test/legacy";
import type { Reward } from "@/state/types";
import { activeRewardProgress, claimRewardUnlocks, newReward, rewardTimeline } from "./rewards";

const reward = (id: string, targetHours: number, baselineHours: number, claimedAt: number | null = null): Reward =>
  ({ id, title: `Reward ${id}`, targetHours, baselineHours, createdAt: 0, claimedAt, notified: false });

const LADDER = [reward("a", 5, 0, 1700000000000), reward("b", 12, 10), reward("c", 20, 30), reward("d", 30, 32)];

describe("rewards", () => {
  it.each([0, 4, 22, 40, 70])("the timeline at %ih matches the old app", async (total) => {
    const store = await legacy("store.js");
    const old = await legacy("rewards.js");
    store.state.rewards = structuredClone(LADDER);
    store.state.activityLog = { "2026-01-01": total };
    expect(rewardTimeline(LADDER, total)).toEqual(old.rewardTimeline());
    expect(activeRewardProgress(LADDER, total)).toEqual(old.activeRewardProgress());
  });

  it("validates new rewards and counts only hours shot after creation", () => {
    expect(newReward("  ", 5, 10)).toEqual({ error: "Name the reward you are walking toward." });
    expect(newReward("Lens", 0, 10)).toEqual({ error: "Set how many hours of shooting the reward costs." });
    const r = newReward("  New lens ", 2.345, 10) as Reward;
    expect(r).toMatchObject({ title: "New lens", targetHours: 2.3, baselineHours: 10, claimedAt: null });
    const progress = activeRewardProgress([r], 11)[0];
    expect(progress).toMatchObject({ earned: 1, done: false });
    expect(progress.remaining).toBeCloseTo(1.3, 10);
  });

  it("announces each unlock exactly once", () => {
    const rewards = [reward("x", 2, 0), reward("y", 50, 0)];
    expect(claimRewardUnlocks(rewards, 3).map((r) => r.id)).toEqual(["x"]);
    expect(claimRewardUnlocks(rewards, 3)).toEqual([]);
  });
});
