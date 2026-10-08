// @vitest-environment node

import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { LIMITS, ROOM_LIFETIME_MS, type PhotoMeta } from "@/lib/rooms/protocol";
import { memoryBlobStore, type BlobStore } from "../blob";
import type { Db } from "../db";
import { user } from "../db/auth-schema";
import { blobTrash, blobUsage, roomMembers } from "../db/rooms-schema";
import { createTestDb } from "../db/testDb";
import * as rooms from "./service";
import { MONTHLY_UPLOAD_BUDGET, type RoomDeps } from "./service";

const T0 = new Date("2026-10-07T10:00:00Z");
const JPEG = () => new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])], { type: "image/jpeg" });
const META: PhotoMeta = { note: "Golden hour", width: 900, height: 600, exif: { shutter: "1/250s" }, themeId: "reflections" };

let db: Db;
let client: PGlite;
let blobs: ReturnType<typeof memoryBlobStore>;
let pending: Promise<unknown>[];

const people = {
  ana: { id: "ana", name: "Ana Sato", image: null },
  ken: { id: "ken", name: "Ken Ito", image: "https://example.com/ken.png" },
  mia: { id: "mia", name: "Mia Mori", image: null },
  zoe: { id: "zoe", name: "Zoe Ueda", image: null },
};
type Who = keyof typeof people;

function as(who: Who, now = T0, extra: Partial<RoomDeps> = {}): RoomDeps {
  return {
    db, blobs: () => blobs as BlobStore, user: people[who], now,
    later: (work) => { pending.push(work()); },
    ...extra,
  };
}
const settle = () => Promise.all(pending.splice(0));
const later = (ms: number) => new Date(T0.getTime() + ms);

beforeAll(async () => {
  ({ db, client } = await createTestDb());
  await db.insert(user).values(Object.values(people).map((p) => ({ ...p, email: `${p.id}@example.com` })));
});
afterAll(() => client.close());
beforeEach(async () => {
  await client.exec("delete from rooms; delete from blob_trash; delete from blob_usage;");
  blobs = memoryBlobStore();
  pending = [];
});

async function roomWith(...guests: Who[]) {
  const room = await rooms.createRoom(as("ana"), "Reflections");
  for (const guest of guests) await rooms.joinRoom(as(guest), room.code);
  return room;
}

