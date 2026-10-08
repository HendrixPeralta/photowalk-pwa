import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getData, loadSavedData, STATE_KEY, syncAcrossTabs, takeLegacyRoomImages, update, useAppStore } from "./appStore";
import { defaultState } from "./defaults";
import { useToasts } from "./ui";

const saved = () => JSON.parse(localStorage.getItem(STATE_KEY)!).state;

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState(defaultState(), true);
  useToasts.setState({ toasts: [] });
});
afterEach(() => vi.restoreAllMocks());

describe("saved data", () => {
  it("saves every change straight to localStorage", () => {
    update((d) => { d.profile.guidedDurationMin = 75; d.activityLog["2026-06-01"] = 1.5; });
    expect(saved().profile.guidedDurationMin).toBe(75);
    expect(saved().activityLog).toEqual({ "2026-06-01": 1.5 });
  });

  it("loads saved data and fills in fields added since it was saved", async () => {
    const old = defaultState() as Partial<ReturnType<typeof defaultState>>;
    delete old.reminder;
    const profile = { ...defaultState().profile } as Partial<ReturnType<typeof defaultState>["profile"]>;
    delete profile.guidedDurationMin;
    localStorage.setItem(STATE_KEY, JSON.stringify({ state: { ...old, profile: { ...profile, walksCompleted: 7 } }, version: 1 }));
    await loadSavedData();
    expect(getData().profile.walksCompleted).toBe(7);
    expect(getData().profile.guidedDurationMin).toBe(30);
    expect(getData().reminder).toEqual(defaultState().reminder);
  });

  it("drops the same-browser rooms of before, and lists their photos for deleting", async () => {
    const old = {
      ...defaultState(),
      profile: { ...defaultState().profile, displayName: "Ana", walksCompleted: 3 },
      rooms: { ABC234: { code: "ABC234", theme: "", createdAt: 0, photos: [{ id: "p", imageId: "img-1" }] } },
      currentRoom: "ABC234",
    };
    localStorage.setItem(STATE_KEY, JSON.stringify({ state: old, version: 1 }));
    await loadSavedData();
    expect(getData()).not.toHaveProperty("rooms");
    expect(getData().profile).not.toHaveProperty("displayName");
    expect(getData().profile.walksCompleted).toBe(3);
    expect(getData().currentRoom).toBeNull();
    expect(takeLegacyRoomImages()).toEqual(["img-1"]);
    expect(saved()).not.toHaveProperty("rooms");
  });

  it("follows changes another tab saves", async () => {
    const stop = syncAcrossTabs();
    const other = { ...defaultState(), currentRoom: "ABC234" };
    localStorage.setItem(STATE_KEY, JSON.stringify({ state: other, version: 2 }));
    window.dispatchEvent(new StorageEvent("storage", { key: STATE_KEY }));
    await vi.waitFor(() => expect(getData().currentRoom).toBe("ABC234"));
    stop();
  });

  it("warns once a minute when storage is full", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("full", "QuotaExceededError"); });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    update((d) => { d.profile.photosAnalyzed = 1; });
    update((d) => { d.profile.photosAnalyzed = 2; });
    expect(useToasts.getState().toasts.map((t) => t.message)).toEqual([
      "Storage is full. Delete a few references so PhotoEYE can keep saving.",
    ]);
    expect(getData().profile.photosAnalyzed).toBe(2); // the app keeps working in memory
  });
});
