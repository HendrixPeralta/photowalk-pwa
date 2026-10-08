import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { themes } from "@/lib/content/themes";
import { setNavigator } from "@/lib/nav";
import { localDateKey } from "@/lib/util";
import { getData, update, useAppStore } from "@/state/appStore";
import { defaultState } from "@/state/defaults";
import { closeModal, useModal, useToasts } from "@/state/ui";
import {
  beginShooting, finishWalk, goLive, launchIfRequested, launchWalk, pauseWalk, putThemeOnHand,
  removeSavedTheme, restoreActiveWalk, resumeWalk, setChallengeChecked, setGuidedDuration, setMode, tickWalk,
} from "./actions";
import { ConfirmCompleteModal, ConfirmHoursModal } from "./modals/FinishModals";
import { WalkBriefModal } from "./modals/WalkBrief";
import { WalkSummaryModal } from "./modals/WalkSummary";
import { useWalkUi, walkTheme } from "./walkUi";

const START = new Date(2026, 5, 10, 10, 0);
const MIN = 60_000;

const modal = () => useModal.getState().current;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const modalProps = () => modal()!.element.props as any;
const toasts = () => useToasts.getState().toasts.map((toast) => toast.message);
const walk = () => getData().activeWalk!;
const draft = () => useWalkUi.getState().draft!;

let push: ReturnType<typeof vi.fn<(href: string) => void>>;
let visibility: MockInstance;

beforeEach(() => {
  vi.useFakeTimers({ now: START, toFake: ["Date"] });
  localStorage.clear();
  useAppStore.setState(defaultState(), true);
  useToasts.setState({ toasts: [] });
  useModal.setState({ current: null });
  useWalkUi.setState({ mode: "casual", theme: null, reason: "", draft: null, launchOnArrival: false });
  push = vi.fn<(href: string) => void>();
  setNavigator(push);
  visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
});

