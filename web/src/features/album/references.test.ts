import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { albumRecord } from "@/lib/analysis/album";
import { getData, update, useAppStore } from "@/state/appStore";
import { defaultState } from "@/state/defaults";
import { useToasts } from "@/state/ui";
import { clearStarterAlbum, deleteReference, maybeSeedStarterAlbum, STARTER_PHOTOS } from "./references";

const stored = new Set<string>();
vi.mock("@/lib/db", () => ({
  putImage: async (id: string) => { stored.add(id); },
  deleteImage: async (id: string) => { stored.delete(id); },
  revokeImageUrl: () => {},
}));
vi.mock("@/lib/image", () => ({
  loadImage: async () => ({ naturalWidth: 1600, naturalHeight: 1067 }),
}));
vi.mock("@/lib/exif", () => ({ readExif: async () => null }));
vi.mock("@/lib/analysis/album", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/analysis/album")>()),
  measureForAlbum: () => ({ avgLum: 120, palette: [{ r: 200, g: 40, b: 40 }] }),
}));

let fetches = 0;
const missing = new Set<string>();

beforeEach(() => {
  stored.clear();
  missing.clear();
  fetches = 0;
  localStorage.clear();
  useAppStore.setState(defaultState(), true);
  useToasts.setState({ toasts: [] });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubGlobal("fetch", async (url: string) => {
    fetches++;
    return missing.has(url) ? { ok: false, status: 404 } : { ok: true, blob: async () => new Blob(["x"]) };
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the starter album", () => {
  it("is added once, in order, even when asked for twice at the same time", async () => {
    const [a, b] = await Promise.all([maybeSeedStarterAlbum(), maybeSeedStarterAlbum()]);
    expect([a, b]).toEqual([STARTER_PHOTOS.length, STARTER_PHOTOS.length]);
    expect(getData().album.map((i) => i.seedName)).toEqual(STARTER_PHOTOS);
    expect(getData().seededAlbum?.count).toBe(STARTER_PHOTOS.length);
    expect(fetches).toBe(STARTER_PHOTOS.length);

    // Never again once it has run, even after the user deletes some.
    update((d) => { d.album = []; });
    expect(await maybeSeedStarterAlbum()).toBe(0);
    expect(getData().album).toEqual([]);
  });

  it("skips a photo that can't be read instead of failing the set", async () => {
    missing.add("/photos/a.jpg");
    expect(await maybeSeedStarterAlbum()).toBe(STARTER_PHOTOS.length - 1);
    expect(getData().album.map((i) => i.seedName)).not.toContain("a.jpg");
  });

  it("can be taken back out without touching the user's own references", async () => {
    const mine = albumRecord({ imageId: "mine", width: 1, height: 1, avgLum: 100 });
    update((d) => { d.album.push(mine); });
    stored.add("mine");
    await maybeSeedStarterAlbum();

    expect(await clearStarterAlbum()).toBe(STARTER_PHOTOS.length);
    expect(getData().album.map((i) => i.id)).toEqual([mine.id]);
    expect(getData().seededAlbum).toBeNull();
    expect([...stored]).toEqual(["mine"]);
  });
});

describe("deleting a reference", () => {
  it("removes it and its stored photo", async () => {
    await maybeSeedStarterAlbum();
    const [first] = getData().album;
    await deleteReference(first.id);
    expect(getData().album).toHaveLength(STARTER_PHOTOS.length - 1);
    expect(stored.has(first.imageId)).toBe(false);
    expect(useToasts.getState().toasts.map((x) => x.message)).toEqual(["Removed from Reference Album."]);
  });
});