describe("creating and joining", () => {
  it("makes a room with its host in it", async () => {
    const room = await rooms.createRoom(as("ana"), "  Reflections  ");
    expect(room.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(room).toMatchObject({ theme: "Reflections", hostId: "ana", members: ["ana"], photos: [], notes: [] });
    expect(room.expiresAt).toBe(T0.getTime() + ROOM_LIFETIME_MS);
    expect(room.people.ana).toEqual(people.ana);
  });

  it("tries another code when one is taken", async () => {
    const first = await rooms.createRoom(as("ana", T0, { random: (b) => b.fill(0) }), "");
    expect(first.code).toBe("AAAAAA");
    let calls = 0;
    const second = await rooms.createRoom(as("ana", T0, { random: (b) => b.fill(calls++ === 0 ? 0 : 1) }), "");
    expect(second.code).toBe("BBBBBB");
  });

  it("limits how many open rooms one person hosts", async () => {
    for (let i = 0; i < LIMITS.hostedRooms; i++) await rooms.createRoom(as("ana"), "");
    await expect(rooms.createRoom(as("ana"), "")).rejects.toMatchObject({ status: 409, code: "too_many_rooms" });
  });

  it("lets anyone signed in join with the code, typed any way, or the invite link", async () => {
    const room = await rooms.createRoom(as("ana"), "");
    const joined = await rooms.joinRoom(as("ken"), room.code.toLowerCase());
    expect(joined.members).toEqual(["ana", "ken"]);
    expect(joined.version).toBe(room.version + 1);
    const again = await rooms.joinRoom(as("ken"), `https://photoeye-wine.vercel.app/partners/?room=${room.code}`);
    expect(again.members).toEqual(["ana", "ken"]);
    expect(again.version).toBe(joined.version);
  });

  it("says when a code is malformed or unknown", async () => {
    await expect(rooms.joinRoom(as("ken"), "nope")).rejects.toMatchObject({ status: 400, code: "invalid_code" });
    await expect(rooms.joinRoom(as("ken"), "ZZZZZZ")).rejects.toMatchObject({ status: 404, code: "room_not_found" });
  });

  it("stops at the member limit", async () => {
    const room = await rooms.createRoom(as("ana"), "");
    const crowd = Array.from({ length: LIMITS.membersPerRoom - 1 }, (_, i) => `guest-${i}`);
    await db.insert(user).values(crowd.map((id) => ({ id, name: id, email: `${id}@example.com` }))).onConflictDoNothing();
    const [row] = await db.select().from(roomMembers);
    await db.insert(roomMembers).values(crowd.map((userId) => ({ roomId: row.roomId, userId })));
    await expect(rooms.joinRoom(as("ken"), room.code)).rejects.toMatchObject({ status: 409, code: "room_full" });
  });

  it("lists the rooms I'm in", async () => {
    const room = await roomWith("ken");
    const [mine] = await rooms.listMyRooms(as("ken"));
    expect(mine).toMatchObject({ code: room.code, isHost: false, memberCount: 2, photoCount: 0 });
    expect(await rooms.listMyRooms(as("mia"))).toEqual([]);
  });
});

describe("who may do what", () => {
  it("keeps outsiders out", async () => {
    const room = await roomWith("ken");
    await expect(rooms.roomState(as("mia"), room.code, null)).rejects.toMatchObject({ status: 403, code: "not_member" });
    await expect(rooms.addNote(as("mia"), room.code, "hi", [])).rejects.toMatchObject({ code: "not_member" });
  });

  it("lets only the host remove someone, who then can't come back", async () => {
    const room = await roomWith("ken", "mia");
    await expect(rooms.removeMember(as("ken"), room.code, "mia")).rejects.toMatchObject({ status: 403, code: "host_only" });
    const after = await rooms.removeMember(as("ana"), room.code, "mia");
    expect(after?.members).toEqual(["ana", "ken"]);
    await expect(rooms.roomState(as("mia"), room.code, null)).rejects.toMatchObject({ status: 403, code: "removed" });
    await expect(rooms.joinRoom(as("mia"), room.code)).rejects.toMatchObject({ status: 403, code: "removed" });
  });

  it("lets a member leave and come back, but the host closes instead of leaving", async () => {
    const room = await roomWith("ken");
    await expect(rooms.removeMember(as("ana"), room.code, "ana")).rejects.toMatchObject({ status: 409, code: "host_cannot_leave" });
    expect(await rooms.removeMember(as("ken"), room.code, "ken")).toBeNull();
    await expect(rooms.roomState(as("ken"), room.code, null)).rejects.toMatchObject({ code: "not_member" });
    expect((await rooms.joinRoom(as("ken"), room.code)).members).toEqual(["ana", "ken"]);
  });

  it("lets only the host close a room, which deletes it and its pictures", async () => {
    const room = await roomWith("ken");
    await rooms.addPhoto(as("ken"), room.code, JPEG(), META);
    await expect(rooms.closeRoom(as("ken"), room.code)).rejects.toMatchObject({ status: 403, code: "host_only" });
    await rooms.closeRoom(as("ana"), room.code);
    await settle();
    expect(blobs.files.size).toBe(0);
    expect(await db.select().from(blobTrash)).toEqual([]);
    await expect(rooms.joinRoom(as("ken"), room.code)).rejects.toMatchObject({ code: "room_not_found" });
  });

  it("lets the poster or the host take a photo down, nobody else", async () => {
    const room = await roomWith("ken", "mia");
    const { photo } = await rooms.addPhoto(as("ken"), room.code, JPEG(), META);
    await expect(rooms.deletePhoto(as("mia"), photo.id)).rejects.toMatchObject({ status: 403, code: "forbidden" });
    const after = await rooms.deletePhoto(as("ana"), photo.id);
    await settle();
    expect(after.photos).toEqual([]);
    expect(blobs.files.size).toBe(0);
    const { photo: own } = await rooms.addPhoto(as("ken"), room.code, JPEG(), META);
    expect((await rooms.deletePhoto(as("ken"), own.id)).photos).toEqual([]);
  });

  it("hands a photo's picture only to members", async () => {
    const room = await roomWith("ken");
    const { photo } = await rooms.addPhoto(as("ken"), room.code, JPEG(), META);
    const stored = await rooms.readPhoto(as("ana"), photo.id);
    expect(stored).toMatchObject({ contentType: "image/jpeg", size: 7 });
    await expect(rooms.readPhoto(as("mia"), photo.id)).rejects.toMatchObject({ code: "not_member" });
    await expect(rooms.readPhoto(as("ana"), "no-such-photo")).rejects.toMatchObject({ status: 404, code: "not_found" });
  });
});

describe("posting", () => {
  it("adds a photo with its details, author, and a fresh version", async () => {
    const room = await roomWith("ken");
    const { photo, room: after } = await rooms.addPhoto(as("ken", later(60_000)), room.code, JPEG(), META);
    expect(photo).toMatchObject({ userId: "ken", note: "Golden hour", width: 900, height: 600, exif: { shutter: "1/250s" }, themeId: "reflections", comments: [] });
    expect(after.people.ken).toEqual(people.ken);
    expect(after.lastActivityAt).toBe(later(60_000).getTime());
    expect([...blobs.files.keys()]).toEqual([expect.stringMatching(/^rooms\/[\w-]+\/[\w-]+\.jpg$/)]);
    const [usage] = await db.select().from(blobUsage);
    expect(usage).toEqual({ month: "2026-10", puts: 1 });
  });

  it("stops uploads short of the month's Blob allowance", async () => {
    const room = await roomWith();
    await db.insert(blobUsage).values({ month: "2026-10", puts: MONTHLY_UPLOAD_BUDGET });
    await expect(rooms.addPhoto(as("ana"), room.code, JPEG(), META)).rejects.toMatchObject({ status: 503, code: "upload_budget" });
    expect(blobs.files.size).toBe(0);
  });

  it("doesn't count an upload that failed", async () => {
    const room = await roomWith();
    blobs.put = async () => { throw new Error("Blob is down"); };
    await expect(rooms.addPhoto(as("ana"), room.code, JPEG(), META)).rejects.toThrow("Blob is down");
    expect(await db.select().from(blobUsage)).toEqual([]);
  });

  it("adds comments and notes with canonical tags, checking their length", async () => {
    const room = await roomWith("ken");
    const { photo } = await rooms.addPhoto(as("ken"), room.code, JPEG(), META);
    const commented = await rooms.addComment(as("ana"), photo.id, "  Nice rim light  ");
    expect(commented.photos[0].comments).toEqual([expect.objectContaining({ userId: "ana", text: "Nice rim light" })]);
    const noted = await rooms.addNote(as("ken"), room.code, "Try lower", ["#LowAngle", "#Backlit", "#LowAngle"]);
    expect(noted.notes).toEqual([expect.objectContaining({ userId: "ken", text: "Try lower", tags: ["#LowAngle", "#Backlit"] })]);
    await expect(rooms.addNote(as("ken"), room.code, "x", ["#ローアングル"])).rejects.toMatchObject({ status: 400, code: "invalid" });
    await expect(rooms.addNote(as("ken"), room.code, "   ", [])).rejects.toMatchObject({ code: "invalid" });
    await expect(rooms.addComment(as("ken"), photo.id, "x".repeat(LIMITS.commentText + 1))).rejects.toMatchObject({ code: "invalid" });
  });

  it("answers a poll with nothing new until something changes", async () => {
    const room = await roomWith("ken");
    const first = await rooms.roomState(as("ken"), room.code, null);
    if (!first.changed) throw new Error("expected the room");
    expect(await rooms.roomState(as("ken"), room.code, first.room.version)).toEqual({ changed: false, version: first.room.version });
    await rooms.addNote(as("ana"), room.code, "Meet at the bridge", []);
    expect((await rooms.roomState(as("ken"), room.code, first.room.version)).changed).toBe(true);
  });
});

describe("expiry", () => {
  it("treats a room as gone 30 days after its last post, and joining doesn't keep it alive", async () => {
    const room = await roomWith();
    await rooms.addNote(as("ana", later(DAYS(10))), room.code, "Day ten", []);
    await rooms.joinRoom(as("ken", later(DAYS(39))), room.code);
    const lastPost = later(DAYS(10));
    await expect(rooms.roomState(as("ana", new Date(lastPost.getTime() + ROOM_LIFETIME_MS + 1)), room.code, null))
      .rejects.toMatchObject({ code: "room_not_found" });
  });

  it("cleans up expired rooms and their pictures, and is safe to run again", async () => {
    const room = await roomWith("ken");
    await rooms.addPhoto(as("ken"), room.code, JPEG(), META);
    const keep = await rooms.createRoom(as("mia", later(DAYS(20))), "");
    const runAt = later(ROOM_LIFETIME_MS + 1);
    expect(await rooms.expireRooms(db, blobs, runAt)).toEqual({ expiredRooms: 1, deletedBlobs: 1 });
    expect(blobs.files.size).toBe(0);
    expect(await rooms.expireRooms(db, blobs, runAt)).toEqual({ expiredRooms: 0, deletedBlobs: 0 });
    expect((await rooms.roomState(as("mia", runAt), keep.code, null)).changed).toBe(true);
  });

  it("retries pictures Blob couldn't delete on the next run", async () => {
    const room = await roomWith();
    await rooms.addPhoto(as("ana"), room.code, JPEG(), META);
    const del = blobs.del;
    blobs.del = async () => { throw new Error("Blob is down"); };
    const runAt = later(ROOM_LIFETIME_MS + 1);
    expect(await rooms.expireRooms(db, blobs, runAt)).toEqual({ expiredRooms: 1, deletedBlobs: 0 });
    expect(await db.select().from(blobTrash)).toHaveLength(1);
    blobs.del = del;
    expect(await rooms.expireRooms(db, blobs, runAt)).toEqual({ expiredRooms: 0, deletedBlobs: 1 });
    expect(blobs.files.size).toBe(0);
  });
});

function DAYS(n: number) {
  return n * 24 * 60 * 60 * 1000;
}