afterEach(() => {
  setNavigator(null);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Opens a walk in `mode` and starts shooting, returning the start time. */
function startShooting(mode: "casual" | "guided" = "casual"): number {
  setMode(mode);
  launchWalk();
  beginShooting();
  return walk().startedAt!;
}

describe("opening a walk", () => {
  it("opens a brief with the theme on hand, and nothing is open until Start shooting", () => {
    const theme = themes()[3];
    putThemeOnHand(theme, "Because.");
    launchWalk();
    expect(getData().activeWalk).toBeNull();
    expect(draft()).toMatchObject({ themeId: theme.id, mode: "casual", startedAt: null, challengesChecked: [] });
    expect(modal()!.element.type).toBe(WalkBriefModal);

    beginShooting();
    expect(walk()).toMatchObject({ themeId: theme.id, startedAt: START.getTime() });
    expect(useWalkUi.getState().draft).toBeNull();
    expect(push).toHaveBeenCalledWith("/live");
  });

  it("leaving the brief without starting leaves nothing open or logged", () => {
    launchWalk();
    closeModal();
    expect(getData().activeWalk).toBeNull();
    expect(getData().walkHistory).toEqual([]);

    // Opening it again starts over on a fresh brief.
    launchWalk();
    expect(modal()!.element.type).toBe(WalkBriefModal);
    expect(getData().activeWalk).toBeNull();
  });

  it("picks a theme when none is on hand, and a guided walk gets its checklist and nudges", () => {
    setMode("guided");
    launchWalk();
    const theme = walkTheme()!;
    expect(theme).toBeTruthy();
    expect(draft().durationMin).toBe(30);
    expect(draft().challengesChecked).toEqual(theme.challenges.map(() => false));
    beginShooting();
    expect(walk().nudges.map((n) => n.at - START.getTime())).toEqual([15 * MIN, 25.5 * MIN, 30 * MIN]);
  });

  it("keeps the mode fixed while a walk is open", () => {
    startShooting();
    setMode("guided");
    expect(useWalkUi.getState().mode).toBe("casual");
  });

  it("follows theme and length changes on the brief, but not once shooting", () => {
    setMode("guided");
    putThemeOnHand(themes()[0]);
    launchWalk();
    setChallengeChecked(0, true);
    expect(draft().challengesChecked[0]).toBe(true);
    putThemeOnHand(themes()[1]);
    expect(draft().themeId).toBe(themes()[1].id);
    expect(draft().challengesChecked.every((c) => !c)).toBe(true);
    setGuidedDuration(15);
    expect(draft().durationMin).toBe(15);
    expect(getData().profile.guidedDurationMin).toBe(15);

    beginShooting();
    putThemeOnHand(themes()[2]);
    setGuidedDuration(60);
    expect(walk().themeId).toBe(themes()[1].id);
    expect(walk().durationMin).toBe(15);
  });

  it("the Live tab opens the brief once the Live screen is showing, without starting a walk", () => {
    goLive(false);
    expect(modal()).toBeNull();
    launchIfRequested();
    expect(modal()!.element.type).toBe(WalkBriefModal);
    expect(getData().activeWalk).toBeNull();
    expect(useWalkUi.getState().launchOnArrival).toBe(false);

    // With a walk already open, the tab just goes there.
    beginShooting();
    goLive(false);
    expect(useWalkUi.getState().launchOnArrival).toBe(false);
  });
});

describe("a running walk", () => {
  it("delivers the halfway nudge, then the end one before finishing on its own", () => {
    setMode("guided");
    launchWalk();
    setGuidedDuration(2);
    const start = (beginShooting(), walk().startedAt!);

    tickWalk(start + 61_000);
    expect(toasts()).toEqual([expect.stringContaining("Halfway there! Try:")]);
    expect(walk().nudges.map((n) => n.fired)).toEqual([true, false, false]);

    // Both wrap and end are due by now; only the latest still means anything.
    vi.setSystemTime(start + 2 * MIN);
    tickWalk(start + 2 * MIN);
    expect(toasts()).toHaveLength(2);
    expect(toasts()[1]).toContain("Time's up, nice work!");
    expect(getData().activeWalk).toBeNull();
    expect(modal()!.element.type).toBe(WalkSummaryModal);
    expect(modalProps().auto).toBe(true);
    expect(getData().walkHistory[0].hours).toBeCloseTo(2 / 60);
  });

  it("holds nudges back while hidden with notifications off", () => {
    const start = startShooting("guided");
    visibility.mockReturnValue("hidden");
    tickWalk(start + 16 * MIN);
    expect(walk().nudges[0].fired).toBe(false);
    expect(toasts()).toEqual([]);

    visibility.mockReturnValue("visible");
    tickWalk(start + 16 * MIN);
    expect(walk().nudges[0].fired).toBe(true);
  });

  it("pausing stops the clock, and resuming slides it forward by the pause", () => {
    const start = startShooting("guided");
    vi.setSystemTime(start + 10 * MIN);
    pauseWalk();
    vi.setSystemTime(start + 70 * MIN);
    tickWalk(start + 70 * MIN);
    expect(getData().activeWalk).not.toBeNull();

    resumeWalk();
    expect(walk().startedAt).toBe(start + 60 * MIN);
    expect(walk().nudges[0].at).toBe(start + 75 * MIN);
    expect(walk().pausedAt).toBeNull();
  });
});

describe("finishing", () => {
  it("asks before a manual stop, and backing out keeps walking", () => {
    startShooting();
    finishWalk();
    expect(modal()!.element.type).toBe(ConfirmCompleteModal);
    closeModal();
    expect(toasts()).toEqual(["Still on your walk."]);
    expect(getData().activeWalk).not.toBeNull();
  });

  it("banks hours, streak, history, rewards and milestones", () => {
    update((d) => {
      d.rewards.push({ id: "r1", title: "Strap", targetHours: 0.1, baselineHours: 0, createdAt: 0, claimedAt: null, notified: false });
    });
    startShooting();
    vi.setSystemTime(START.getTime() + 30 * MIN);
    finishWalk();
    modalProps().onConfirm();

    const data = getData();
    expect(data.activeWalk).toBeNull();
    expect(data.activityLog[localDateKey(START)]).toBeCloseTo(0.5);
    expect(data.profile).toMatchObject({ walksCompleted: 1, streak: 1 });
    expect(data.lastWalk).toEqual(data.walkHistory[0]);
    expect(data.rewards[0].notified).toBe(true);

    expect(modal()!.element.type).toBe(WalkSummaryModal);
    expect(modalProps().unlocked.map((r: { title: string }) => r.title)).toEqual(["Strap"]);
    expect(modalProps().milestones.length).toBeGreaterThan(0);
    // Confirming closed the confirmation, so its "still walking" note didn't show.
    expect(toasts()).toEqual([]);
  });

  it("confirms the hours of a long casual walk", () => {
    startShooting();
    vi.setSystemTime(START.getTime() + 3 * 60 * MIN);
    finishWalk();
    modalProps().onConfirm();
    expect(modal()!.element.type).toBe(ConfirmHoursModal);
    expect(modalProps().measured).toBeCloseTo(3);

    modalProps().onConfirm(1.5);
    expect(getData().walkHistory[0].hours).toBe(1.5);
    expect(modal()!.element.type).toBe(WalkSummaryModal);
  });

  it("doesn't bank a walk another tab already finished", () => {
    startShooting();
    finishWalk();
    const confirm = modalProps().onConfirm;
    update((d) => { d.activeWalk = null; });
    confirm();
    expect(getData().walkHistory).toEqual([]);
    expect(modal()).toBeNull();
  });
});

describe("restoring and themes", () => {
  it("picks up a running walk in the mode it was started in", () => {
    update((d) => {
      d.activeWalk = { mode: "guided", themeId: themes()[0].id, startedAt: 1, durationMin: 30, challengesChecked: [], nudges: [], pausedAt: null };
    });
    restoreActiveWalk();
    expect(useWalkUi.getState().mode).toBe("guided");
    expect(getData().activeWalk).not.toBeNull();
  });

  it("drops a walk an older version saved before it started", () => {
    update((d) => {
      d.activeWalk = { mode: "guided", themeId: themes()[0].id, startedAt: null, durationMin: 30, challengesChecked: [], nudges: [], pausedAt: null };
    });
    restoreActiveWalk();
    expect(getData().activeWalk).toBeNull();
    expect(modal()).toBeNull();
  });

  it("drops a walk whose custom theme is gone", () => {
    update((d) => {
      d.activeWalk = { mode: "casual", themeId: "deleted", startedAt: 1, durationMin: null, challengesChecked: [], nudges: [], pausedAt: null };
    });
    restoreActiveWalk();
    expect(getData().activeWalk).toBeNull();
  });

  it("won't remove the theme the open walk is using", () => {
    update((d) => { d.customThemes.push({ id: "mine", title: "Mine", brief: "", concepts: [], challenges: [] }); });
    putThemeOnHand(getData().customThemes[0]);
    startShooting();
    removeSavedTheme("mine");
    expect(getData().customThemes).toHaveLength(1);
    expect(toasts()).toEqual(["Finish your current walk before removing its theme."]);

    finishWalk();
    modalProps().onConfirm();
    removeSavedTheme("mine");
    expect(getData().customThemes).toEqual([]);
  });
});
