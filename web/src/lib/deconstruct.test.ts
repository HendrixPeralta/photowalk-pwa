import { describe, expect, it } from "vitest";
import { legacy } from "@/test/legacy";
import { BUNDLED_PHOTOS, photoBlob, photoPixels } from "@/test/photos";
import { computeHistogram } from "./analysis/histogram";
import { computePalette } from "./analysis/palette";
import { clipShares, gamutClusters, takeawayText, tonalKey, tonalKeyNote } from "./deconstruct";
import { readExif } from "./exif";
import { histogramSummary } from "./interpret";

describe("deconstruct", () => {
  it.each(BUNDLED_PHOTOS)("writes the same notes as the old app for %s", async (name) => {
    const old = await legacy("deconstruct.js");
    const px = photoPixels(name);
    const { bins } = computeHistogram(px);
    const summary = histogramSummary(bins);
    const palette = computePalette(px);
    const exif = await readExif(photoBlob(name));

    expect(tonalKey(summary)).toEqual(old.tonalKey(summary));
    expect(clipShares(bins)).toEqual(old.clipShares(bins));
    expect(gamutClusters(palette)).toEqual(old.gamutClusters(palette));
    expect(takeawayText(palette, summary, exif)).toBe(old.takeawayText(palette, summary, exif));
  });

  it("gamut shares always add up to the whole", () => {
    const shares = gamutClusters(computePalette(photoPixels("a_49.jpg"))).map((c) => c.share);
    expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });

  it("the tonal key note includes the clipping line", () => {
    const { bins } = computeHistogram(photoPixels("a.jpg"));
    const note = tonalKeyNote(bins, histogramSummary(bins));
    expect(note.title).toMatch(/^Tonal key: /);
    expect(note.text).toMatch(/Pure black: [\d.]+% · pure white: [\d.]+%\./);
  });
});
