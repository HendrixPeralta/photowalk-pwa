import { beforeEach, describe, expect, it } from "vitest";
import { getData, update, useAppStore } from "./appStore";
import { defaultState } from "./defaults";
import { PRE_SEED_KEY, seedStarterHistory } from "./seed";

const NOW = new Date(2026, 5, 10, 15);

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState(defaultState(), true);
});

describe("sample history", () => {
  it("is only there when asked for", () => {
    expect(getData().seededHistory).toBeNull();
    expect(getData().walkHistory).toEqual([]);
  });

  it("loads three months of practice and parks the profile from before", () => {
    update((d) => { d.profile.displayName = "Me"; });
    seedStarterHistory({}, NOW);
    expect(getData().seededHistory?.days).toBe(91);
    expect(getData().walkHistory.length).toBeGreaterThan(10);
    expect(getData().profile.displayName).toBe("Me");
    expect(JSON.parse(localStorage.getItem(PRE_SEED_KEY)!).state.profile.displayName).toBe("Me");
  });
});
