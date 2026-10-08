// The room this device is in, as the server last described it, and the
// polling that keeps it fresh while someone is looking.
//
// The code of the room lives in the saved data (currentRoom); the room
// itself is cached under its own key, so Partners opens offline with what
// was last seen, and polling never rewrites the saved data.
//
// Polling costs server and database time (Neon sleeps after 5 idle
// minutes), so it runs only while Partners is on screen and online: every
// 5 s while the room is lively, slowing to 15 s and 60 s as it goes quiet,
// and pausing after 15 quiet minutes until someone taps Refresh. Anything
// new, or anything you do, brings it back to 5 s.

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { RoomSnapshot } from "@/lib/rooms/protocol";
import { roomsApi, type RoomsFailure } from "@/lib/roomsApi";
import { t } from "@/lib/i18n/core";
import { getData, update, useAppStore } from "@/state/appStore";
import { showToast } from "@/state/ui";
import { roomErrorMessage } from "./roomErrors";
import { pruneRoomImages } from "./roomImages";

export const ROOM_KEY = "photoeye:room";

interface RoomCache {
  room: RoomSnapshot | null;
  /** When the server last answered. */
  syncedAt: number | null;
  /** The last request didn't get through; showing what was last seen. */
  offline: boolean;
  /** Polling stopped after a long quiet spell. */
  paused: boolean;
}

export const useRoom = create<RoomCache>()(persist((): RoomCache => ({ room: null, syncedAt: null, offline: false, paused: false }), {
  name: ROOM_KEY,
  storage: createJSONStorage(() => localStorage),
  partialize: (s) => ({ room: s.room, syncedAt: s.syncedAt }),
  // Loaded during boot, like the saved data.
  skipHydration: true,
}));

/** The room on screen: the cached one, if it is the room this device is in. */
export function useCurrentRoom(): RoomSnapshot | null {
  const code = useAppStore((s) => s.currentRoom);
  const room = useRoom((s) => s.room);
  return room && room.code === code ? room : null;
}

/** Takes the server's latest word on the room this device is in. */
export function applySnapshot(room: RoomSnapshot): void {
  if (getData().currentRoom !== room.code) update((d) => { d.currentRoom = room.code; });
  useRoom.setState({ room, syncedAt: Date.now(), offline: false });
  void pruneRoomImages(new Set(room.photos.map((p) => p.id)));
}

/**
 * Puts a room you're in on screen. The cached copy shows straight away if it
 * is that room; polling fetches it otherwise.
 */
export function openRoom(code: string): void {
  if (getData().currentRoom !== code) update((d) => { d.currentRoom = code; });
}

/** Back to the list of rooms. You stay in the room, one tap away in the list. */
export function showRoomList(): void {
  if (getData().currentRoom !== null) update((d) => { d.currentRoom = null; });
}

/** Leaves the room on this device: forgets it and its pictures. */
export function forgetRoom(): void {
  if (getData().currentRoom !== null) update((d) => { d.currentRoom = null; });
  useRoom.setState({ room: null, syncedAt: null, offline: false, paused: false });
  void pruneRoomImages();
}

/**
 * Handles a failed request. The room being gone (closed, expired, or you were
 * removed) forgets it; being offline keeps showing what was last seen.
 */
export function handleRoomFailure(error: RoomsFailure, { quiet = false } = {}): void {
  if (error === "offline") {
    useRoom.setState({ offline: true });
    if (!quiet) showToast(roomErrorMessage(error));
    return;
  }
  if (error === "room_not_found" || error === "removed" || error === "not_member") {
    const code = getData().currentRoom;
    forgetRoom();
    showToast(error === "room_not_found" && code ? t("Room {code} has closed.", { code }) : roomErrorMessage(error), 6000);
    return;
  }
  if (!quiet) showToast(roomErrorMessage(error));
}

/** Asks the server whether the room changed. True when it did. */
export async function refreshRoom({ quiet = true } = {}): Promise<boolean> {
  const code = getData().currentRoom;
  if (!code) return false;
  const cached = useRoom.getState().room;
  const res = await roomsApi.state(code, cached?.code === code ? cached.version : null);
  if (!res.ok) {
    handleRoomFailure(res.error, { quiet });
    return false;
  }
  if (res.data.changed) {
    applySnapshot(res.data.room);
    return true;
  }
  useRoom.setState({ syncedAt: Date.now(), offline: false });
  return false;
}

/* ---------- Polling ---------- */

const FAST = 5_000;
const SLOW = 15_000;
const SLOWEST = 60_000;
const QUIET_SLOW = 2 * 60_000;
const QUIET_SLOWEST = 5 * 60_000;
const QUIET_PAUSE = 15 * 60_000;

/** How long to wait before asking again, after `quiet` ms without news. Null: pause. */
export function pollDelay(quiet: number): number | null {
  if (quiet >= QUIET_PAUSE) return null;
  if (quiet >= QUIET_SLOWEST) return SLOWEST;
  if (quiet >= QUIET_SLOW) return SLOW;
  return FAST;
}

let lastNews = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let running = false;
let inFlight: Promise<void> | null = null;

const visible = () => typeof document === "undefined" || document.visibilityState === "visible";

function schedule(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!running) return;
  const delay = pollDelay(Date.now() - lastNews);
  if (delay === null) {
    useRoom.setState({ paused: true });
    return;
  }
  timer = setTimeout(() => void tick(), delay);
}

async function tick(): Promise<void> {
  if (!running) return;
  if (!visible()) return; // picked up again when the screen comes back
  if (!navigator.onLine) {
    useRoom.setState({ offline: true });
    return;
  }
  inFlight ??= refreshRoom().then((changed) => { if (changed) lastNews = Date.now(); }).finally(() => { inFlight = null; });
  await inFlight;
  schedule();
}

/** Something happened (news, a tap, an action of yours): poll fast again, now. */
export function nudgeRoomSync(): void {
  lastNews = Date.now();
  useRoom.setState({ paused: false });
  if (running) void tick();
}

/** Polls while Partners is on screen. Returns a function that stops it. */
export function startRoomSync(): () => void {
  running = true;
  lastNews = Date.now();
  useRoom.setState({ paused: false });
  const wake = () => { if (visible() && !useRoom.getState().paused) void tick(); };
  document.addEventListener("visibilitychange", wake);
  window.addEventListener("online", wake);
  window.addEventListener("focus", wake);
  void tick();
  return () => {
    running = false;
    if (timer) clearTimeout(timer);
    timer = null;
    document.removeEventListener("visibilitychange", wake);
    window.removeEventListener("online", wake);
    window.removeEventListener("focus", wake);
  };
}
