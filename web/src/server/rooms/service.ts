// The rules of Walk Partners rooms, on the server. Everything here works on
// what it is handed (a database, a Blob store, the signed-in person, the
// time), so tests run it against an in-memory Postgres and Blob store, and
// the e2e tests run it inside the browser test.
//
// A room is gone once it has gone 30 days without a photo, note or comment:
// every read treats it as missing straight away, and the daily cleanup
// deletes it and its pictures later. Every change bumps the room's version,
// which is what lets the app ask cheaply whether anything is new.

import { and, asc, count, eq, gt, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import {
  isCritiqueTag, LIMITS, newRoomCode, normalizeRoomCode, ROOM_LIFETIME_MS,
  type CritiqueTag, type PhotoMeta, type RoomPerson, type RoomPhoto, type RoomSnapshot, type RoomSummary,
} from "@/lib/rooms/protocol";
import type { BlobStore, StoredBlob } from "../blob";
import type { Db } from "../db";
import { user as users } from "../db/auth-schema";
import { blobTrash, blobUsage, roomComments, roomMembers, roomNotes, roomPhotos, rooms } from "../db/rooms-schema";
import { HttpError } from "../http";
import type { SessionUser } from "../session";

export interface RoomDeps {
  db: Db;
  /** Only photo routes touch Blob, so the store is fetched when needed. */
  blobs: () => BlobStore;
  user: SessionUser;
  now: Date;
  /** Runs work after the response has gone out (Next's after() on the server). */
  later: (work: () => Promise<unknown>) => void;
  /** For tests: the random source behind new room codes. */
  random?: (bytes: Uint8Array) => Uint8Array;
}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Q = Db | Tx;
type RoomRow = typeof rooms.$inferSelect;

/** Uploads stop here each month, short of the Hobby plan's 2,000. */
export const MONTHLY_UPLOAD_BUDGET = 1500;

const DAY_MS = 24 * 60 * 60 * 1000;
const cutoff = (now: Date) => new Date(now.getTime() - ROOM_LIFETIME_MS);
const newId = () => crypto.randomUUID();

/* ---------- Reading ---------- */

/** The rooms I'm in, newest activity first. */
export async function listMyRooms({ db, user, now }: RoomDeps): Promise<RoomSummary[]> {
  const mine = await db
    .select({ room: rooms })
    .from(roomMembers)
    .innerJoin(rooms, eq(rooms.id, roomMembers.roomId))
    .where(and(eq(roomMembers.userId, user.id), isNull(roomMembers.removedAt), gt(rooms.lastActivityAt, cutoff(now))))
    .orderBy(sql`${rooms.lastActivityAt} desc`);
  if (!mine.length) return [];
  const ids = mine.map((m) => m.room.id);
  const photoCounts = await db.select({ roomId: roomPhotos.roomId, n: count() }).from(roomPhotos)
    .where(inArray(roomPhotos.roomId, ids)).groupBy(roomPhotos.roomId);
  const memberCounts = await db.select({ roomId: roomMembers.roomId, n: count() }).from(roomMembers)
    .where(and(inArray(roomMembers.roomId, ids), isNull(roomMembers.removedAt))).groupBy(roomMembers.roomId);
  const photosIn = new Map(photoCounts.map((r) => [r.roomId, r.n]));
  const membersIn = new Map(memberCounts.map((r) => [r.roomId, r.n]));
  return mine.map(({ room }) => ({
    code: room.code,
    theme: room.theme,
    isHost: room.hostId === user.id,
    photoCount: photosIn.get(room.id) ?? 0,
    memberCount: membersIn.get(room.id) ?? 0,
    lastActivityAt: room.lastActivityAt.getTime(),
    expiresAt: room.lastActivityAt.getTime() + ROOM_LIFETIME_MS,
  }));
}

/** The room if it changed since `since`, for the app's polling. */
export async function roomState(deps: RoomDeps, rawCode: string, since: number | null)
  : Promise<{ changed: false; version: number } | { changed: true; room: RoomSnapshot }> {
  const room = await liveRoom(deps.db, rawCode, deps.now);
  await requireMember(deps.db, room.id, deps.user.id);
  if (since !== null && since === room.version) return { changed: false, version: room.version };
  return { changed: true, room: await snapshot(deps.db, room) };
}

/** A photo's picture, for members of its room. */
export async function readPhoto(deps: RoomDeps, photoId: string): Promise<StoredBlob> {
  const { photo, room } = await livePhoto(deps.db, photoId, deps.now);
  await requireMember(deps.db, room.id, deps.user.id);
  const stored = await deps.blobs().get(photo.blobPathname);
  if (!stored) throw new HttpError(404, "not_found");
  return stored;
}

/* ---------- Rooms and people ---------- */

export async function createRoom(deps: RoomDeps, theme: string): Promise<RoomSnapshot> {
  const { db, user, now } = deps;
  const title = cleanText(theme, LIMITS.theme, { allowEmpty: true });
  const [{ hosted }] = await db.select({ hosted: count() }).from(rooms)
    .where(and(eq(rooms.hostId, user.id), gt(rooms.lastActivityAt, cutoff(now))));
  if (hosted >= LIMITS.hostedRooms) throw new HttpError(409, "too_many_rooms");

  for (let attempt = 0; attempt < 5; attempt++) {
    const id = newId();
    const created = await db.transaction(async (tx) => {
      const [row] = await tx.insert(rooms)
        .values({ id, code: newRoomCode(deps.random), hostId: user.id, theme: title, createdAt: now, lastActivityAt: now })
        .onConflictDoNothing({ target: rooms.code })
        .returning();
      if (!row) return null; // that code is taken: try another
      await tx.insert(roomMembers).values({ roomId: id, userId: user.id, joinedAt: now });
      return row;
    });
    if (created) return snapshot(db, created);
  }
  throw new HttpError(503, "busy");
}

/** Joins with a code (or a pasted invite link). Joining a room you're in just returns it. */
export async function joinRoom(deps: RoomDeps, rawCode: string): Promise<RoomSnapshot> {
  const { db, user, now } = deps;
  const room = await liveRoom(db, rawCode, now);
  const membership = await memberRow(db, room.id, user.id);
  if (membership?.removedAt) throw new HttpError(403, "removed");
  if (membership) return snapshot(db, room);
  return db.transaction(async (tx) => {
    const [{ n }] = await tx.select({ n: count() }).from(roomMembers)
      .where(and(eq(roomMembers.roomId, room.id), isNull(roomMembers.removedAt)));
    if (n >= LIMITS.membersPerRoom) throw new HttpError(409, "room_full");
    // A person who left before is let back in.
    await tx.insert(roomMembers).values({ roomId: room.id, userId: user.id, joinedAt: now })
      .onConflictDoUpdate({ target: [roomMembers.roomId, roomMembers.userId], set: { joinedAt: now } });
    return snapshot(tx, await bump(tx, room.id));
  });
}

/**
 * Takes someone out of a room. Yourself: leaving (the host closes instead).
 * Someone else: only the host, and they can't come back. Null after leaving.
 */
export async function removeMember(deps: RoomDeps, rawCode: string, targetId: string): Promise<RoomSnapshot | null> {
  const { db, user, now } = deps;
  const room = await liveRoom(db, rawCode, now);
  await requireMember(db, room.id, user.id);
  const isSelf = targetId === user.id;
  if (isSelf && room.hostId === user.id) throw new HttpError(409, "host_cannot_leave");
  if (!isSelf && room.hostId !== user.id) throw new HttpError(403, "host_only");
  const target = await memberRow(db, room.id, targetId);
  if (!target || target.removedAt) throw new HttpError(404, "not_found");
  return db.transaction(async (tx) => {
    if (isSelf) {
      await tx.delete(roomMembers).where(and(eq(roomMembers.roomId, room.id), eq(roomMembers.userId, targetId)));
      await bump(tx, room.id);
      return null;
    }
    await tx.update(roomMembers).set({ removedAt: now })
      .where(and(eq(roomMembers.roomId, room.id), eq(roomMembers.userId, targetId)));
    return snapshot(tx, await bump(tx, room.id));
  });
}

/** The host closes the room: it and everything in it is deleted now. */
export async function closeRoom(deps: RoomDeps, rawCode: string): Promise<void> {
  const { db, user, now } = deps;
  const room = await liveRoom(db, rawCode, now);
  await requireMember(db, room.id, user.id);
  if (room.hostId !== user.id) throw new HttpError(403, "host_only");
  const trashed = await db.transaction(async (tx) => {
    const paths = await trashRoomPhotos(tx, [room.id], now);
    await tx.delete(rooms).where(eq(rooms.id, room.id));
    return paths;
  });
  if (trashed.length) deps.later(() => drainTrash(db, deps.blobs(), trashed));
}

/* ---------- Posting ---------- */

export async function addPhoto(deps: RoomDeps, rawCode: string, picture: Blob, meta: PhotoMeta)
  : Promise<{ photo: RoomPhoto; room: RoomSnapshot }> {
  const { db, user, now } = deps;
  const room = await liveRoom(db, rawCode, now);
  await requireMember(db, room.id, user.id);
  const note = cleanText(meta.note, LIMITS.photoNote, { allowEmpty: true });

  const [{ inRoom }] = await db.select({ inRoom: count() }).from(roomPhotos).where(eq(roomPhotos.roomId, room.id));
  if (inRoom >= LIMITS.photosPerRoom) throw new HttpError(409, "too_many_photos");
  const [{ today }] = await db.select({ today: count() }).from(roomPhotos)
    .where(and(eq(roomPhotos.userId, user.id), gte(roomPhotos.createdAt, new Date(now.getTime() - DAY_MS))));
  if (today >= LIMITS.photosPerUserPerDay) throw new HttpError(429, "too_many_photos");
  const month = now.toISOString().slice(0, 7);
  const [usage] = await db.select().from(blobUsage).where(eq(blobUsage.month, month));
  if ((usage?.puts ?? 0) >= MONTHLY_UPLOAD_BUDGET) throw new HttpError(503, "upload_budget");

  const id = newId();
  const pathname = `rooms/${room.id}/${id}.jpg`;
  const blobs = deps.blobs();
  await blobs.put(pathname, picture, "image/jpeg");
  // Counted only once the upload has really happened.
  await db.insert(blobUsage).values({ month, puts: 1 })
    .onConflictDoUpdate({ target: blobUsage.month, set: { puts: sql`${blobUsage.puts} + 1` } });
  try {
    return await db.transaction(async (tx) => {
      await tx.insert(roomPhotos).values({
        id, roomId: room.id, userId: user.id, blobPathname: pathname,
        width: meta.width, height: meta.height, bytes: picture.size,
        note, exif: meta.exif, themeId: meta.themeId, createdAt: now,
      });
      const snap = await snapshot(tx, await bump(tx, room.id, now));
      return { photo: snap.photos.find((p) => p.id === id)!, room: snap };
    });
  } catch (err) {
    // No row points at the picture, so nothing would ever delete it.
    await blobs.del([pathname]).catch(() => {});
    throw err;
  }
}

/** The person who posted a photo, or the host, can take it down. */
export async function deletePhoto(deps: RoomDeps, photoId: string): Promise<RoomSnapshot> {
  const { db, user, now } = deps;
  const { photo, room } = await livePhoto(db, photoId, now);
  await requireMember(db, room.id, user.id);
  if (photo.userId !== user.id && room.hostId !== user.id) throw new HttpError(403, "forbidden");
  const snap = await db.transaction(async (tx) => {
    await tx.insert(blobTrash).values({ pathname: photo.blobPathname, createdAt: now }).onConflictDoNothing();
    await tx.delete(roomPhotos).where(eq(roomPhotos.id, photo.id));
    return snapshot(tx, await bump(tx, room.id));
  });
  deps.later(() => drainTrash(db, deps.blobs(), [photo.blobPathname]));
  return snap;
}

export async function addComment(deps: RoomDeps, photoId: string, text: string): Promise<RoomSnapshot> {
  const { db, user, now } = deps;
  const body = cleanText(text, LIMITS.commentText);
  const { photo, room } = await livePhoto(db, photoId, now);
  await requireMember(db, room.id, user.id);
  const [{ n }] = await db.select({ n: count() }).from(roomComments).where(eq(roomComments.photoId, photo.id));
  if (n >= LIMITS.commentsPerPhoto) throw new HttpError(409, "too_many_posts");
  return db.transaction(async (tx) => {
    await tx.insert(roomComments).values({ id: newId(), photoId: photo.id, userId: user.id, text: body, createdAt: now });
    return snapshot(tx, await bump(tx, room.id, now));
  });
}

export async function addNote(deps: RoomDeps, rawCode: string, text: string, tags: readonly unknown[]): Promise<RoomSnapshot> {
  const { db, user, now } = deps;
  const body = cleanText(text, LIMITS.noteText);
  if (tags.length > LIMITS.tagsPerNote || !tags.every(isCritiqueTag)) throw new HttpError(400, "invalid");
  const room = await liveRoom(db, rawCode, now);
  await requireMember(db, room.id, user.id);
  const [{ n }] = await db.select({ n: count() }).from(roomNotes).where(eq(roomNotes.roomId, room.id));
  if (n >= LIMITS.notesPerRoom) throw new HttpError(409, "too_many_posts");
  return db.transaction(async (tx) => {
    await tx.insert(roomNotes).values({
      id: newId(), roomId: room.id, userId: user.id, text: body, tags: [...new Set(tags as CritiqueTag[])], createdAt: now,
    });
    return snapshot(tx, await bump(tx, room.id, now));
  });
}

/* ---------- Cleanup ---------- */

/**
 * Deletes rooms that have gone 30 days without activity, then the pictures
 * waiting in the trash. Safe to run as often as you like, and it catches up
 * after a missed day.
 */
export async function expireRooms(db: Db, blobs: BlobStore, now: Date): Promise<{ expiredRooms: number; deletedBlobs: number }> {
  let expiredRooms = 0;
  for (;;) {
    const batch = await db.select({ id: rooms.id }).from(rooms).where(lte(rooms.lastActivityAt, cutoff(now))).limit(50);
    if (!batch.length) break;
    const ids = batch.map((r) => r.id);
    await db.transaction(async (tx) => {
      await trashRoomPhotos(tx, ids, now);
      await tx.delete(rooms).where(inArray(rooms.id, ids));
    });
    expiredRooms += ids.length;
  }
  const deletedBlobs = await drainTrash(db, blobs);
  return { expiredRooms, deletedBlobs };
}

/**
 * Deletes trashed pictures from Blob, then their trash rows. A failure stops
 * the run and leaves the rest for next time. Returns how many went.
 */
export async function drainTrash(db: Db, blobs: BlobStore, only?: readonly string[], limit = 500): Promise<number> {
  const rows = only
    ? only.map((pathname) => ({ pathname }))
    : await db.select({ pathname: blobTrash.pathname }).from(blobTrash).orderBy(asc(blobTrash.createdAt)).limit(limit);
  let deleted = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100).map((r) => r.pathname);
    try {
      await blobs.del(chunk);
    } catch (err) {
      console.warn("PhotoEYE: could not delete room photos from Blob; the daily cleanup will retry.", err);
      break;
    }
    await db.delete(blobTrash).where(inArray(blobTrash.pathname, chunk));
    deleted += chunk.length;
  }
  return deleted;
}

