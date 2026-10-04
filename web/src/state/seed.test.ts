import { beforeEach, describe, expect, it } from "vitest";
import { getData, update, useAppStore } from "./appStore";
import { defaultState } from "./defaults";
import { DECLINED_KEY, maybeSeedStarterHistory, PRE_SEED_KEY } from "./seed";

const NOW = new Date(2026, 5, 10, 15);

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState(defaultState(), true);
});

describe("starting history", () => {
  it("gives a new profile three months of practice, once", () => {
    expect(maybeSeedStarterHistory(NOW)).toBe(true);
    expect(getData().seededHistory?.days).toBe(91);
    expect(getData().walkHistory.length).toBeGreaterThan(10);
    expect(localStorage.getItem(PRE_SEED_KEY)).not.toBeNull();
    expect(maybeSeedStarterHistory(NOW)).toBe(false);
  });

  it("leaves real practice, demo mode and a declined profile alone", () => {
    update((d) => { d.activityLog["2026-06-01"] = 6; });
    expect(maybeSeedStarterHistory(NOW)).toBe(false);

    useAppStore.setState(defaultState(), true);
    update((d) => { d.demoMode = { seed: 1, seededAt: 0 }; });
    expect(maybeSeedStarterHistory(NOW)).toBe(false);

    useAppStore.setState(defaultState(), true);
    localStorage.setItem(DECLINED_KEY, "1");
    expect(maybeSeedStarterHistory(NOW)).toBe(false);
  });
});
