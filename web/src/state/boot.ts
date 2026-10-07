// What has to happen before any screen renders, in order. Runs once per page
// load: React's StrictMode runs effects twice in development, and two boots
// would seed twice. Without a signed-in person boot stops early and the
// shell shows the sign-in screen instead of the app.

import { requestPersistence } from "@/lib/db";
import { initI18n } from "@/lib/i18n/core";
import { backfillMilestones } from "@/lib/milestones";
import { totalActivityHours } from "@/lib/stats";
import { currentStreak } from "@/lib/walk";
import { resolveAccount, type AccountGate } from "./account";
import { getData, loadSavedData, syncAcrossTabs, update } from "./appStore";
import { loadFix } from "./geo";
import { clearDemoData, ensureDemoData } from "./demo";
import { takeDevParams } from "./devParams";
import { seedStarterHistory, undoStarterHistory } from "./seed";

let booting: Promise<AccountGate> | null = null;

export function bootOnce(): Promise<AccountGate> {
  booting ??= boot();
  return booting;
}

async function boot(): Promise<AccountGate> {
  // Language first: everything after it may produce text.
  await initI18n();
  await loadSavedData();
  // Before anything reads or seeds the data: a different person signing in
  // wipes it first.
  const account = await resolveAccount();
  if (account !== "app") return account;
  loadFix();
  syncAcrossTabs();
  void requestPersistence();

  // Anyone with stats from before milestones existed shouldn't be buried in
  // retroactive badges on their next walk.
  update((draft) => {
    backfillMilestones(draft.profile, {
      totalHours: totalActivityHours(draft.activityLog),
      walksCompleted: draft.profile.walksCompleted,
      streak: currentStreak(draft.profile),
    });
  });

  // Before the first screen renders, so Walks paints any demo stats.
  if (seedHistory() === "reloading") await new Promise<never>(() => {});
  return "app";
}

/**
 * Demo data and sample history, only when asked for (?demo, ?history) or
 * already on. A new account starts empty. Leaving demo mode or undoing the
 * history brings back a parked profile with a reload, so nothing renders.
 */
function seedHistory(): "reloading" | void {
  const { demo, history } = takeDevParams();
  if (demo === "clear") {
    if (clearDemoData()) return "reloading";
  } else if (demo !== null || getData().demoMode) {
    const seed = Number(demo);
    ensureDemoData(seed > 1 ? seed : undefined);
  }

  if (history === "undo") {
    if (undoStarterHistory()) return "reloading";
  } else if (history === "seed") {
    seedStarterHistory();
  }
}
