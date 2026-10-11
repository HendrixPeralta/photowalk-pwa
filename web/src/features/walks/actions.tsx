// The walk lifecycle: open a walk on its brief, start the clock, nudge, pause,
// finish, and bank the hours. Plain functions over the stores, so the Walks
// screen, the Live tab, the walk engine and the pop-ups all share one path.

import { suggestTheme, themeById, type Theme } from "@/lib/content/themes";
import { t } from "@/lib/i18n/core";
import { claimNewMilestones, type Milestone } from "@/lib/milestones";
import { navigate } from "@/lib/nav";
import { notificationsGranted, showNow } from "@/lib/notify";
import { claimRewardUnlocks } from "@/lib/rewards";
import { addActivityHours, recordWalk, themeWalkCounts, totalActivityHours } from "@/lib/stats";
import { uid } from "@/lib/util";
import {
  CASUAL_CONFIRM_HOURS, CASUAL_MAX_HOURS, computeElapsedHours, currentStreak, dueNudges,
  nudgeMessage, nudgePlan, resumeTimes, updateStreak, validGuidedDuration, walkClock,
} from "@/lib/walk";
import { getData, update } from "@/state/appStore";
import type { Reward, WalkMode, WalkRecord } from "@/state/types";
import { closeModal, openModal, showToast } from "@/state/ui";
import { ConfirmCompleteModal, ConfirmHoursModal } from "./modals/FinishModals";
import { ThemeEditorModal } from "./modals/ThemeEditor";
import { ThemePickerModal } from "./modals/ThemePicker";
import { WalkBriefModal } from "./modals/WalkBrief";
import { WalkSummaryModal } from "./modals/WalkSummary";
import { challengesFor, useWalkUi, walkTheme } from "./walkUi";

/* ---------- Mode and theme ---------- */

/** Picks the mode for the next walk. Finish the walk you're on before switching. */
export function setMode(mode: WalkMode): void {
  if (getData().activeWalk) return;
  useWalkUi.setState({ mode });
}

/**
 * Puts a theme (random pick, custom build, or a saved one) on hand for the
 * walk brief. If a walk is open on its brief (not yet shooting), the walk
 * follows, so rerolling or editing mid-brief sticks.
 */
export function putThemeOnHand(theme: Theme, reason = ""): void {
  if (getData().activeWalk?.startedAt) useWalkUi.setState({ theme, reason });
  else changeWalkTheme(theme, reason);
}

/**
 * Swaps the open walk's theme, even mid-walk, from the Live screen. The
 * checklist starts over for the new theme; the clock and photos carry on.
 */
export function changeWalkTheme(theme: Theme, reason = ""): void {
  useWalkUi.setState({ theme, reason });
  update((d) => {
    const w = d.activeWalk;
    if (!w) return;
    w.themeId = theme.id;
    w.challengesChecked = new Array(challengesFor(theme, w.mode).length).fill(false);
  });
}

/** A fresh suggestion, never the theme already on hand. */
export function pickTheme(): void {
  const data = getData();
  const picked = suggestTheme(walkTheme(data)?.id, themeWalkCounts(data.walkHistory));
  putThemeOnHand(picked.theme, picked.reason);
}

/** A theme from My Themes, for the next walk. */
export function chooseSavedTheme(id: string): void {
  const data = getData();
  if (data.activeWalk) { showToast(t("Finish your current walk before switching themes.")); return; }
  const theme = data.customThemes.find((th) => th.id === id);
  if (!theme) return;
  putThemeOnHand(theme, t("Your own custom theme."));
  navigate("walks");
}

export function removeSavedTheme(id: string): void {
  // The open walk reads its theme from this list, so it can't vanish mid-walk.
  if (getData().activeWalk?.themeId === id) {
    showToast(t("Finish your current walk before removing its theme."));
    return;
  }
  update((d) => { d.customThemes = d.customThemes.filter((th) => th.id !== id); });
}

/* ---------- Opening a walk ---------- */

/**
 * The Start Photo Walk button. Picking the theme (or rerolling, or building
 * one) happens in the brief this opens, so a fresh theme is picked here if
 * none is on hand yet.
 */
export function launchWalk(): void {
  if (getData().activeWalk) return;
  if (!useWalkUi.getState().theme) pickTheme();
  const { theme, mode } = useWalkUi.getState();
  if (!theme) return;

  update((d) => {
    d.activeWalk = {
      mode,
      themeId: theme.id,
      startedAt: null,
      durationMin: mode === "guided" ? validGuidedDuration(d.profile.guidedDurationMin) : null,
      challengesChecked: new Array(challengesFor(theme, mode).length).fill(false),
      nudges: [],
      pausedAt: null,
      frames: [],
    };
  });
  openWalkBrief();
}

