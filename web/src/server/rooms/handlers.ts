// The rooms API over HTTP: reads a request, checks its shape, hands it to the
// service, and writes the answer. Nothing here touches the real database,
// Blob or session directly (live.ts supplies those), so the e2e tests can
// answer the app's /api/rooms requests with these same handlers.
//
//   GET    /api/rooms/                     my rooms            { rooms }
//   POST   /api/rooms/        { theme, name? } create         201 { room }
//   DELETE /api/rooms/?code=               close (host)        204
//   POST   /api/rooms/rename/ { code, name } rename (host)      { room }
//   POST   /api/rooms/join/   { code }     join                { room }
//   GET    /api/rooms/state/?code=&since=  poll                { changed, version } | { changed, room }
//   DELETE /api/rooms/members/?code=&user= leave, or remove     { room } | 204
//   POST   /api/rooms/photos/?code=        post (multipart)    201 { photo, room }
//   GET    /api/rooms/photos/?id=          the picture         image/jpeg
//   DELETE /api/rooms/photos/?id=          take down           { room }
//   POST   /api/rooms/comments/ { photoId, text }              { room }
//   POST   /api/rooms/notes/  { code, text, tags }             { room }

import type { Exif } from "@/lib/exif";
import { LIMITS, type PhotoMeta } from "@/lib/rooms/protocol";
import { HttpError } from "../http";
import * as service from "./service";
import type { RoomDeps } from "./service";

/** Room requests by path. Deps are built only once the request is known to be one. */
export async function handleRoomsRequest(req: Request, deps: () => Promise<RoomDeps>): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "");
  const method = req.method;
  // A cookie-carrying request from another site is never the app.
  if (method !== "GET" && req.headers.get("sec-fetch-site") === "cross-site") throw new HttpError(403, "forbidden");
  const q = (name: string) => url.searchParams.get(name) ?? "";

  switch (`${method} ${path}`) {
    case "GET /api/rooms":
      return Response.json({ rooms: await service.listMyRooms(await deps()) });
    case "POST /api/rooms": {
      const body = await jsonBody(req);
      const room = await service.createRoom(await deps(), stringField(body, "theme", ""), stringField(body, "name", ""));
      return Response.json({ room }, { status: 201 });
    }
    case "DELETE /api/rooms":
      await service.closeRoom(await deps(), q("code"));
      return new Response(null, { status: 204 });
    case "POST /api/rooms/rename": {
      const body = await jsonBody(req);
      return Response.json({ room: await service.renameRoom(await deps(), stringField(body, "code"), stringField(body, "name")) });
    }
    case "POST /api/rooms/join": {
      const body = await jsonBody(req);
      return Response.json({ room: await service.joinRoom(await deps(), stringField(body, "code")) });
    }
    case "GET /api/rooms/state": {
      const since = q("since") ? Number(q("since")) : null;
      if (since !== null && !Number.isInteger(since)) throw new HttpError(400, "invalid");
      return Response.json(await service.roomState(await deps(), q("code"), since));
    }
    case "DELETE /api/rooms/members": {
      const room = await service.removeMember(await deps(), q("code"), q("user"));
      return room ? Response.json({ room }) : new Response(null, { status: 204 });
    }
    case "POST /api/rooms/photos": {
      const { picture, meta } = await photoUpload(req);
      return Response.json(await service.addPhoto(await deps(), q("code"), picture, meta), { status: 201 });
    }
    case "GET /api/rooms/photos": {
      const stored = await service.readPhoto(await deps(), q("id"));
      return new Response(stored.stream, {
        headers: {
          "content-type": stored.contentType,
          "content-length": String(stored.size),
          "x-content-type-options": "nosniff",
          // A photo never changes under its id; only this person may keep it.
          "cache-control": "private, max-age=31536000, immutable",
        },
      });
    }
    case "DELETE /api/rooms/photos":
      return Response.json({ room: await service.deletePhoto(await deps(), q("id")) });
    case "POST /api/rooms/comments": {
      const body = await jsonBody(req);
      return Response.json({ room: await service.addComment(await deps(), stringField(body, "photoId"), stringField(body, "text")) });
    }
    case "POST /api/rooms/notes": {
      const body = await jsonBody(req);
      const tags = body.tags ?? [];
      if (!Array.isArray(tags)) throw new HttpError(400, "invalid");
      return Response.json({ room: await service.addNote(await deps(), stringField(body, "code"), stringField(body, "text"), tags) });
    }
    default:
      throw new HttpError(404, "not_found");
  }
}

/* ---------- Reading requests ---------- */

async function jsonBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await req.json();
    if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {
    // falls through
  }
  throw new HttpError(400, "invalid");
}

function stringField(body: Record<string, unknown>, name: string, fallback?: string): string {
  const value = body[name] ?? fallback;
  if (typeof value !== "string") throw new HttpError(400, "invalid");
  return value;
}

/** Some headroom over the photo itself for the form's other parts. */
const MAX_UPLOAD_REQUEST = 2_000_000;

/** A posted photo: a JPEG small enough, and its details. */
export async function photoUpload(req: Request): Promise<{ picture: Blob; meta: PhotoMeta }> {
  if (Number(req.headers.get("content-length") ?? 0) > MAX_UPLOAD_REQUEST) throw new HttpError(413, "photo_too_large");
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new HttpError(400, "invalid");
  }
  const picture = form.get("photo");
  const rawMeta = form.get("meta");
  if (!(picture instanceof Blob) || typeof rawMeta !== "string") throw new HttpError(400, "invalid");
  if (picture.size > LIMITS.photoBytes) throw new HttpError(413, "photo_too_large");
  const head = new Uint8Array(await picture.slice(0, 3).arrayBuffer());
  if (head[0] !== 0xff || head[1] !== 0xd8 || head[2] !== 0xff) throw new HttpError(400, "invalid");
  let meta: unknown;
  try {
    meta = JSON.parse(rawMeta);
  } catch {
    throw new HttpError(400, "invalid");
  }
  return { picture: new Blob([picture], { type: "image/jpeg" }), meta: photoMeta(meta) };
}

const side = (value: unknown) => Number.isInteger(value) && (value as number) >= 1 && (value as number) <= LIMITS.photoSide;

function photoMeta(raw: unknown): PhotoMeta {
  if (!raw || typeof raw !== "object") throw new HttpError(400, "invalid");
  const m = raw as Record<string, unknown>;
  if (!side(m.width) || !side(m.height)) throw new HttpError(400, "invalid");
  const note = typeof m.note === "string" ? m.note : "";
  const themeId = typeof m.themeId === "string" && m.themeId.length <= LIMITS.themeId ? m.themeId : null;
  return { note, width: m.width as number, height: m.height as number, exif: sanitizeExif(m.exif), themeId };
}

const EXIF_TEXT = ["make", "model", "aperture", "shutter", "iso", "focalLength", "dateTaken"] as const;
const EXIF_NUMBERS = ["fNumber", "focalMm"] as const;

/**
 * Only the camera details a room shows. Where the photo was taken (lat/lon)
 * is left out: a room is for comparing shots, not for publishing locations.
 */
export function sanitizeExif(raw: unknown): Exif | null {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Record<string, unknown>;
  const exif: Record<string, string | number> = {};
  for (const key of EXIF_TEXT) {
    const value = source[key];
    if (typeof value === "string" && value.length <= 40) exif[key] = value;
  }
  for (const key of EXIF_NUMBERS) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) exif[key] = value;
  }
  return Object.keys(exif).length ? (exif as Exif) : null;
}