/* ---------- Helpers ---------- */

async function liveRoom(db: Q, rawCode: string, now: Date): Promise<RoomRow> {
  const code = normalizeRoomCode(rawCode);
  if (!code) throw new HttpError(400, "invalid_code");
  const [room] = await db.select().from(rooms).where(and(eq(rooms.code, code), gt(rooms.lastActivityAt, cutoff(now))));
  if (!room) throw new HttpError(404, "room_not_found");
  return room;
}

async function livePhoto(db: Q, photoId: string, now: Date) {
  const [found] = await db.select({ photo: roomPhotos, room: rooms }).from(roomPhotos)
    .innerJoin(rooms, eq(rooms.id, roomPhotos.roomId))
    .where(and(eq(roomPhotos.id, photoId), gt(rooms.lastActivityAt, cutoff(now))));
  if (!found) throw new HttpError(404, "not_found");
  return found;
}

async function memberRow(db: Q, roomId: string, userId: string) {
  const [row] = await db.select().from(roomMembers).where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)));
  return row ?? null;
}

async function requireMember(db: Q, roomId: string, userId: string): Promise<void> {
  const row = await memberRow(db, roomId, userId);
  if (!row) throw new HttpError(403, "not_member");
  if (row.removedAt) throw new HttpError(403, "removed");
}

