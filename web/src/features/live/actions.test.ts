import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { localDateKey } from "@/lib/util";
import { getData, update, useAppStore } from "@/state/appStore";
import { defaultState } from "@/state/defaults";
import { useFix } from "@/state/geo";
import { useToasts } from "@/state/ui";
import { logFrames, mapsUrl, removeFrame, setFrameLabel } from "./actions";

// No canvas or IndexedDB Blob support in jsdom: stand in for the image and
// storage layers, and keep a record of what was stored.
const stored = new Set<string>();
vi.mock("@/lib/db", () => ({
  putImage: async (id: string) => { stored.add(id); },
  deleteImage: async (id: string) => { stored.delete(id); },
  revokeImageUrl: () => {},
}));
vi.mock("@/lib/image", () => ({
  drawToCanvas: () => ({}),
  canvasToBlob: async () => new Blob(["x"], { type: "image/jpeg" }),
}));
vi.mock("@/lib/exif", () => ({
  readExif: async (file: File) => (file.name === "exif.jpg" ? { aperture: "f/2.8", shutter: "1/250s", iso: "ISO 400" } : null),
  exposureLine: (exif: { aperture: string } | null) => (exif ? exif.aperture : ""),
}));

const photo = (name: string) => new File(["x"], name, { type: "image/jpeg" });
const toasts = () => useToasts.getState().toasts.map((toast) => toast.message);
const frames = () => getData().activeWalk!.frames!;

beforeEach(() => {
  stored.clear();
  localStorage.clear();
  useAppStore.setState(defaultState(), true);
  useToasts.setState({ toasts: [] });
  useFix.setState({ fix: null });
  vi.stubGlobal("createImageBitmap", async (file: File) => {
    if (file.name === "broken.jpg") throw new Error("cannot decode");
    return { close: () => {} };
  });
  update((d) => {
    d.activeWalk = { mode: "casual", themeId: "t", startedAt: 1, durationMin: null, challengesChecked: [], nudges: [], pausedAt: null, frames: [] };
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("logging photos", () => {
  it("numbers photos in order, keeps their camera data and counts them for today", async () => {
    useFix.setState({ fix: { lat: 35, lon: 139, accuracy: 10, at: Date.now() } });
    await logFrames([photo("exif.jpg"), photo("plain.jpg")]);
    expect(frames().map((f) => f.index)).toEqual([1, 2]);
    expect(frames()[0]).toMatchObject({ exposure: "f/2.8", fix: { lat: 35 } });
    expect(frames()[1]).toMatchObject({ exposure: "", exif: null });
    expect(getData().frameLog[localDateKey()]).toBe(2);
    expect(stored.size).toBe(2);
    expect(toasts()).toEqual(["2 photos logged."]);
  });

  it("names the exposure when one photo is logged", async () => {
    await logFrames([photo("exif.jpg")]);
    expect(toasts()).toEqual(["Photo #1 logged · f/2.8."]);
    expect(frames()[0].fix).toBeNull();
  });

  it("logs what it can and says what it couldn't", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await logFrames([photo("plain.jpg"), photo("broken.jpg")]);
    expect(frames()).toHaveLength(1);
    expect(toasts()).toEqual(["1 of 2 photos logged. The rest couldn't be read."]);

    await logFrames([photo("broken.jpg")]);
    expect(toasts().at(-1)).toBe("Couldn't read those photos. Please try again.");
  });
});

describe("a logged photo", () => {
  it("takes a label, and removing it renumbers the rest and frees its storage", async () => {
    await logFrames([photo("a.jpg"), photo("b.jpg"), photo("c.jpg")]);
    const [first, second] = frames();
    setFrameLabel(second.id, "  Portal ");
    expect(frames()[1].label).toBe("Portal");

    removeFrame(first.id);
    expect(frames().map((f) => [f.index, f.label])).toEqual([[1, "Portal"], [2, ""]]);
    await vi.waitFor(() => expect(stored.has(first.imageId)).toBe(false));
    expect(stored.size).toBe(2);
  });
});

describe("maps hand-off", () => {
  it("opens the maps app the device has", () => {
    expect(mapsUrl(35.1, 139.2, "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)")).toBe("maps://?ll=35.1,139.2&q=You%20are%20here");
    expect(mapsUrl(35.1, 139.2, "Mozilla/5.0 (Linux; Android 14)")).toBe("geo:35.1,139.2?q=35.1,139.2");
    expect(mapsUrl(35.1, 139.2, "Mozilla/5.0 (Windows NT 10.0)")).toBe("https://www.openstreetmap.org/?mlat=35.1&mlon=139.2#map=17/35.1/139.2");
  });
});
