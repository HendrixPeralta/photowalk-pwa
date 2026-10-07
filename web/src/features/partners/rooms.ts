// Walk Partners rooms. For now a room lives in this browser's saved data, so
// it only connects tabs open in the same browser; other tabs follow through
// the saved data's cross-tab sync.

import { putImage } from "@/lib/db";
import { readExif } from "@/lib/exif";
import { t } from "@/lib/i18n/core";
import { canvasToBlob, drawToCanvas, loadImage, readFileAsDataUrl } from "@/lib/image";
import { newRoomCode } from "@/lib/rooms/protocol";
import { uid } from "@/lib/util";
import { getData, update, warnIfStorageTight } from "@/state/appStore";
import type { Room, RoomPhoto } from "@/state/types";
import { showToast } from "@/state/ui";
import { useShareInbox } from "./inbox";

// Room photos are for looking at together, not for the library.
const ROOM_MAX_DIM = 900;

/** The room this browser is in, if it still exists. */
export function currentRoom(): Room | null {
  const { currentRoom: code, rooms } = getData();
  return code ? rooms[code] ?? null : null;
}

/** The link a partner opens to land straight in the room. */
export function inviteUrl(code: string, origin = window.location.origin): string {
  return `${origin}/partners/?room=${encodeURIComponent(code)}`;
}

export function copyInvite(): void {
  const room = currentRoom();
  if (!room) return;
  const link = inviteUrl(room.code);
  const fallback = () => showToast(t("Code: {code}", { code: room.code }));
  if (!navigator.clipboard?.writeText) { fallback(); return; }
  navigator.clipboard.writeText(link).then(() => showToast(t("Invite link copied to clipboard.")), fallback);
}

/** The name shown on what this browser posts. */
export function setDisplayName(name: string): void {
  const trimmed = name.trim();
  if (trimmed === getData().profile.displayName) return;
  update((d) => { d.profile.displayName = trimmed; });
}

/** Opens a new room and joins it. Returns its code. */
export function createRoom(now = Date.now()): string {
  const rooms = getData().rooms;
  let code = newRoomCode();
  while (rooms[code]) code = newRoomCode();
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

/**
 * Shares photos with the room, shrunk to 900px, with their EXIF (read before
 * the resize strips it) and the theme of the walk they were taken on.
 * Returns true when anything was shared, so the form can clear itself.
 */
export async function uploadToRoom(files: readonly File[], name: string, note: string): Promise<boolean> {
  const room = currentRoom();
  if (!room) { showToast(t("Create or join a room first, then upload.")); return false; }
  if (!files.length) { showToast(t("Choose at least one photo to upload first.")); return false; }

  const author = name.trim() || t("Anonymous");
  setDisplayName(author);
  let shared = 0;
  try {
    for (const file of files) {
      let canvas: HTMLCanvasElement;
      try {
        canvas = drawToCanvas(await loadImage(await readFileAsDataUrl(file)), ROOM_MAX_DIM);
      } catch {
        continue; // one unreadable file shouldn't abandon the rest
      }
      const imageId = uid();
      await putImage(imageId, await canvasToBlob(canvas, "image/jpeg", 0.82));
      const photo: RoomPhoto = {
        id: uid(),
        imageId,
        name: author,
        note: note.trim(),
        ts: Date.now(),
        comments: [],
        exif: await readExif(file),
        themeId: getData().activeWalk?.themeId ?? null,
      };
      update((d) => { d.rooms[room.code]?.photos.push(photo); });
      shared++;
    }
  } catch (err) {
    console.warn("PhotoEYE: upload failed.", err);
    showToast(t("Couldn't share that photo. Your device may be out of storage."));
    return shared > 0;
  }

  if (!shared) {
    showToast(t("None of those files could be read as images."));
    return false;
  }
  useShareInbox.setState({ files: [] });
  showToast(shared === 1 ? t("Shared with the room.") : t("Shared {n} shots with the room.", { n: shared }));
  void warnIfStorageTight();
  return true;
}

export function addComment(code: string, photoId: string, name: string, text: string): boolean {
  const body = text.trim();
  if (!body) return false;
  const author = name.trim() || t("Anonymous");
  setDisplayName(author);
  update((d) => {
    d.rooms[code]?.photos.find((p) => p.id === photoId)?.comments.push({ name: author, text: body, ts: Date.now() });
  });
  return true;
}

/** A feedback note on the room, filed under the critique tags picked for it. */
export function postNote(text: string, tags: readonly string[]): boolean {
  const room = currentRoom();
  const body = text.trim();
  if (!room || !body) return false;
  const name = getData().profile.displayName || t("Anonymous");
  update((d) => {
    const target = d.rooms[room.code];
    if (!target) return;
    (target.critique ??= []).push({ name, text: body, spec: tags.join(" "), ts: Date.now() });
  });
  return true;
}
