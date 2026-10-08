// Walk Partners rooms: what people do in them. Rooms live on the server
// (src/server/rooms); this device keeps the code of the room it is in and a
// cached copy of it (roomStore). Each action asks the server, takes the
// fresh room it answers with, and says what went wrong when something did.

import { themeById } from "@/lib/content/themes";
import { readExif } from "@/lib/exif";
import { t } from "@/lib/i18n/core";
import { canvasToBlob, drawToCanvas, loadImage, readFileAsDataUrl } from "@/lib/image";
import { LIMITS, normalizeRoomCode, type CritiqueTag, type PhotoMeta } from "@/lib/rooms/protocol";
import { roomsApi } from "@/lib/roomsApi";
import { useAccount } from "@/state/account";
import { getData } from "@/state/appStore";
import { showToast } from "@/state/ui";
import { useShareInbox } from "./inbox";
import { roomErrorMessage } from "./roomErrors";
import { keepPostedImage } from "./roomImages";
import { applySnapshot, forgetRoom, handleRoomFailure, nudgeRoomSync } from "./roomStore";

// Room photos are for looking at together, not for the library.
const ROOM_MAX_DIM = 900;

/** The link a partner opens to land straight in the room. */
export function inviteUrl(code: string, origin = window.location.origin): string {
  return `${origin}/partners/?room=${encodeURIComponent(code)}`;
}

export function copyInvite(): void {
  const code = getData().currentRoom;
  if (!code) return;
  const link = inviteUrl(code);
  const fallback = () => showToast(t("Code: {code}", { code }));
  if (!navigator.clipboard?.writeText) { fallback(); return; }
  navigator.clipboard.writeText(link).then(() => showToast(t("Invite link copied to clipboard.")), fallback);
}

/** The walk the room is about: the one under way, else the one just finished. */
function walkTheme(): string {
  const { activeWalk, lastWalk, customThemes } = getData();
  const id = activeWalk?.themeId ?? lastWalk?.themeId;
  return (id && themeById(id, customThemes)?.title) || "";
}

/** What a room is called: its name, or its code until it has one. */
export function roomLabel(room: { name: string; code: string }): string {
  return room.name || room.code;
}

/** Opens a new room, with you as its host. Null on success, else what went wrong. */
export async function createRoom(name = ""): Promise<string | null> {
  const res = await roomsApi.create(walkTheme().slice(0, LIMITS.theme), name.trim().slice(0, LIMITS.roomName));
  if (!res.ok) return roomErrorMessage(res.error);
  applySnapshot(res.data.room);
  showToast(t("Room {code} created. Share the code or QR code with your walk partners.", { code: res.data.room.code }));
  return null;
}

/** Joins with a code, typed any way, or a pasted invite link. Null on success, else what went wrong. */
export async function joinRoom(raw: string): Promise<string | null> {
  if (!raw.trim()) return t("Enter a room code.");
  const code = normalizeRoomCode(raw);
  if (!code) return roomErrorMessage("invalid_code");
  const res = await roomsApi.join(code);
  if (!res.ok) return roomErrorMessage(res.error);
  applySnapshot(res.data.room);
  return null;
}

/** The host names the room for everyone in it. An empty name goes back to the code. */
export async function renameRoom(name: string): Promise<boolean> {
  const code = getData().currentRoom;
  if (!code) return false;
  const res = await roomsApi.rename(code, name.trim().slice(0, LIMITS.roomName));
  if (!res.ok) { handleRoomFailure(res.error); return false; }
  applySnapshot(res.data.room);
  nudgeRoomSync();
  return true;
}

/** Leaves the room. The host closes it instead (closeRoom). */
export async function leaveRoom(): Promise<void> {
  const code = getData().currentRoom;
  const me = useAccount.getState().user?.id;
  if (!code || !me) { forgetRoom(); return; }
  const res = await roomsApi.removeMember(code, me);
  // Gone or never in it: either way, not in it now.
  if (res.ok || res.error === "room_not_found" || res.error === "not_member" || res.error === "removed") {
    forgetRoom();
    return;
  }
  showToast(roomErrorMessage(res.error));
}

/** The host closes the room: everyone loses access and its photos are deleted. */
export async function closeRoom(): Promise<void> {
  const code = getData().currentRoom;
  if (!code) return;
  const res = await roomsApi.close(code);
  if (!res.ok && res.error !== "room_not_found") { showToast(roomErrorMessage(res.error)); return; }
  forgetRoom();
  showToast(t("Room {code} closed.", { code }));
}

