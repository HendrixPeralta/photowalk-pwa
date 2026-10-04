import { beforeEach, describe, expect, it } from "vitest";
import { getData, update, useAppStore } from "@/state/appStore";
import { defaultState } from "@/state/defaults";
import { useToasts } from "@/state/ui";
import { addReward, claimReward, removeReward } from "./actions";

const toasts = () => useToasts.getState().toasts.map((toast) => toast.message);

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState(defaultState(), true);
  useToasts.setState({ toasts: [] });
});

describe("rewards", () => {
  it("says what is missing instead of adding a reward that makes no sense", () => {
    expect(addReward("  ", 5)).toBe(false);
    expect(addReward("Lens", 0)).toBe(false);
    expect(getData().rewards).toEqual([]);
    expect(toasts()).toEqual([
      "Name the reward you are walking toward.",
      "Set how many hours of shooting the reward costs.",
    ]);
  });

  it("counts only hours shot after the reward was set", () => {
    update((d) => { d.activityLog["2026-01-01"] = 10; });
    expect(addReward("Lens", 2)).toBe(true);
    expect(getData().rewards[0]).toMatchObject({ title: "Lens", targetHours: 2, baselineHours: 10 });

    const id = getData().rewards[0].id;
    claimReward(id);
    expect(getData().rewards[0].claimedAt).toBeNull();

    update((d) => { d.activityLog["2026-01-02"] = 2; });
    claimReward(id);
    expect(getData().rewards[0].claimedAt).not.toBeNull();
    expect(toasts().at(-1)).toBe('Enjoy it! You earned "Lens" with 2h of shooting.');

    removeReward(id);
    expect(getData().rewards).toEqual([]);
  });
});
