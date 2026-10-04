// Walk Partners rooms. For now a room lives in this browser's saved data, so
// it only connects tabs open in the same browser; other tabs follow through
// the saved data's cross-tab sync.

import { t } from "@/lib/i18n/core";
import { roomCode } from "@/lib/util";
import { getData, update } from "@/state/appStore";
import { showToast } from "@/state/ui";

/** Opens a new room and joins it. Returns its code. */
export function createRoom(now = Date.now()): string {
  const rooms = getData().rooms;
  let code = roomCode();
  while (rooms[code]) code = roomCode();
  update((d) => {
    d.rooms[code] = { code, theme: "", createdAt: now, photos: [] };
    d.currentRoom = code;
  });
  showToast(t("Room {code} created. Share the code or QR code with your walk partners.", { code }));
  return code;
}

/** Joins a room by code. Returns null on success, or a message saying why not. */
export function joinRoom(rawCode: string): string | null {
  const code = rawCode.trim().toUpperCase();
  if (!code) return t("Enter a room code.");
  if (!getData().rooms[code]) {
    return t("Room not found. In this demo, rooms only work between tabs in the same browser, not across devices.");
  }
  update((d) => { d.currentRoom = code; });
  return null;
}

export function leaveRoom(): void {
  update((d) => { d.currentRoom = null; });
}
