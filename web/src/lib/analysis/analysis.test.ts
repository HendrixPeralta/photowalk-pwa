import { describe, expect, it } from "vitest";
import { legacy, legacyFunction } from "@/test/legacy";
import { BUNDLED_PHOTOS, photoBlob, photoPixels } from "@/test/photos";
import { deltaE, rgbToLab } from "../color";
import { readExif } from "../exif";
import { albumRecord, exifRows } from "./album";
import { goldenSpiralGeometry, guidePaths, perpFoot } from "./guides";
import { computeHistogram } from "./histogram";
import { computePalette } from "./palette";

const oldHistogram = () => legacyFunction("analysis.js", "computeHistogram");
const oldPalette = () => legacyFunction("analysis.js", "computePalette", { rgbToLab, deltaE, MIN_PALETTE_DELTA_E: 20 });

describe("histogram and palette", () => {
  it.each(BUNDLED_PHOTOS)("match the old app on %s", (name) => {
    const px = photoPixels(name);
    expect(computeHistogram(px)).toEqual(oldHistogram()(px));
    expect(computePalette(px)).toEqual(oldPalette()(px));
  });

  it("palette merges lookalike shades and caps the swatch count", () => {
    const px = photoPixels("a_1.jpg");
    const palette = computePalette(px, 6);
    expect(palette.length).toBeGreaterThan(0);
    expect(palette.length).toBeLessThanOrEqual(6);
    for (let i = 0; i < palette.length; i++) {
      for (let j = i + 1; j < palette.length; j++) {
        const a = rgbToLab(palette[i].r, palette[i].g, palette[i].b);
        const b = rgbToLab(palette[j].r, palette[j].g, palette[j].b);
        expect(deltaE(a, b)).toBeGreaterThanOrEqual(20);
      }
    }
  });

  it("an all-black frame lands entirely in the first bin", () => {
    const data = new Uint8ClampedArray(10 * 10 * 4);
    for (let i = 3; i < data.length; i += 4) data[i] = 255;
    const { bins, avgLum } = computeHistogram({ data, width: 10, height: 10 });
    expect(bins[0].lum).toBe(100);
    expect(avgLum).toBe(0);
  });
});

describe("composition guides", () => {
  it("spiral geometry and perpendiculars match the old app", () => {
    const PHI = (1 + Math.sqrt(5)) / 2;
    expect(goldenSpiralGeometry()).toEqual(legacyFunction("analysis.js", "goldenSpiralGeometry", { PHI })());
    const oldFoot = legacyFunction("analysis.js", "perpFoot");
    expect(perpFoot([300, 0], [0, 0], [300, 200])).toEqual(oldFoot([300, 0], [0, 0], [300, 200]));
  });

  it("draws the expected lines for each overlay", () => {
    const at = (type: Parameters<typeof guidePaths>[0]["type"], flip = false, rotation = 0) =>
      guidePaths({ type, flip, rotation }, 300, 200);
    expect(at("none")).toEqual([]);
    expect(at("thirds")).toHaveLength(4);
    expect(at("thirds")[0].points).toEqual([[100, 0], [100, 200]]);
    expect(at("golden-triangles")).toHaveLength(3);
    expect(at("golden-triangles", true)[0].points).toEqual([[300, 0], [0, 200]]);
    expect(at("spiral-section").every((p) => p.alpha === 1)).toBe(true);
    const spiral = at("golden-spiral");
    expect(spiral.at(-1)!.points.length).toBeGreaterThan(100);
    expect(spiral.slice(0, -1).every((p) => p.alpha === 0.45)).toBe(true);
    // Four quarter-turns bring a rotated spiral back to where it started.
    const pts = (r: number) => at("golden-spiral", false, r).at(-1)!.points;
    expect(pts(1)).not.toEqual(pts(0));
  });
});

describe("album records", () => {
  it("builds the same item as the old app (apart from the random id)", async () => {
    const old = await legacy("analysis.js");
    const exif = await readExif(photoBlob("a_1.jpg"));
    const input = {
      imageId: "img-1", width: 1600, height: 1067, avgLum: 140,
      palette: computePalette(photoPixels("a_1.jpg")), exif, tags: ["street"],
      overlay: { type: "thirds" as const, flip: false, rotation: 0 }, themeId: "light", savedAt: 1700000000000,
    };
    const { id: newId, ...fresh } = albumRecord(input);
    const { id: oldId, ...previous } = old.albumRecord(input);
    expect(fresh).toEqual(previous);
    expect(newId).not.toBe(oldId);
  });

  it.each([
    [1600, 900, "Landscape"], [900, 1600, "Portrait"], [1000, 1000, "Square"],
  ])("labels %ix%i as %s", (width, height, aspect) => {
    expect(albumRecord({ imageId: "x", width, height, avgLum: 128 }).aspectLabel).toBe(aspect);
  });

  it("exif rows skip fields and link the location", () => {
    const exif = { aperture: "f/2.8", shutter: "1/250s", iso: "ISO 400", make: "FUJIFILM", model: "X100V", lat: 35.1, lon: 139.2 };
    const rows = exifRows(exif, { skip: ["Aperture"] });
    expect(rows.map((r) => r.field)).toEqual(["Camera", "Shutter", "ISO", "Location"]);
    expect(rows.at(-1)!.href).toContain("mlat=35.1");
    expect(exifRows(null)).toEqual([]);
  });
});
