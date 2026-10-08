import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RoomSnapshot } from "@/lib/rooms/protocol";
import { roomsApi } from "@/lib/roomsApi";
import { getData, update, useAppStore } from "@/state/appStore";
import { defaultState } from "@/state/defaults";
import { useToasts } from "@/state/ui";
import { applySnapshot, handleRoomFailure, nudgeRoomSync, pollDelay, refreshRoom, startRoomSync, useRoom } from "./roomStore";

vi.mock("./roomImages", () => ({ pruneRoomImages: vi.fn(async () => {}) }));

const room = (version: number, code = "ABC234"): RoomSnapshot => ({
  code, name: "", theme: "", hostId: "ana", version, createdAt: 0, lastActivityAt: 0, expiresAt: 0,
  members: ["ana"], people: {}, photos: [], notes: [],
});

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState(defaultState(), true);
  useRoom.setState({ room: null, syncedAt: null, offline: false, paused: false });
  useToasts.setState({ toasts: [] });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("the room cache", () => {
  it("takes the server's room and remembers which one this device is in", () => {
    applySnapshot(room(3));
    expect(getData().currentRoom).toBe("ABC234");
    expect(useRoom.getState().room?.version).toBe(3);
    expect(JSON.parse(localStorage.getItem("photoeye:room")!).state.room.version).toBe(3);
  });

  it("asks only for what's new, and keeps the room when nothing is", async () => {
    applySnapshot(room(3));
    const state = vi.spyOn(roomsApi, "state").mockResolvedValue({ ok: true, data: { changed: false, version: 3 } });
    expect(await refreshRoom()).toBe(false);
    expect(state).toHaveBeenCalledWith("ABC234", 3);
    state.mockResolvedValue({ ok: true, data: { changed: true, room: room(4) } });
    expect(await refreshRoom()).toBe(true);
    expect(useRoom.getState().room?.version).toBe(4);
  });

  it("keeps showing the last room when offline", async () => {
    applySnapshot(room(3));
    vi.spyOn(roomsApi, "state").mockResolvedValue({ ok: false, error: "offline" });
    await refreshRoom();
    expect(useRoom.getState()).toMatchObject({ offline: true, room: { version: 3 } });
    expect(getData().currentRoom).toBe("ABC234");
  });

  it("forgets a room that closed or that you were removed from, and says so", () => {
    applySnapshot(room(3));
    handleRoomFailure("room_not_found");
    expect(getData().currentRoom).toBeNull();
    expect(useRoom.getState().room).toBeNull();
    expect(useToasts.getState().toasts[0].message).toBe("Room ABC234 has closed.");

    applySnapshot(room(3));
    handleRoomFailure("removed");
    expect(useToasts.getState().toasts[1].message).toBe("You were removed from this room.");
  });
});

describe("polling", () => {
  it("slows down as the room goes quiet, then pauses", () => {
    expect(pollDelay(0)).toBe(5_000);
    expect(pollDelay(2 * 60_000)).toBe(15_000);
    expect(pollDelay(5 * 60_000)).toBe(60_000);
    expect(pollDelay(15 * 60_000)).toBeNull();
  });

  it("asks every 5 s while on screen, pauses after a quiet spell, and a nudge brings it back", async () => {
    vi.useFakeTimers();
    update((d) => { d.currentRoom = "ABC234"; });
    const state = vi.spyOn(roomsApi, "state").mockResolvedValue({ ok: true, data: { changed: false, version: 1 } });
    const stop = startRoomSync();
    await vi.advanceTimersByTimeAsync(0);
    expect(state).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(state).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(16 * 60_000);
    expect(useRoom.getState().paused).toBe(true);
    const calls = state.mock.calls.length;
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(state).toHaveBeenCalledTimes(calls);

    nudgeRoomSync();
    await vi.advanceTimersByTimeAsync(0);
    expect(useRoom.getState().paused).toBe(false);
    expect(state).toHaveBeenCalledTimes(calls + 1);
    stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(state).toHaveBeenCalledTimes(calls + 1);
  });

  it("doesn't ask while the screen is hidden", async () => {
    vi.useFakeTimers();
    update((d) => { d.currentRoom = "ABC234"; });
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    const state = vi.spyOn(roomsApi, "state").mockResolvedValue({ ok: true, data: { changed: false, version: 1 } });
    const stop = startRoomSync();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(state).not.toHaveBeenCalled();
    stop();
  });
});
