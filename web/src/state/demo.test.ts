import { beforeEach, describe, expect, it, vi } from "vitest";
import { localDateKey } from "@/lib/util";
import { getData, STATE_KEY, update, useAppStore } from "./appStore";
import { defaultState } from "./defaults";
import { clearDemoData, ensureDemoData, PRE_DEMO_KEY, seedDemoData } from "./demo";
import { DECLINED_KEY, PRE_SEED_KEY, seedStarterHistory, undoStarterHistory } from "./seed";

const reloadPage = vi.fn();
vi.mock("@/lib/page", () => ({ reloadPage: () => reloadPage() }));

const NOW = new Date(2026, 9, 4, 12);

beforeEach(() => {
  localStorage.clear();
  reloadPage.mockReset();
  useAppStore.setState(defaultState(), true);
});

describe("demo data", () => {
  it("loads a year ending today and parks the real profile first", () => {
    update((d) => { d.profile.displayName = "Me"; });
    const mine = localStorage.getItem(STATE_KEY);
    seedDemoData({}, NOW);
    expect(localStorage.getItem(PRE_DEMO_KEY)).toBe(mine);
    expect(getData().demoMode?.seed).toBe(20260908);
    expect(getData().activityLog[localDateKey(NOW)]).toBeGreaterThan(0);
    expect(Object.keys(getData().activityLog).length).toBeGreaterThan(100);
    expect(getData().profile.displayName).toBe("Me");
  });

  it("only re-seeds when the history no longer reaches today or a new seed is asked for", () => {
    seedDemoData({}, NOW);
    const first = getData().demoMode!.seededAt;
    expect(ensureDemoData(undefined, NOW)).toBe(false);
    const tomorrow = new Date(NOW.getTime() + 86_400_000);
    expect(ensureDemoData(undefined, tomorrow)).toBe(true);
    expect(getData().demoMode!.seededAt).not.toBe(first);
    expect(ensureDemoData(7, tomorrow)).toBe(true);
    expect(getData().demoMode!.seed).toBe(7);
  });

  it("Restore mine hands back the parked profile with a reload", () => {
    update((d) => { d.profile.displayName = "Me"; });
    const mine = localStorage.getItem(STATE_KEY);
    seedDemoData({}, NOW);
    expect(clearDemoData()).toBe(true);
    expect(localStorage.getItem(STATE_KEY)).toBe(mine);
    expect(localStorage.getItem(PRE_DEMO_KEY)).toBeNull();
    expect(reloadPage).toHaveBeenCalledOnce();
  });

  it("with nothing parked, leaving demo mode just wipes the stats", () => {
    update((d) => { d.demoMode = { seed: 1, seededAt: 0 }; d.activityLog["2026-01-01"] = 2; });
    expect(clearDemoData()).toBe(false);
    expect(getData()).toMatchObject({ demoMode: null, activityLog: {}, walkHistory: [] });
    expect(reloadPage).not.toHaveBeenCalled();
  });
});

describe("starting history", () => {
  it("undo hands back the profile from before the seed, and stops it seeding again", () => {
    const before = localStorage.getItem(STATE_KEY) ?? "";
    seedStarterHistory({}, NOW);
    expect(undoStarterHistory()).toBe(true);
    expect(localStorage.getItem(STATE_KEY) ?? "").toBe(before);
    expect(localStorage.getItem(PRE_SEED_KEY)).toBeNull();
    expect(localStorage.getItem(DECLINED_KEY)).toBe("1");
    expect(reloadPage).toHaveBeenCalledOnce();
    expect(undoStarterHistory()).toBe(false);
  });
});
