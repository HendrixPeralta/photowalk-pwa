// @vitest-environment node

import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { memoryBlobStore } from "../blob";
import type { Db } from "../db";
import { user } from "../db/auth-schema";
import { createTestDb } from "../db/testDb";
import { HttpError, withServer } from "../http";
import { handleRoomsRequest, photoUpload, sanitizeExif } from "./handlers";
import type { RoomDeps } from "./service";

const BASE = "http://localhost:3000";
let db: Db;
let client: PGlite;
const blobs = memoryBlobStore();

function call(who: string, path: string, init: RequestInit = {}) {
  const req = new Request(BASE + path, init);
  const deps = async (): Promise<RoomDeps> => ({
    db, blobs: () => blobs, user: { id: who, name: who, image: null }, now: new Date(), later: () => {},
  });
  return withServer(() => handleRoomsRequest(req, deps));
}
const json = (body: unknown, method = "POST"): RequestInit => ({ method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

function uploadRequest(picture: BlobPart, meta: unknown, headers: Record<string, string> = {}) {
  const form = new FormData();
  form.append("photo", new Blob([picture], { type: "image/jpeg" }), "shot.jpg");
  form.append("meta", typeof meta === "string" ? meta : JSON.stringify(meta));
  return new Request(`${BASE}/api/rooms/photos/?code=ABC234`, { method: "POST", body: form, headers });
}
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9, 9]);

beforeAll(async () => {
  ({ db, client } = await createTestDb());
  await db.insert(user).values([{ id: "ana", name: "Ana", email: "ana@example.com" }, { id: "ken", name: "Ken", email: "ken@example.com" }]);
});
afterAll(() => client.close());

describe("rooms API", () => {
  it("runs a room from creation to a posted photo and back", async () => {
    const created = await call("ana", "/api/rooms/", json({ theme: "Reflections" }));
    expect(created.status).toBe(201);
    const { room } = await created.json();
    expect((await call("ken", "/api/rooms/join/", json({ code: room.code }))).status).toBe(200);

    const form = new FormData();
    form.append("photo", new Blob([JPEG], { type: "image/jpeg" }));
    form.append("meta", JSON.stringify({ note: "", width: 900, height: 600, exif: null, themeId: null }));
    const posted = await call("ken", `/api/rooms/photos/?code=${room.code}`, { method: "POST", body: form });
    expect(posted.status).toBe(201);
    const { photo } = await posted.json();

    const picture = await call("ana", `/api/rooms/photos/?id=${photo.id}`);
    expect(picture.headers.get("content-type")).toBe("image/jpeg");
    expect(picture.headers.get("cache-control")).toBe("private, max-age=31536000, immutable");
    expect(new Uint8Array(await picture.arrayBuffer())).toEqual(JPEG);

    const poll = await (await call("ana", `/api/rooms/state/?code=${room.code}&since=0`)).json();
    expect(poll.changed).toBe(true);
    expect(await (await call("ana", `/api/rooms/state/?code=${room.code}&since=${poll.room.version}`)).json())
      .toEqual({ changed: false, version: poll.room.version });

    expect((await call("ken", `/api/rooms/members/?code=${room.code}&user=ken`, { method: "DELETE" })).status).toBe(204);
    expect((await call("ana", `/api/rooms/?code=${room.code}`, { method: "DELETE" })).status).toBe(204);
  });

  it("answers errors as codes the app understands", async () => {
    expect(await (await call("ana", "/api/rooms/join/", json({ code: "ZZZZZZ" }))).json()).toEqual({ error: "room_not_found" });
    expect((await call("ana", "/api/rooms/join/", { method: "POST", body: "not json" })).status).toBe(400);
    expect((await call("ana", "/api/rooms/nowhere/")).status).toBe(404);
    expect((await call("ana", "/api/rooms/state/?code=ABC234&since=x")).status).toBe(400);
  });

  it("refuses changes sent from another site", async () => {
    const res = await call("ana", "/api/rooms/", { ...json({}), headers: { "sec-fetch-site": "cross-site", "content-type": "application/json" } });
    expect(res.status).toBe(403);
  });
});

describe("photo uploads", () => {
  const meta = { note: "Low sun", width: 900, height: 675, exif: { shutter: "1/250s", lat: 26.2, lon: 127.7 }, themeId: "light" };

  it("accept a JPEG with its details, leaving out where it was taken", async () => {
    const { picture, meta: read } = await photoUpload(uploadRequest(JPEG, meta));
    expect(picture.size).toBe(JPEG.length);
    expect(read).toEqual({ note: "Low sun", width: 900, height: 675, exif: { shutter: "1/250s" }, themeId: "light" });
  });

  it("refuse what isn't a JPEG, is too big, or has impossible details", async () => {
    const refused = async (req: Request) => {
      try {
        await photoUpload(req);
      } catch (err) {
        return err instanceof HttpError ? `${err.status} ${err.code}` : String(err);
      }
      return "accepted";
    };
    expect(await refused(uploadRequest(new Uint8Array([0x89, 0x50, 0x4e]), meta))).toBe("400 invalid");
    expect(await refused(uploadRequest(new Uint8Array(1_600_000).fill(0xff), meta))).toBe("413 photo_too_large");
    expect(await refused(uploadRequest(JPEG, meta, { "content-length": "3000000" }))).toBe("413 photo_too_large");
    expect(await refused(uploadRequest(JPEG, { ...meta, width: 5000 }))).toBe("400 invalid");
    expect(await refused(uploadRequest(JPEG, "{broken"))).toBe("400 invalid");
  });

  it("keep only the camera details a room shows", () => {
    expect(sanitizeExif({ make: "Fujifilm", fNumber: 2.8, focalMm: Infinity, lat: 1, evil: "<script>", model: "x".repeat(41) }))
      .toEqual({ make: "Fujifilm", fNumber: 2.8 });
    expect(sanitizeExif({ lat: 1, lon: 2 })).toBeNull();
    expect(sanitizeExif("nope")).toBeNull();
  });
});
