// @vitest-environment node

import { afterEach, describe, expect, it } from "vitest";
import { getBlobStore, memoryBlobStore } from "./blob";
import { NotConfigured } from "./env";

describe("blob store", () => {
  afterEach(() => {
    delete process.env.BLOB_STORE_ID;
    delete process.env.BLOB_READ_WRITE_TOKEN;
  });

  it("isn't available until a store is connected", () => {
    expect(() => getBlobStore()).toThrow(NotConfigured);
  });

  it("in memory: stores, reads back, refuses overwrites, deletes", async () => {
    const blobs = memoryBlobStore();
    await blobs.put("rooms/r/p.jpg", new Blob([new Uint8Array([0xff, 0xd8, 0xff])]), "image/jpeg");
    await expect(blobs.put("rooms/r/p.jpg", new Blob(["x"]), "image/jpeg")).rejects.toThrow();
    const found = await blobs.get("rooms/r/p.jpg");
    expect(found).toMatchObject({ contentType: "image/jpeg", size: 3 });
    expect(new Uint8Array(await new Response(found!.stream).arrayBuffer())).toEqual(new Uint8Array([0xff, 0xd8, 0xff]));
    await blobs.del(["rooms/r/p.jpg"]);
    expect(await blobs.get("rooms/r/p.jpg")).toBeNull();
  });
});
