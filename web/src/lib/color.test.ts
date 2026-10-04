import { describe, expect, it } from "vitest";
import { legacy } from "@/test/legacy";
import { deltaE, nearestColorName, rgbToHex, rgbToHsl, rgbToLab } from "./color";

describe("color math", () => {
  it("hex", () => {
    expect(rgbToHex(255, 128.4, -3)).toBe("#ff8000");
  });

  it("Lab of white and black", () => {
    const white = rgbToLab(255, 255, 255);
    expect(white.l).toBeCloseTo(100, 1);
    expect(Math.abs(white.a)).toBeLessThan(0.5);
    expect(rgbToLab(0, 0, 0).l).toBeCloseTo(0, 5);
  });

  it("deltaE is zero for identical colors and grows with difference", () => {
    const a = rgbToLab(200, 50, 50);
    expect(deltaE(a, a)).toBe(0);
    expect(deltaE(a, rgbToLab(50, 50, 200))).toBeGreaterThan(50);
  });

  it("matches the old app on a grid of colors", async () => {
    const old = await legacy("util.js");
    for (let r = 0; r <= 255; r += 51) {
      for (let g = 0; g <= 255; g += 51) {
        for (let b = 0; b <= 255; b += 51) {
          expect(nearestColorName(r, g, b)).toBe(old.nearestColorName(r, g, b));
          expect(rgbToHsl(r, g, b)).toEqual(old.rgbToHsl(r, g, b));
          expect(rgbToLab(r, g, b)).toEqual(old.rgbToLab(r, g, b));
        }
      }
    }
  });
});
