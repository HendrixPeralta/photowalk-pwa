import { describe, expect, it } from "vitest";
import { legacy } from "@/test/legacy";
import { BUNDLED_PHOTOS, photoPixels } from "@/test/photos";
import { computeHistogram } from "./analysis/histogram";
import { computePalette } from "./analysis/palette";
import { configureI18n } from "./i18n/core";
import ja from "./i18n/ja";
import {
  chromaticitySummary, histogramSummary, paletteRelationship, paradeSummary, vectorscopeSummary, waveformSummary,
} from "./interpret";
import { computeScopes } from "./scopes/compute";

function readingsFor(name: string, mod: Record<string, (...a: never[]) => unknown>) {
  const px = photoPixels(name);
  const { stats } = computeScopes(px);
  return {
    histogram: mod.histogramSummary(computeHistogram(px).bins as never),
    palette: mod.paletteRelationship(computePalette(px) as never),
    waveform: mod.waveformSummary(stats as never),
    parade: mod.paradeSummary(stats as never),
    vector: mod.vectorscopeSummary(stats as never),
    cie: mod.chromaticitySummary(stats as never),
  };
}

const fresh = { histogramSummary, paletteRelationship, waveformSummary, paradeSummary, vectorscopeSummary, chromaticitySummary };

describe("plain-language readings", () => {
  it.each(BUNDLED_PHOTOS)("say exactly what the old app said about %s", async (name) => {
    const old = await legacy("interpret.js");
    expect(readingsFor(name, fresh as never)).toEqual(readingsFor(name, old));
  });

  it("are written in Japanese when Japanese is on", () => {
    const english = readingsFor("a_33.jpg", fresh as never);
    configureI18n("ja", ja);
    const japanese = readingsFor("a_33.jpg", fresh as never) as typeof english;
    for (const key of ["waveform", "parade", "vector", "cie"] as const) {
      const reading = japanese[key] as { label: string; caption: string };
      expect(reading.caption).not.toBe((english[key] as { caption: string }).caption);
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