/** Marks a change: a new version, and for posts a new last activity. */
async function bump(tx: Q, roomId: string, activityAt?: Date): Promise<RoomRow> {
  const [row] = await tx.update(rooms)
    .set(activityAt ? { version: sql`${rooms.version} + 1`, lastActivityAt: activityAt } : { version: sql`${rooms.version} + 1` })
    .where(eq(rooms.id, roomId))
    .returning();
  return row;
}

async function trashRoomPhotos(tx: Q, roomIds: string[], now: Date): Promise<string[]> {
  const photos = await tx.select({ pathname: roomPhotos.blobPathname }).from(roomPhotos).where(inArray(roomPhotos.roomId, roomIds));
  const paths = photos.map((p) => p.pathname);
  if (paths.length) {
    await tx.insert(blobTrash).values(paths.map((pathname) => ({ pathname, createdAt: now }))).onConflictDoNothing();
  }
  return paths;
}

/** Trimmed text within its limit, or 400 invalid. */
function cleanText(text: unknown, max: number, { allowEmpty = false } = {}): string {
  if (typeof text !== "string") throw new HttpError(400, "invalid");
  const trimmed = text.trim();
  if ((!trimmed && !allowEmpty) || trimmed.length > max) throw new HttpError(400, "invalid");
  return trimmed;
}

