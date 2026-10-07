import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { allImageIds, clearImages, putImage } from "@/lib/db";
import { roomsApi } from "@/lib/roomsApi";
import { ensureRoomImage, keepPostedImage, pruneRoomImages, roomImageId } from "./roomImages";

beforeEach(async () => {
  await clearImages();
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() }));
});
afterEach(() => vi.restoreAllMocks());

describe("room pictures", () => {
  it("are downloaded once, however many places ask at the same time", async () => {
    const photo = vi.spyOn(roomsApi, "photo").mockResolvedValue({ ok: true, data: new Blob(["jpeg"]) });
    const urls = await Promise.all([ensureRoomImage("p1"), ensureRoomImage("p1"), ensureRoomImage("p1")]);
    expect(urls).toEqual(["blob:x", "blob:x", "blob:x"]);
    expect(photo).toHaveBeenCalledTimes(1);
    await ensureRoomImage("p1");
    expect(photo).toHaveBeenCalledTimes(1);
  });

  it("aren't downloaded when this device posted them", async () => {
    const photo = vi.spyOn(roomsApi, "photo");
    await keepPostedImage("mine", new Blob(["jpeg"]));
    expect(await ensureRoomImage("mine")).toBe("blob:x");
    expect(photo).not.toHaveBeenCalled();
  });

  it("are null when they can't be had", async () => {
    vi.spyOn(roomsApi, "photo").mockResolvedValue({ ok: false, error: "offline" });
    expect(await ensureRoomImage("p2")).toBeNull();
  });

  it("are deleted once gone from the room, leaving album photos alone", async () => {
    await putImage("album-photo", new Blob(["a"]));
    await putImage(roomImageId("keep"), new Blob(["b"]));
    await putImage(roomImageId("gone"), new Blob(["c"]));
    await pruneRoomImages(new Set(["keep"]));
    expect((await allImageIds()).sort()).toEqual(["album-photo", "room:keep"]);
  });
});