/** The host takes someone out of the room. They can't come back. */
export async function removeMember(userId: string): Promise<void> {
  const code = getData().currentRoom;
  if (!code) return;
  const res = await roomsApi.removeMember(code, userId);
  if (!res.ok) { handleRoomFailure(res.error); return; }
  if (res.data) applySnapshot(res.data.room);
  nudgeRoomSync();
}

/** A shrunk JPEG of a picked photo, small enough for the server. Null when the file isn't an image. */
async function roomJpeg(file: File): Promise<{ jpeg: Blob; width: number; height: number } | null> {
  let canvas: HTMLCanvasElement;
  try {
    canvas = drawToCanvas(await loadImage(await readFileAsDataUrl(file)), ROOM_MAX_DIM);
  } catch {
    return null;
  }
  let jpeg = await canvasToBlob(canvas, "image/jpeg", 0.82);
  if (jpeg.size > LIMITS.photoBytes) jpeg = await canvasToBlob(canvas, "image/jpeg", 0.7);
  return { jpeg, width: canvas.width, height: canvas.height };
}

/**
 * Posts photos to the room, one at a time, shrunk to 900px, with their camera
 * details (read before the resize strips them) and the theme of the walk.
 * Photos from the share sheet leave the inbox only once they're posted, so a
 * failure can be retried. Returns true when anything was posted.
 */
export async function uploadToRoom(
  files: readonly File[], note: string, onProgress?: (done: number, total: number) => void,
): Promise<boolean> {
  const code = getData().currentRoom;
  if (!code) { showToast(t("Create or join a room first, then upload.")); return false; }
  if (!files.length) { showToast(t("Choose at least one photo to upload first.")); return false; }
  if (!navigator.onLine) { showToast(roomErrorMessage("offline")); return false; }

  const themeId = getData().activeWalk?.themeId ?? null;
  const posted = new Set<File>();
  let unreadable = 0;
  for (const [i, file] of files.entries()) {
    onProgress?.(i, files.length);
    const shrunk = await roomJpeg(file);
    if (!shrunk) { unreadable++; continue; }
    const meta: PhotoMeta = { note: note.trim().slice(0, LIMITS.photoNote), width: shrunk.width, height: shrunk.height, exif: await readExif(file), themeId };
    const res = await roomsApi.uploadPhoto(code, shrunk.jpeg, meta);
    if (!res.ok) {
      handleRoomFailure(res.error);
      break;
    }
    await keepPostedImage(res.data.photo.id, shrunk.jpeg).catch(() => {});
    applySnapshot(res.data.room);
    posted.add(file);
  }
  onProgress?.(files.length, files.length);
  useShareInbox.setState((s) => ({ files: s.files.filter((f) => !posted.has(f)) }));

  if (posted.size) {
    nudgeRoomSync();
    showToast(posted.size === 1 ? t("Shared with the room.") : t("Shared {n} shots with the room.", { n: posted.size }));
  } else if (unreadable === files.length) {
    showToast(t("None of those files could be read as images."));
  }
  return posted.size > 0;
}

export async function addComment(photoId: string, text: string): Promise<boolean> {
  const body = text.trim();
  if (!body) return false;
  const res = await roomsApi.comment(photoId, body.slice(0, LIMITS.commentText));
  if (!res.ok) { handleRoomFailure(res.error); return false; }
  applySnapshot(res.data.room);
  nudgeRoomSync();
  return true;
}

/** A feedback note on the room, filed under the critique tags picked for it. */
export async function postNote(text: string, tags: readonly CritiqueTag[]): Promise<boolean> {
  const code = getData().currentRoom;
  const body = text.trim();
  if (!code || !body) return false;
  const res = await roomsApi.note(code, body.slice(0, LIMITS.noteText), tags);
  if (!res.ok) { handleRoomFailure(res.error); return false; }
  applySnapshot(res.data.room);
  nudgeRoomSync();
  return true;
}

/** The poster or the host takes a photo down. */
export async function deletePhoto(photoId: string): Promise<boolean> {
  const res = await roomsApi.deletePhoto(photoId);
  if (!res.ok) { handleRoomFailure(res.error); return false; }
  applySnapshot(res.data.room);
  nudgeRoomSync();
  return true;
}