/** The whole room, as the app shows it. */
async function snapshot(db: Q, room: RoomRow): Promise<RoomSnapshot> {
  const members = await db.select({ userId: roomMembers.userId }).from(roomMembers)
    .where(and(eq(roomMembers.roomId, room.id), isNull(roomMembers.removedAt)))
    .orderBy(asc(roomMembers.joinedAt));
  const photos = await db.select().from(roomPhotos).where(eq(roomPhotos.roomId, room.id)).orderBy(asc(roomPhotos.createdAt));
  const comments = photos.length
    ? await db.select().from(roomComments).where(inArray(roomComments.photoId, photos.map((p) => p.id))).orderBy(asc(roomComments.createdAt))
    : [];
  const notes = await db.select().from(roomNotes).where(eq(roomNotes.roomId, room.id)).orderBy(asc(roomNotes.createdAt));

  const active = members.map((m) => m.userId);
  const memberIds = active.includes(room.hostId) ? [room.hostId, ...active.filter((id) => id !== room.hostId)] : active;
  const peopleIds = [...new Set([...memberIds, ...photos.map((p) => p.userId), ...comments.map((c) => c.userId), ...notes.map((n) => n.userId)])];
  const peopleRows = peopleIds.length
    ? await db.select({ id: users.id, name: users.name, image: users.image }).from(users).where(inArray(users.id, peopleIds))
    : [];
  const people: Record<string, RoomPerson> = {};
  for (const p of peopleRows) people[p.id] = { id: p.id, name: p.name, image: p.image ?? null };

  return {
    code: room.code,
    theme: room.theme,
    hostId: room.hostId,
    version: room.version,
    createdAt: room.createdAt.getTime(),
    lastActivityAt: room.lastActivityAt.getTime(),
    expiresAt: room.lastActivityAt.getTime() + ROOM_LIFETIME_MS,
    members: memberIds,
    people,
    photos: photos.map((p) => ({
      id: p.id,
      userId: p.userId,
      note: p.note,
      ts: p.createdAt.getTime(),
      width: p.width,
      height: p.height,
      exif: p.exif ?? null,
      themeId: p.themeId,
      comments: comments.filter((c) => c.photoId === p.id).map((c) => ({ id: c.id, userId: c.userId, text: c.text, ts: c.createdAt.getTime() })),
    })),
    notes: notes.map((n) => ({ id: n.id, userId: n.userId, text: n.text, tags: n.tags, ts: n.createdAt.getTime() })),
  };
}
