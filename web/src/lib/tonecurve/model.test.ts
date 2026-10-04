import { describe, expect, it } from "vitest";
import { legacy, legacyFunction } from "@/test/legacy";
import { BUNDLED_PHOTOS, photoPixels } from "@/test/photos";
import { computeHistogram } from "../analysis/histogram";
import { clamp } from "../util";
import { buildLut, identityLut, ToneCurveModel, type CurvePoint } from "./model";

const oldBuildLut = () => legacyFunction("tonecurve.js", "buildLut", { clamp, identityLut });

function randomCurve(seed: number): CurvePoint[] {
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const xs = Array.from({ length: 1 + Math.floor(rand() * 4) }, () => 0.05 + rand() * 0.9).sort((a, b) => a - b);
  return [{ x: 0, y: rand() * 0.2 }, ...xs.map((x) => ({ x, y: rand() })), { x: 1, y: 0.8 + rand() * 0.2 }];
}

describe("tone curve math", () => {
  it("builds the same lookup table as the old app for random curves", () => {
    const old = oldBuildLut();
    for (let seed = 1; seed < 60; seed++) {
      const pts = randomCurve(seed);
      expect(buildLut(pts)).toEqual(old(pts));
    }
  });

  it("never inverts tones (monotone for increasing points)", () => {
    for (let seed = 1; seed < 60; seed++) {
      const pts = randomCurve(seed).map((p, i, all) => ({ x: p.x, y: i === 0 ? 0 : Math.max(all[i - 1].y, p.y) }));
      const lut = buildLut(pts);
      for (let i = 1; i < 256; i++) expect(lut[i]).toBeGreaterThanOrEqual(lut[i - 1]);
    }
  });

  it("an identity curve maps every level to itself", () => {
    expect(buildLut([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toEqual(identityLut());
  });
});

describe("ToneCurveModel", () => {
  it("measured mode reads like the old app on every bundled photo", async () => {
    const old = await legacy("tonecurve.js");
    for (const name of BUNDLED_PHOTOS) {
      const { bins } = computeHistogram(photoPixels(name));
      const model = new ToneCurveModel();
      model.setHistogram(bins);
      old.setToneCurveHistogram(bins);
      old.setToneCurveMode("measured");
      expect(model.summary()).toEqual(old.toneCurveSummary());
      expect(model.isIdentity()).toBe(true);
    }
  });

  it("an S-curve drag in adjust mode is named and changes the preview table", () => {
    const changes: number[] = [];
    const model = new ToneCurveModel(() => changes.push(1));
    model.setHistogram(computeHistogram(photoPixels("a_33.jpg")).bins);
    model.setMode("adjust");
    model.plot = { x: 0, y: 0, size: 100 };

    expect(model.isIdentity()).toBe(true);
    expect(model.summary().label).toBe("No change");
    const flat = model.tableValues();

    model.pointerDown(25, 82); model.pointerEnd(); // pull the shadows down
    model.pointerDown(75, 18); model.pointerEnd(); // push the highlights up
    expect(model.points).toHaveLength(4);
    expect(model.summary().label).toBe("S-curve");
    expect(model.tableValues()).not.toBe(flat);
    expect(model.tableValues().split(" ")).toHaveLength(33);
    expect(changes.length).toBeGreaterThan(0);

    model.removeAt(25, 82);
    expect(model.points).toHaveLength(3);
    model.reset();
    expect(model.isIdentity()).toBe(true);
  });

  it("ignores input in measured mode and keeps the endpoints", () => {
    const model = new ToneCurveModel();
    model.plot = { x: 0, y: 0, size: 100 };
    expect(model.pointerDown(50, 50)).toBe(false);
    model.setMode("adjust");
    expect(model.removeAt(0, 100)).toBe(false); // the black point can't be removed
  });
});