/**
 * The Live tab. With no walk running it starts one, but only once the Live
 * screen is showing: a pop-up opened before the screen changes would close
 * with the move. Opening /live/ any other way never starts a walk.
 */
export function goLive(alreadyThere: boolean): void {
  if (getData().activeWalk) return;
  if (alreadyThere) launchWalk();
  else useWalkUi.setState({ launchOnArrival: true });
}

/** Called by the Live screen when it appears. */
export function launchIfRequested(): void {
  if (!useWalkUi.getState().launchOnArrival) return;
  useWalkUi.setState({ launchOnArrival: false });
  launchWalk();
}

/**
 * Picks up a walk left open by an earlier visit. One still on its brief
 * reopens the brief; one whose custom theme is gone is dropped, since
 * nothing was logged against a walk that can't say what it was for.
 */
export function restoreActiveWalk(): void {
  const data = getData();
  const w = data.activeWalk;
  if (!w) return;
  if (!themeById(w.themeId, data.customThemes)) {
    update((d) => { d.activeWalk = null; });
    return;
  }
  useWalkUi.setState({ mode: w.mode });
  if (!w.startedAt) openWalkBrief();
}

/* ---------- Brief and theme pop-ups ---------- */

export function openWalkBrief(): void {
  if (!walkTheme()) return;
  openModal(<WalkBriefModal />);
}

export function openThemePicker(): void {
  openModal(<ThemePickerModal />);
}

/** Change Theme from the Live screen, which swaps the running walk's theme. */
export function openWalkThemePicker(): void {
  openModal(<ThemePickerModal midWalk />);
}

/**
 * The custom theme builder, which doubles as the editor for an existing one.
 * Once shooting has started the theme is locked in.
 */
export function openThemeEditor(existing: Theme | null = null, onSaved?: () => void): void {
  const w = getData().activeWalk;
  if (w?.startedAt) {
    showToast(t("Finish your current walk before editing a theme."));
    return;
  }
  openModal(<ThemeEditorModal existing={existing} onSaved={onSaved} />);
}

/* ---------- While the walk runs ---------- */

/** Starts the clock once "Start shooting" is tapped in the brief, and heads to Live Walk. */
export function beginShooting(): void {
  const w = getData().activeWalk;
  if (!w || w.startedAt) return;
  const now = Date.now();
  update((d) => {
    const walk = d.activeWalk!;
    walk.startedAt = now;
    if (walk.mode === "guided" && walk.durationMin) walk.nudges = nudgePlan(now, walk.durationMin);
  });
  navigate("hud");
}

export function setChallengeChecked(index: number, checked: boolean): void {
  update((d) => {
    if (d.activeWalk) d.activeWalk.challengesChecked[index] = checked;
  });
}

/** The guided length is only decided before the clock starts; the pick is remembered. */
export function setGuidedDuration(minutes: number): void {
  const value = validGuidedDuration(minutes);
  update((d) => {
    d.profile.guidedDurationMin = value;
    if (d.activeWalk && !d.activeWalk.startedAt && d.activeWalk.mode === "guided") d.activeWalk.durationMin = value;
  });
}

export function pauseWalk(): void {
  const w = getData().activeWalk;
  if (!w?.startedAt || w.pausedAt) return;
  const now = Date.now();
  update((d) => { d.activeWalk!.pausedAt = now; });
  showToast(t("Walk paused. The timer is stopped."));
}

export function resumeWalk(): void {
  const w = getData().activeWalk;
  if (!w?.pausedAt) return;
  const now = Date.now();
  update((d) => resumeTimes(d.activeWalk!, now));
  showToast(t("Walk resumed."));
}

/**
 * One beat of a running walk: deliver any nudge that is due, then finish a
 * guided walk whose time is up. Nudges go first so the end-of-walk nudge
 * still reaches a phone in a pocket.
 */
export function tickWalk(now = Date.now()): void {
  const w = getData().activeWalk;
  if (!w?.startedAt || w.pausedAt) return;
  fireDueNudges(now);
  if (walkClock(w, now).phase === "expired") finishWalk(true);
}

