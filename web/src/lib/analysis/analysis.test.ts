import { describe, expect, it } from "vitest";
import { digest } from "@/test/digest";
import { deltaE, rgbToLab } from "../color";
import { BUNDLED_PHOTOS, photoBlob, photoPixels } from "@/test/photos";
import { readExif } from "../exif";
import { albumRecord, exifRows } from "./album";
import { goldenSpiralGeometry, guidePaths, perpFoot } from "./guides";
import { computeHistogram } from "./histogram";
import { computePalette } from "./palette";

describe("histogram and palette", () => {
  // As the old app measured them when ported; the snapshot keeps them so.
  it.each(BUNDLED_PHOTOS)("are unchanged on %s", (name) => {
    const px = photoPixels(name);
    expect(digest(computeHistogram(px))).toMatchSnapshot();
    expect(computePalette(px)).toMatchSnapshot();
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
  it("spiral geometry is unchanged, and perpendiculars meet the diagonal at right angles", () => {
    expect(digest(goldenSpiralGeometry())).toMatchSnapshot();
    const [fx, fy] = perpFoot([300, 0], [0, 0], [300, 200]);
    // The segment from the corner to its foot is perpendicular to the diagonal.
    expect((fx - 300) * 300 + (fy - 0) * 200).toBeCloseTo(0, 9);
    expect(fy / fx).toBeCloseTo(200 / 300, 9);
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
  // The same item as the old app built when ported; the snapshot keeps it so.
  it("builds the same item (apart from the random id)", async () => {
    const exif = await readExif(photoBlob("a_1.jpg"));
    const input = {
      imageId: "img-1", width: 1600, height: 1067, avgLum: 140,
      palette: computePalette(photoPixels("a_1.jpg")), exif, tags: ["street"],
      overlay: { type: "thirds" as const, flip: false, rotation: 0 }, themeId: "light", savedAt: 1700000000000,
    };
    const { id, ...item } = albumRecord(input);
    expect(item).toMatchSnapshot();
    expect(id).not.toBe(albumRecord(input).id);
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
