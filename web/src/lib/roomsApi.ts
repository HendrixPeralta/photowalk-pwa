// The app's side of the rooms API (src/server/rooms/handlers.ts lists the
// endpoints). Plain fetches on the app's slashed URLs, through apiCall, so
// every call settles to data or an error code, never a throw.

import { apiCall, postJson } from "./apiCall";
import { accountsEnabled } from "./authApi";
import {
  isRoomError, type CritiqueTag, type PhotoMeta, type RoomError, type RoomPhoto, type RoomSnapshot, type RoomSummary,
} from "./rooms/protocol";

export type RoomsFailure = RoomError | "offline" | "server";
export type RoomsResult<T> = { ok: true; data: T } | { ok: false; error: RoomsFailure };

/** Rooms live on the server, so they need the same build that has accounts. */
export const roomsEnabled = accountsEnabled;

const call = <T>(path: string, init: RequestInit = {}, timeoutMs = 10_000): Promise<RoomsResult<T>> =>
  apiCall<T, RoomError>(path, isRoomError, init, timeoutMs);
const post = postJson;
const q = encodeURIComponent;

export const roomsApi = {
  list: () => call<{ rooms: RoomSummary[] }>("/api/rooms/"),
  create: (theme: string) => call<{ room: RoomSnapshot }>("/api/rooms/", post({ theme })),
  join: (code: string) => call<{ room: RoomSnapshot }>("/api/rooms/join/", post({ code })),
  state: (code: string, since: number | null) =>
    call<{ changed: false; version: number } | { changed: true; room: RoomSnapshot }>(
      `/api/rooms/state/?code=${q(code)}${since === null ? "" : `&since=${since}`}`,
    ),
  /** Yourself: leave (204). Someone else, as host: remove them. */
  removeMember: (code: string, userId: string) =>
    call<{ room: RoomSnapshot } | undefined>(`/api/rooms/members/?code=${q(code)}&user=${q(userId)}`, { method: "DELETE" }),
  uploadPhoto: (code: string, jpeg: Blob, meta: PhotoMeta) => {
    const form = new FormData();
    form.append("photo", jpeg, "photo.jpg");
    form.append("meta", JSON.stringify(meta));
    return call<{ photo: RoomPhoto; room: RoomSnapshot }>(`/api/rooms/photos/?code=${q(code)}`, { method: "POST", body: form }, 30_000);
  },
  deletePhoto: (photoId: string) => call<{ room: RoomSnapshot }>(`/api/rooms/photos/?id=${q(photoId)}`, { method: "DELETE" }),
  comment: (photoId: string, text: string) => call<{ room: RoomSnapshot }>("/api/rooms/comments/", post({ photoId, text })),
  note: (code: string, text: string, tags: readonly CritiqueTag[]) =>
    call<{ room: RoomSnapshot }>("/api/rooms/notes/", post({ code, text, tags })),

  /** A room photo's picture. */
  async photo(photoId: string): Promise<RoomsResult<Blob>> {
    try {
      const res = await fetch(`/api/rooms/photos/?id=${q(photoId)}`, { credentials: "same-origin", signal: AbortSignal.timeout(30_000) });
      if (res.ok) return { ok: true, data: await res.blob() };
      const code = ((await res.json().catch(() => null)) as { error?: unknown } | null)?.error;
      return { ok: false, error: isRoomError(code) ? code : "server" };
    } catch {
      return { ok: false, error: "offline" };
    }
  },
};
