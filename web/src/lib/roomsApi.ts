// The app's side of the rooms API (src/server/rooms/handlers.ts lists the
// endpoints). Plain fetches on the app's slashed URLs; the session cookie
// rides along. Every call settles to data or an error code, never a throw:
// "offline" when the request didn't get through, "server" for anything the
// server didn't explain.

import { accountsEnabled } from "./authApi";
import {
  isRoomError, type CritiqueTag, type PhotoMeta, type RoomError, type RoomPhoto, type RoomSnapshot, type RoomSummary,
} from "./rooms/protocol";

export type RoomsFailure = RoomError | "offline" | "server";
export type RoomsResult<T> = { ok: true; data: T } | { ok: false; error: RoomsFailure };

/** Rooms live on the server, so they need the same build that has accounts. */
export const roomsEnabled = accountsEnabled;

async function call<T>(path: string, init: RequestInit = {}, timeoutMs = 10_000): Promise<RoomsResult<T>> {
  let res: Response;
  try {
    res = await fetch(path, { credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(timeoutMs), ...init });
  } catch {
    return { ok: false, error: "offline" };
  }
  if (res.status === 204) return { ok: true, data: undefined as T };
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // An empty or non-JSON answer: only fine for a success without a body.
  }
  if (res.ok) return { ok: true, data: body as T };
  const code = (body as { error?: unknown } | null)?.error;
  return { ok: false, error: isRoomError(code) ? code : "server" };
}

const post = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});
const q = encodeURIComponent;

export const roomsApi = {
  list: () => call<{ rooms: RoomSummary[] }>("/api/rooms/"),
  create: (theme: string) => call<{ room: RoomSnapshot }>("/api/rooms/", post({ theme })),
  close: (code: string) => call<void>(`/api/rooms/?code=${q(code)}`, { method: "DELETE" }),
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
