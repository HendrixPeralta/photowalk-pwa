import { describe, expect, it } from "vitest";
import { albumRecord } from "@/lib/analysis/album";
import { configureI18n } from "@/lib/i18n/core";
import ja from "@/lib/i18n/ja";
import { matchesFilters, NO_FILTERS } from "./filters";

const item = albumRecord({
  imageId: "img",
  width: 1600,
  height: 1000,
  avgLum: 200,
  palette: [{ r: 30, g: 60, b: 200 }],
  exif: { make: "FUJIFILM", model: "X-T1", focalMm: 23, focalLength: "23mm", fNumber: 2, aperture: "f/2" },
  tags: ["bridge", "Sunset"],
});

describe("album filters", () => {
  it("matches on every derived label", () => {
    expect(item).toMatchObject({ aspectLabel: "Landscape", brightnessLabel: "Bright", colorName: "Blue", focalLabel: "Wide", apertureLabel: "Fast", hasLocation: false });
    expect(matchesFilters(item, NO_FILTERS)).toBe(true);
    expect(matchesFilters(item, { ...NO_FILTERS, brightness: "Bright", aspect: "Landscape", color: "Blue", focal: "Wide", aperture: "Fast", location: "no" })).toBe(true);
    expect(matchesFilters(item, { ...NO_FILTERS, brightness: "Dark" })).toBe(false);
    expect(matchesFilters(item, { ...NO_FILTERS, location: "yes" })).toBe(false);
  });

  it("searches tags, camera and settings, ignoring case", () => {
    expect(matchesFilters(item, { ...NO_FILTERS, search: "sunset" })).toBe(true);
    expect(matchesFilters(item, { ...NO_FILTERS, search: " x-t1 " })).toBe(true);
    expect(matchesFilters(item, { ...NO_FILTERS, search: "f/2" })).toBe(true);
    expect(matchesFilters(item, { ...NO_FILTERS, search: "portrait" })).toBe(false);
  });

  it("finds a label by the word the chip shows in Japanese", () => {
    configureI18n("ja", ja);
    expect(matchesFilters(item, { ...NO_FILTERS, search: "横長" })).toBe(true);
    expect(matchesFilters(item, { ...NO_FILTERS, search: "landscape" })).toBe(true);
  });
});
