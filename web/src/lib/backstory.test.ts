import { afterEach, describe, expect, it, vi } from "vitest";
import { legacy } from "@/test/legacy";
import { defaultState } from "@/state/defaults";
import { applyBackstory, buildBackstory, DEMO_YEAR, STARTER } from "./backstory";
import { rewardTimeline } from "./rewards";
import { currentStreak } from "./walk";
import { hoursInPeriod, totalActivityHours } from "./stats";

const NOW = new Date(2026, 5, 10, 15, 30); // a Wednesday afternoon
const counter = () => { let n = 0; return () => `id-${++n}`; };
const stripIds = <T,>(value: T): T => JSON.parse(JSON.stringify(value, (k, v) => (k === "id" ? undefined : v)));

afterEach(() => vi.useRealTimers());

describe("backstory", () => {
  it("is deterministic: same seed and clock, same history", () => {
    expect(buildBackstory(STARTER, { now: NOW, uid: counter() })).toEqual(buildBackstory(STARTER, { now: NOW, uid: counter() }));
    expect(buildBackstory({ ...STARTER, seed: 1 }, { now: NOW, uid: counter() }).activityLog)
      .not.toEqual(buildBackstory(STARTER, { now: NOW, uid: counter() }).activityLog);
  });

  it.each([["starter", STARTER], ["demo year", DEMO_YEAR]])("generates the same %s as the old app", async (_name, cfg) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    const store = await legacy("store.js");
    const old = await legacy("backstory.js");
    Object.assign(store.state, structuredClone(defaultState()));
    const oldSummary = old.applyBackstory(cfg);

    const data = defaultState();
    const story = buildBackstory(cfg, { now: NOW, uid: counter() });
    applyBackstory(data, story);

    expect(story.summary).toEqual(oldSummary);
    expect(data.activityLog).toEqual(store.state.activityLog);
    expect(data.frameLog).toEqual(store.state.frameLog);
    expect(stripIds(data.walkHistory)).toEqual(stripIds(store.state.walkHistory));
    expect(stripIds(data.rewards)).toEqual(stripIds(store.state.rewards));
    expect(stripIds(data.profile)).toEqual(stripIds(store.state.profile));
  });

  it("tells one consistent story", () => {
    const data = defaultState();
    applyBackstory(data, buildBackstory(STARTER, { now: NOW, uid: counter() }));
    expect(currentStreak(data.profile, NOW)).toBe(data.profile.streak);
    expect(data.profile.streak).toBeGreaterThanOrEqual(STARTER.streakDays);
    expect(hoursInPeriod(data.activityLog, "week", NOW)).toBeCloseTo(STARTER.weeklyGoal * STARTER.weekFill, 0);
    const stops = rewardTimeline(data.rewards, totalActivityHours(data.activityLog)).stops.map((s) => s.label);
    expect(stops).toEqual(["Last", "Next", "Then"]);
    expect(data.walkHistory.every((w) => w.endedAt < NOW.getTime())).toBe(true);
  });
});
