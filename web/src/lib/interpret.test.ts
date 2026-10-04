import { describe, expect, it } from "vitest";
import { BUNDLED_PHOTOS, photoPixels } from "@/test/photos";
import { computeHistogram } from "./analysis/histogram";
import { computePalette } from "./analysis/palette";
import { configureI18n } from "./i18n/core";
import ja from "./i18n/ja";
import {
  chromaticitySummary, histogramSummary, paletteRelationship, paradeSummary, vectorscopeSummary, waveformSummary,
} from "./interpret";
import { computeScopes } from "./scopes/compute";

function readingsFor(name: string) {
  const px = photoPixels(name);
  const { stats } = computeScopes(px);
  return {
    histogram: histogramSummary(computeHistogram(px).bins),
    palette: paletteRelationship(computePalette(px)),
    waveform: waveformSummary(stats),
    parade: paradeSummary(stats),
    vector: vectorscopeSummary(stats),
    cie: chromaticitySummary(stats),
  };
}

describe("plain-language readings", () => {
  // Word for word what the old app said when ported; the snapshot keeps it so.
  it.each(BUNDLED_PHOTOS)("say the same about %s", (name) => {
    expect(readingsFor(name)).toMatchSnapshot();
  });

  it("are written in Japanese when Japanese is on", () => {
    const english = readingsFor("a_33.jpg");
    configureI18n("ja", ja);
    const japanese = readingsFor("a_33.jpg");
    for (const key of ["waveform", "parade", "vector", "cie"] as const) {
      const reading = japanese[key];
      expect(reading.caption).not.toBe(english[key].caption);
      // Japanese sentences run on without spaces between them.
      expect(reading.caption).not.toMatch(/。 /);
    }
  });

  it("names complementary and monochrome palettes", () => {
    expect(paletteRelationship([]).label).toBe("Monochrome");
    expect(paletteRelationship([{ r: 230, g: 120, b: 30, count: 50 }, { r: 30, g: 110, b: 220, count: 40 }]).label).toBe("Complementary");
    expect(paletteRelationship([{ r: 230, g: 60, b: 40 }, { r: 230, g: 130, b: 40 }]).label).toBe("Analogous");
  });
});
