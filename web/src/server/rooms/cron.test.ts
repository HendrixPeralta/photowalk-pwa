// @vitest-environment node

import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ROOM_LIFETIME_MS } from "@/lib/rooms/protocol";
import { memoryBlobStore } from "../blob";
import type { Db } from "../db";
import { user } from "../db/auth-schema";
import { createTestDb } from "../db/testDb";
import { withServer } from "../http";
import { handleExpireRooms } from "./cron";
import { addPhoto, createRoom } from "./service";

const T0 = new Date("2026-10-07T10:00:00Z");
let db: Db;
let client: PGlite;

beforeAll(async () => {
  ({ db, client } = await createTestDb());
  await db.insert(user).values({ id: "ana", name: "Ana", email: "ana@example.com" });
});
afterAll(() => client.close());

describe("the daily room clean-up", () => {
  const blobs = memoryBlobStore();
  const run = (authorization: string | null, now = T0) => withServer(() => handleExpireRooms(
    new Request("http://localhost/api/cron/expire-rooms/", authorization ? { headers: { authorization } } : {}),
    "s3cret", db, blobs, now,
  ));

  it("only runs for Vercel Cron", async () => {
    expect((await run(null)).status).toBe(401);
    expect((await run("Bearer wrong")).status).toBe(401);
    expect(await (await run("Bearer s3cret")).json()).toEqual({ expiredRooms: 0, deletedBlobs: 0 });
  });

  it("deletes rooms 30 days past their last post, with their pictures", async () => {
    const deps = { db, blobs: () => blobs, user: { id: "ana", name: "Ana", image: null }, now: T0, later: () => {} };
    const room = await createRoom(deps, "");
    await addPhoto(deps, room.code, new Blob([new Uint8Array([0xff, 0xd8, 0xff])]), { note: "", width: 10, height: 10, exif: null, themeId: null });
    expect(blobs.files.size).toBe(1);
    const res = await run("Bearer s3cret", new Date(T0.getTime() + ROOM_LIFETIME_MS + 1));
    expect(await res.json()).toEqual({ expiredRooms: 1, deletedBlobs: 1 });
    expect(blobs.files.size).toBe(0);
  });
});
