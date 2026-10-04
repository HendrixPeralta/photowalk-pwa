// @vitest-environment node
// Node's own Blob and structuredClone, because fake-indexeddb can't clone
// jsdom's Blob (it comes from another realm). Browsers have no such issue.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STORE_INBOX, DB_NAME } from "./schema";
import { allImageIds, deleteImage, getImage, imageUrl, openDb, putImage, takeSharedFiles } from "./index";

beforeEach(() => {
  let n = 0;
  URL.createObjectURL = vi.fn(() => `blob:test/${++n}`);
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => vi.restoreAllMocks());

describe("photo store", () => {
  it("stores, lists and deletes photos", async () => {
    await putImage("a", new Blob(["pixels"], { type: "image/jpeg" }));
    expect((await getImage("a"))?.size).toBe(6);
    expect(await allImageIds()).toContain("a");
    await deleteImage("a");
    expect(await getImage("a")).toBeUndefined();
  });

  it("hands out one object URL per photo, and doesn't remember a miss", async () => {
    expect(await imageUrl("late")).toBeNull();
    await putImage("late", new Blob(["x"]));
    const first = await imageUrl("late");
    expect(first).toMatch(/^blob:test\//);
    expect(await imageUrl("late")).toBe(first);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });

  it("empties the share inbox when the app takes the files", async () => {
    const db = await openDb();
    expect(db.name).toBe(DB_NAME);
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_INBOX, "readwrite");
      tx.objectStore(STORE_INBOX).add(new File(["1"], "one.jpg"));
      tx.objectStore(STORE_INBOX).add(new File(["2"], "two.jpg"));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    expect((await takeSharedFiles()).map((f) => f.name)).toEqual(["one.jpg", "two.jpg"]);
    expect(await takeSharedFiles()).toEqual([]);
  });
});
