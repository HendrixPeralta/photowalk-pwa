import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getData, update, useAppStore } from "@/state/appStore";
import { defaultState } from "@/state/defaults";
import { useToasts } from "@/state/ui";
import {
  analyzeStored, flipOverlay, loadDefaultPhoto, resetSession, rotateOverlay, saveToAlbum, setOverlayType, toneCurve, useAnalysis,
} from "./session";

// jsdom can't decode or draw images: stand in a 2x2 grey photo, and let each
// load's timing be controlled from the test.
const pending = new Map<string, () => void>();
let holdLoads = false;
vi.mock("@/lib/image", () => ({
  loadImage: (src: string) => new Promise((resolve) => {
    const image = { src, naturalWidth: 2, naturalHeight: 2 };
    if (holdLoads) pending.set(src, () => resolve(image));
    else resolve(image);
  }),
  readFileAsDataUrl: async () => "data:",
  drawToCanvas: () => ({
    width: 2,
    height: 2,
    getContext: () => ({ getImageData: () => ({ width: 2, height: 2, data: new Uint8ClampedArray(16).fill(128) }) }),
  }),
  canvasToBlob: async () => new Blob(["x"]),
}));
vi.mock("@/lib/db", () => ({
  imageUrl: async (id: string) => (id === "missing" ? null : `blob:${id}`),
  putImage: async () => {},
  storageEstimate: async () => null,
}));

const toasts = () => useToasts.getState().toasts.map((toast) => toast.message);
const shown = () => (useAnalysis.getState().frame?.image as unknown as { src: string } | undefined)?.src;

beforeEach(() => {
  holdLoads = false;
  pending.clear();
  localStorage.clear();
  useAppStore.setState(defaultState(), true);
  useToasts.setState({ toasts: [] });
  resetSession();
  vi.stubGlobal("fetch", async () => ({ ok: false }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("opening photos", () => {
  it("shows the newest photo asked for, even if an older one finishes loading later", async () => {
    holdLoads = true;
    const first = analyzeStored({ imageId: "a" });
    const second = analyzeStored({ imageId: "b" });
    await vi.waitFor(() => expect(pending.size).toBe(2));
    pending.get("blob:b")!();
    pending.get("blob:a")!();
    expect(await second).toBe(true);
    expect(await first).toBe(false);
    expect(shown()).toBe("blob:b");
  });

  it("never opens the sample over a photo the user asked for", async () => {
    await analyzeStored({ imageId: "mine" });
    expect(await loadDefaultPhoto()).toBe(false);
    expect(shown()).toBe("blob:mine");
  });

  it("puts a saved reference's guide and tags back, and says when a photo is gone", async () => {
    await analyzeStored({ imageId: "ref", albumItemId: "r1", overlay: { type: "golden-spiral", flip: true, rotation: 6 }, tags: ["sea", "dusk"] });
    expect(useAnalysis.getState()).toMatchObject({
      albumItemId: "r1",
      overlay: { type: "golden-spiral", flip: true, rotation: 2 },
      tags: "sea, dusk",
    });

    expect(await analyzeStored({ imageId: "missing" })).toBe(false);
    expect(toasts()).toEqual(["This photo is missing from storage."]);
  });

  it("starts each photo with a straight tone curve", async () => {
    await analyzeStored({ imageId: "a" });
    toneCurve.setMode("adjust");
    await analyzeStored({ imageId: "b" });
    expect(toneCurve.mode).toBe("measured");
    expect(toneCurve.isIdentity()).toBe(true);
  });
});

describe("guides", () => {
  it("flip, rotate a quarter-turn at a time, and keep the guide across photos", async () => {
    setOverlayType("golden-spiral");
    rotateOverlay();
    rotateOverlay();
    rotateOverlay();
    rotateOverlay();
    rotateOverlay();
    flipOverlay();
    expect(useAnalysis.getState().overlay).toEqual({ type: "golden-spiral", flip: true, rotation: 1 });
    await analyzeStored({ imageId: "a" });
    expect(useAnalysis.getState().overlay.type).toBe("golden-spiral");
  });
});

describe("saving", () => {
  it("saves a new reference with its tags and guide, and counts it as a photo", async () => {
    await analyzeStored({ imageId: "a" });
    useAnalysis.setState({ tags: " bridge, , sunset " });
    await saveToAlbum();
    const [item] = getData().album;
    expect(item).toMatchObject({ tags: ["bridge", "sunset"], overlay: { type: "thirds", flip: false, rotation: 0 }, brightnessLabel: "Balanced" });
    expect(Object.values(getData().frameLog)).toEqual([1]);
    expect(useAnalysis.getState().tags).toBe("");
    expect(toasts()).toEqual(["Saved to your Reference Album."]);
  });

  it("updates a reference opened from the album instead of adding a copy", async () => {
    await analyzeStored({ imageId: "a" });
    await saveToAlbum();
    const id = getData().album[0].id;

    await analyzeStored({ imageId: getData().album[0].imageId, albumItemId: id, tags: ["old"] });
    useAnalysis.setState({ tags: "new" });
    setOverlayType("golden");
    await saveToAlbum();
    expect(getData().album).toHaveLength(1);
    expect(getData().album[0]).toMatchObject({ tags: ["new"], overlay: { type: "golden" } });
    expect(toasts().at(-1)).toBe("Reference updated.");

    // Deleted while open: saving makes it a new reference again.
    update((d) => { d.album = []; });
    await saveToAlbum();
    expect(getData().album).toHaveLength(1);
    expect(useAnalysis.getState().albumItemId).toBeNull();
  });
});
