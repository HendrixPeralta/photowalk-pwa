// Everything PhotoEYE saves, in one store with the same shape the old app's
// `state` object had. Saved to localStorage on every change, so another tab or
// a reload always sees the latest data.
//
// Changes go through update(), which hands out a draft to mutate (immer), so
// logic ported from the old mutate-then-save() code keeps its shape.

import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { storageEstimate } from "@/lib/db";
import { t } from "@/lib/i18n/core";
import { defaultState, withDefaults } from "./defaults";
import type { AppData } from "./types";
import { showToast } from "./ui";

export const STATE_KEY = "photoeye:state";

let lastQuotaWarning = 0;

/**
 * localStorage, except that a rejected write (storage full) tells the user,
 * at most once a minute, instead of failing silently.
 */
const quotaAwareStorage: StateStorage = {
  getItem: (name) => localStorage.getItem(name),
  removeItem: (name) => localStorage.removeItem(name),
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, value);
    } catch (err) {
      console.warn("PhotoEYE: could not save.", err);
      if (Date.now() - lastQuotaWarning > 60_000) {
        lastQuotaWarning = Date.now();
        showToast(t("Storage is full. Delete a few references so PhotoEYE can keep saving."), 6000);
      }
    }
  },
};

/**
 * After saving a photo: warns once the device's storage for PhotoEYE is over
 * 80% used, sharing the once-a-minute limit with the "storage is full" note.
 */
export async function warnIfStorageTight(): Promise<void> {
  const info = await storageEstimate();
  if (!info || info.ratio < 0.8) return;
  if (Date.now() - lastQuotaWarning < 60_000) return;
  lastQuotaWarning = Date.now();
  showToast(t("Storage is {pct}% full. Try deleting some older references.", { pct: Math.round(info.ratio * 100) }), 6000);
}

export const useAppStore = create<AppData>()(
  persist(immer(() => defaultState()), {
    name: STATE_KEY,
    version: 1,
    storage: createJSONStorage(() => quotaAwareStorage),
    // Loaded explicitly during boot, after the language is set, so nothing
    // reads storage on the server.
    skipHydration: true,
    // Whatever was saved, with any fields added since then filled in.
    merge: (persisted) => withDefaults(persisted as Partial<AppData>),
  }),
);

/** Changes saved data. The draft can be mutated directly. */
export function update(recipe: (draft: AppData) => void): void {
  useAppStore.setState(recipe);
}

/** The saved data right now, for code outside React. */
export const getData = (): AppData => useAppStore.getState();

/** Loads saved data from storage (call once at boot). */
export async function loadSavedData(): Promise<void> {
  await useAppStore.persist.rehydrate();
}

/**
 * Keeps tabs in step: when another tab saves, reload from storage. Every
 * change is saved the moment it happens, so this tab has nothing unsaved to
 * lose, and the old app's "last tab to save wins" overwrite can't happen.
 * Returns a function that stops listening.
 */
export function syncAcrossTabs(): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === STATE_KEY) void useAppStore.persist.rehydrate();
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}
