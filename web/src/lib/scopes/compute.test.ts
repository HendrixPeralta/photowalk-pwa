import { describe, expect, it } from "vitest";
import { legacy } from "@/test/legacy";
import { BUNDLED_PHOTOS, photoPixels } from "@/test/photos";
import { computeScopes } from "./compute";

function solid(r: number, g: number, b: number, size = 32) {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < data.length; i += 4) { data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255; }
  return { data, width: size, height: size };
}

describe("computeScopes", () => {
  it.each(BUNDLED_PHOTOS)("matches the old app on %s", async (name) => {
    const old = await legacy("scopes.js");
    const px = photoPixels(name);
    expect(computeScopes(px)).toEqual(old.computeScopes(px));
  });

  it("reads a neutral gray as colorless", () => {
    const { stats } = computeScopes(solid(128, 128, 128));
    expect(stats.vector.meanChroma).toBeCloseTo(0, 5);
    expect(stats.vector.hueRgb).toBeNull();
    expect(stats.luma.low).toBe(128);
  });

  it("finds the hue of a saturated red", () => {
    const { stats } = computeScopes(solid(220, 30, 30));
    expect(stats.vector.hueRgb!.r).toBeGreaterThan(stats.vector.hueRgb!.b);
    expect(stats.vector.chromaticShare).toBe(1);
  });

  it("ignores transparent pixels", () => {
    const px = solid(255, 255, 255);
    px.data.fill(0);
    expect(computeScopes(px).stats.samples).toBe(0);
  });
});