function fireDueNudges(now: number): void {
  const w = getData().activeWalk;
  if (!w) return;
  const due = dueNudges(w, now);
  if (!due.length) return;

  // With no way to reach the user right now, hold the nudges back so they
  // land when the app is next looked at instead of being silently spent.
  const visible = document.visibilityState === "visible";
  const granted = notificationsGranted();
  if (!visible && !granted) return;

  const ids = due.map((n) => n.id);
  update((d) => {
    for (const n of d.activeWalk?.nudges ?? []) if (ids.includes(n.id)) n.fired = true;
  });

  // Coming back after a long gap makes several due at once. Only the latest
  // still means anything ("halfway there" is stale once time is up).
  const latest = due[due.length - 1];
  const message = nudgeMessage(latest.id, challengesFor(walkTheme(), w.mode), w.challengesChecked);
  if (visible) showToast(message);
  void showNow(message, `walk-${latest.id}`);
}

/* ---------- Finishing ---------- */

/**
 * Stop Walk, Complete, or a guided walk running out of time (`auto`). A walk
 * still on its brief just closes, since nothing was logged. A manual stop
 * can't be undone, so it asks first.
 */
export function finishWalk(auto = false): void {
  const w = getData().activeWalk;
  if (!w) return;

  if (!w.startedAt) {
    update((d) => { d.activeWalk = null; });
    useWalkUi.setState({ theme: null, reason: "" });
    return;
  }

  const startedAt = w.startedAt;
  if (auto) {
    finalizeWalk(startedAt, true);
    return;
  }

  let settled = false;
  openModal(
    <ConfirmCompleteModal
      onConfirm={() => {
        settled = true;
        closeModal();
        finalizeWalk(startedAt, false);
      }}
    />,
    { alert: true, onClose: () => { if (!settled) showToast(t("Still on your walk.")); } },
  );
}

/** The walk with this start time, if it is still the open one (another tab may have finished it). */
function openWalkStartedAt(startedAt: number) {
  const w = getData().activeWalk;
  return w && w.startedAt === startedAt ? w : null;
}

function finalizeWalk(startedAt: number, auto: boolean): void {
  const w = openWalkStartedAt(startedAt);
  if (!w) return;
  const measured = computeElapsedHours(w, Date.now());

  // Past a couple of hours a casual walk was probably left open, and hours buy
  // rewards, so confirm the number rather than banking it. Dismissing leaves
  // the walk running instead of guessing.
  if (w.mode === "casual" && measured > CASUAL_CONFIRM_HOURS) {
    let settled = false;
    openModal(
      <ConfirmHoursModal
        measured={measured}
        onConfirm={(hours) => {
          settled = true;
          closeModal();
          completeWalk(startedAt, Math.min(hours, CASUAL_MAX_HOURS), auto);
        }}
      />,
      { onClose: () => { if (!settled) showToast(t("Still on your walk. Finish whenever you're ready.")); } },
    );
    return;
  }
  completeWalk(startedAt, measured, auto);
}

function completeWalk(startedAt: number, hours: number, auto: boolean): void {
  const w = openWalkStartedAt(startedAt);
  if (!w) return;

  const theme = walkTheme();
  const frames = w.frames ?? [];
  const now = Date.now();
  const record: WalkRecord = {
    id: uid(),
    themeId: w.themeId,
    mode: w.mode,
    durationMin: w.durationMin,
    hours,
    challengesDone: w.challengesChecked.filter(Boolean).length,
    challengeCount: w.challengesChecked.length,
    endedAt: now,
    tipDismissed: false,
  };

  let unlocked: Reward[] = [];
  let milestones: Milestone[] = [];
  update((d) => {
    // lastWalk drives the Analysis tab's pinned tips; walkHistory is the long
    // record theme suggestions and milestones read from.
    d.lastWalk = record;
    recordWalk(d, record);
    d.activeWalk = null;
    updateStreak(d.profile, new Date(now));
    addActivityHours(d, hours);

    // Hours must be banked before either of these looks at them.
    const total = totalActivityHours(d.activityLog);
    unlocked = claimRewardUnlocks(d.rewards, total).map((r) => ({ ...r }));
    milestones = claimNewMilestones(d.profile, {
      totalHours: total,
      walksCompleted: d.profile.walksCompleted,
      streak: currentStreak(d.profile, new Date(now)),
    }, record);
  });
  useWalkUi.setState({ theme: null, reason: "" });

  openModal(
    <WalkSummaryModal
      theme={theme}
      record={record}
      frames={frames}
      auto={auto}
      unlocked={unlocked}
      milestones={milestones}
    />,
  );
}
