import { clamp } from "./util";

export interface Hsl { h: number; s: number; l: number }
export interface Lab { l: number; a: number; b: number }

export function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0")).join("");
}

export function rgbToHsl(r: number, g: number, b: number): Hsl {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  const d = max - min;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r: h = 60 * (((g - b) / d) % 6); break;
      case g: h = 60 * ((b - r) / d + 2); break;
      case b: h = 60 * ((r - g) / d + 4); break;
    }
  }
  if (h < 0) h += 360;
  return { h, s, l };
}

/** sRGB to CIE L*a*b* (D65 white point), for perceptually meaningful color distance. */
export function rgbToLab(r: number, g: number, b: number): Lab {
  const toLinear = (v: number) => {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const rl = toLinear(r), gl = toLinear(g), bl = toLinear(b);
  const x = (rl * 0.4124 + gl * 0.3576 + bl * 0.1805) / 0.95047;
  const y = (rl * 0.2126 + gl * 0.7152 + bl * 0.0722) / 1;
  const z = (rl * 0.0193 + gl * 0.1192 + bl * 0.9505) / 1.08883;
  const f = (v: number) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116);
  const fx = f(x), fy = f(y), fz = f(z);
  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

/** Euclidean distance between two Lab colors (CIE76 deltaE): how different two colors actually look. */
export function deltaE(lab1: Lab, lab2: Lab): number {
  return Math.sqrt((lab1.l - lab2.l) ** 2 + (lab1.a - lab2.a) ** 2 + (lab1.b - lab2.b) ** 2);
}

export type ColorName =
  | "Black" | "White" | "Neutral"
  | "Red" | "Orange" | "Yellow" | "Green" | "Teal" | "Blue" | "Purple" | "Pink";

const HUE_NAMES: ReadonlyArray<[number, ColorName]> = [
  [15, "Red"], [45, "Orange"], [70, "Yellow"], [170, "Green"],
  [200, "Teal"], [255, "Blue"], [290, "Purple"], [330, "Pink"], [360, "Red"],
];

/** Stored in English on purpose (the album filters by it); translated only for display. */
export function nearestColorName(r: number, g: number, b: number): ColorName {
  const { h, s, l } = rgbToHsl(r, g, b);
  if (l < 0.12) return "Black";
  if (l > 0.92 && s < 0.15) return "White";
  if (s < 0.14) return "Neutral";
  for (const [max, name] of HUE_NAMES) {
    if (h <= max) return name;
  }
  return "Neutral";
}
