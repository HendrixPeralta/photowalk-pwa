// The four video-style scopes a colorist keeps open in DaVinci Resolve.
//
// The histogram already says *how much* of each tone the frame holds. These
// say *where* that tone sits in the frame (waveform, parade) and *what color*
// it is (vectorscope, CIE chromaticity): the readings you need to spot a cast
// or a blown sky, which a histogram alone hides.
//
// This half only measures. It is pure, so it runs in tests and on any thread;
// draw.ts turns the buffers into pictures.

import { clamp } from "../util";

/** Anything shaped like canvas ImageData: RGBA bytes, row by row. */
export interface PixelSource {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
}

export interface Rgb { r: number; g: number; b: number }

export interface ChannelStats {
  /** 0.5th percentile code value (the black point). */
  low: number;
  /** 99.5th percentile code value (the white point). */
  high: number;
  clipBlack: number;
  clipWhite: number;
  mean: number;
}

export interface ScopeStats {
  samples: number;
  luma: ChannelStats;
  channels: { r: ChannelStats; g: ChannelStats; b: ChannelStats };
  vector: {
    meanChroma: number;
    chromaticShare: number;
    skinShare: number;
    hueDeg: number | null;
    hueRgb: Rgb | null;
  };
  cie: { x: number; y: number; gamutShare: number };
}

export interface Scopes {
  /** Raw hit counts, TRACE_W by TRACE_H, top row = white. */
  wave: Uint32Array;
  parade: [Uint32Array, Uint32Array, Uint32Array];
  vector: Uint32Array;
  cie: Uint32Array;
  stats: ScopeStats;
}

// Trace buffers are accumulated at a fixed resolution and scaled to whatever
// the canvas ends up being, so a phone and a desktop read the same shape.
export const TRACE_W = 256; // horizontal position buckets
export const TRACE_H = 256; // one row per 8-bit code value
export const VEC_N = 256;
export const CIE_N = 256;

// Vectorscope scale: pure primaries top out near a chroma of 152 (magenta and
// yellow are the far ones), so an edge of 160 puts them just inside the outer
// ring, where a broadcast scope's bar targets sit.
export const VEC_MAX_CHROMA = 160;
// The classic vectorscope skin-tone axis. Skin of any complexion lands close
// to this angle; what differs between complexions is brightness, which a
// vectorscope deliberately throws away.
export const SKIN_LINE_DEG = 123;
const SKIN_TOLERANCE_DEG = 15;
const SKIN_AXIS_CB = Math.cos((SKIN_LINE_DEG * Math.PI) / 180);
const SKIN_AXIS_CR = Math.sin((SKIN_LINE_DEG * Math.PI) / 180);
const SKIN_AXIS_COS = Math.cos((SKIN_TOLERANCE_DEG * Math.PI) / 180);
const CHROMATIC_MIN = 10; // below this a pixel is too neutral to have a usable hue

export const CIE_X_MAX = 0.8;
export const CIE_Y_MAX = 0.9;
export const D65 = { x: 0.3127, y: 0.329 };
// sRGB / Rec.709 primaries: the triangle drawn over the CIE horseshoe.
export const SRGB_PRIMARIES: ReadonlyArray<readonly [number, number]> = [[0.64, 0.33], [0.3, 0.6], [0.15, 0.06]];

// sRGB transfer function, precomputed: the CIE plot needs linear light for
// every pixel and a 256-entry table beats 800k calls to Math.pow.
const LINEAR = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  LINEAR[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

// CIE 1931 2° spectral locus, 380-700nm. 10nm steps everywhere except the
// blue-green bend from 475 to 535, which is sampled at 5nm because straight
// segments across that curve visibly cut the corner off the horseshoe.
// Closing the ends gives the line of purples and a polygon to test against.
export const LOCUS: ReadonlyArray<readonly [number, number]> = [
  [0.1741, 0.005], [0.1738, 0.0049], [0.1733, 0.0048], [0.1726, 0.0048],
  [0.1714, 0.0051], [0.1689, 0.0069], [0.1644, 0.0109], [0.1566, 0.0177],
  [0.144, 0.0297], [0.1241, 0.0578], [0.1096, 0.0868], [0.0913, 0.1327],
  [0.0687, 0.2007], [0.0454, 0.295], [0.0235, 0.4127], [0.0082, 0.5384],
  [0.0039, 0.6548], [0.0139, 0.7502], [0.0389, 0.812], [0.0743, 0.8338],
  [0.1096, 0.8344], [0.1547, 0.8059], [0.1913, 0.7932], [0.2296, 0.7543],
  [0.3016, 0.6923], [0.3731, 0.6245], [0.4441, 0.5547],
  [0.5125, 0.4866], [0.5752, 0.4242], [0.627, 0.3725], [0.6658, 0.334],
  [0.6915, 0.3083], [0.7079, 0.292], [0.719, 0.2809], [0.726, 0.274],
  [0.73, 0.27], [0.732, 0.268], [0.7334, 0.2666], [0.7344, 0.2656],
  [0.7347, 0.2653],
];

/**
 * Single pass over the sampled pixels that fills every scope's trace buffer
 * and the statistics the plain-language readings are derived from. Takes the
 * same ImageData the histogram reads. Buffers are raw hit counts.
 */
export function computeScopes(imageData: PixelSource): Scopes {
  const { data, width, height } = imageData;

  const wave = new Uint32Array(TRACE_W * TRACE_H);
  const parade: [Uint32Array, Uint32Array, Uint32Array] = [
    new Uint32Array(TRACE_W * TRACE_H),
    new Uint32Array(TRACE_W * TRACE_H),
    new Uint32Array(TRACE_W * TRACE_H),
  ];
  const vector = new Uint32Array(VEC_N * VEC_N);
  const cie = new Uint32Array(CIE_N * CIE_N);

  const lumHist = new Uint32Array(256);
  const chanHist = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];

  // x to trace column, resolved once instead of per pixel.
  const columnOf = new Uint16Array(width);
  for (let x = 0; x < width; x++) columnOf[x] = Math.min(TRACE_W - 1, ((x * TRACE_W) / width) | 0);

  let samples = 0;
  let lumSum = 0;
  let chromaSum = 0;
  let hueX = 0, hueY = 0; // chroma-weighted vector sum, for a circular mean hue
  let chromaticCount = 0;
  let skinCount = 0;
  let sumX = 0, sumY = 0, sumZ = 0;

  for (let y = 0; y < height; y++) {
    const rowBase = y * width * 4;
    for (let x = 0; x < width; x++) {
      const i = rowBase + x * 4;
      if (data[i + 3] < 100) continue;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      samples++;

      const lumF = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const lum = Math.min(255, lumF | 0);
      lumSum += lumF;
      lumHist[lum]++;
      chanHist[0][r]++; chanHist[1][g]++; chanHist[2][b]++;

      const col = columnOf[x];
      wave[(255 - lum) * TRACE_W + col]++;
      parade[0][(255 - r) * TRACE_W + col]++;
      parade[1][(255 - g) * TRACE_W + col]++;
      parade[2][(255 - b) * TRACE_W + col]++;

      // Rec.709 color-difference pair: the same axes a broadcast vectorscope
      // plots, so the graticule targets land where a colorist expects them.
      const cb = (b - lumF) / 1.8556;
      const cr = (r - lumF) / 1.5748;
      const chroma = Math.sqrt(cb * cb + cr * cr);
      chromaSum += chroma;
      if (chroma >= CHROMATIC_MIN) {
        chromaticCount++;
        hueX += cb; hueY += cr;
        // Projection onto the skin axis: >= cos(tolerance) means the hue is
        // within the tolerance angle of the line, without an atan2 per pixel.
        if (cb * SKIN_AXIS_CB + cr * SKIN_AXIS_CR >= SKIN_AXIS_COS * chroma) skinCount++;
      }
      const vx = Math.round(((cb / VEC_MAX_CHROMA) * 0.5 + 0.5) * (VEC_N - 1));
      const vy = Math.round((0.5 - (cr / VEC_MAX_CHROMA) * 0.5) * (VEC_N - 1));
      if (vx >= 0 && vx < VEC_N && vy >= 0 && vy < VEC_N) vector[vy * VEC_N + vx]++;

      const lr = LINEAR[r], lg = LINEAR[g], lb = LINEAR[b];
      const cx = 0.4124 * lr + 0.3576 * lg + 0.1805 * lb;
      const cy = 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
      const cz = 0.0193 * lr + 0.1192 * lg + 0.9505 * lb;
      const sum = cx + cy + cz;
      if (sum > 1e-6) {
        sumX += cx; sumY += cy; sumZ += cz;
        const px = cx / sum, py = cy / sum;
        const gx = Math.round((px / CIE_X_MAX) * (CIE_N - 1));
        const gy = Math.round((1 - py / CIE_Y_MAX) * (CIE_N - 1));
        if (gx >= 0 && gx < CIE_N && gy >= 0 && gy < CIE_N) cie[gy * CIE_N + gx]++;
      }
    }
  }

  const total = samples || 1;
  const whiteSum = sumX + sumY + sumZ;
  const avgX = whiteSum > 0 ? sumX / whiteSum : D65.x;
  const avgY = whiteSum > 0 ? sumY / whiteSum : D65.y;

  return {
    wave,
    parade,
    vector,
    cie,
    stats: {
      samples,
      luma: { ...channelStats(lumHist, total), mean: lumSum / total },
      channels: {
        r: channelStats(chanHist[0], total),
        g: channelStats(chanHist[1], total),
        b: channelStats(chanHist[2], total),
      },
      vector: {
        meanChroma: chromaSum / total,
        chromaticShare: chromaticCount / total,
        skinShare: chromaticCount ? skinCount / chromaticCount : 0,
        hueDeg: hueAngle(hueX, hueY),
        hueRgb: chromaFromVector(hueX, hueY, chromaticCount),
      },
      cie: { x: avgX, y: avgY, gamutShare: gamutShare(cie) },
    },
  };
}

/** Black point, white point, clipping share and mean from a 256-bin histogram. */
function channelStats(hist: Uint32Array, total: number): ChannelStats {
  return {
    low: percentile(hist, total, 0.005),
    high: percentile(hist, total, 0.995),
    clipBlack: hist[0] / total,
    clipWhite: hist[255] / total,
    mean: meanOf(hist, total),
  };
}

function percentile(hist: Uint32Array, total: number, p: number): number {
  const target = total * p;
  let run = 0;
  for (let i = 0; i < 256; i++) {
    run += hist[i];
    if (run >= target) return i;
  }
  return 255;
}

function meanOf(hist: Uint32Array, total: number): number {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += hist[i] * i;
  return sum / total;
}

function hueAngle(x: number, y: number): number | null {
  if (!x && !y) return null;
  let deg = (Math.atan2(y, x) * 180) / Math.PI;
  if (deg < 0) deg += 360;
  return deg;
}

/**
 * Turns the mean chroma vector back into a viewable RGB at a fixed midtone
 * luma, so the caption can name the dominant hue with the same color namer
 * the palette uses.
 */
function chromaFromVector(hueX: number, hueY: number, count: number): Rgb | null {
  if (!count) return null;
  const cb = hueX / count;
  const cr = hueY / count;
  const scale = Math.max(1, 90 / (Math.sqrt(cb * cb + cr * cr) || 1)); // push to a nameable saturation
  return ycbcrToRgb(150, cb * scale, cr * scale);
}

export function ycbcrToRgb(y: number, cb: number, cr: number): Rgb {
  const r = y + 1.5748 * cr;
  const b = y + 1.8556 * cb;
  const g = (y - 0.2126 * r - 0.0722 * b) / 0.7152;
  return {
    r: clamp(Math.round(r), 0, 255),
    g: clamp(Math.round(g), 0, 255),
    b: clamp(Math.round(b), 0, 255),
  };
}

export function insideLocus(x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = LOCUS.length - 1; i < LOCUS.length; j = i++) {
    const [xi, yi] = LOCUS[i];
    const [xj, yj] = LOCUS[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

let srgbCellCount: number | null = null;

/**
 * Share of the sRGB triangle the image touches, by occupied grid cells. A
 * coarse but honest "how wide is this palette" number that the CIE plot makes
 * visually obvious.
 */
function gamutShare(cieBuf: Uint32Array): number {
  if (srgbCellCount == null) {
    let n = 0;
    for (let gy = 0; gy < CIE_N; gy++) {
      const y = (1 - gy / (CIE_N - 1)) * CIE_Y_MAX;
      for (let gx = 0; gx < CIE_N; gx++) {
        if (insideTriangle((gx / (CIE_N - 1)) * CIE_X_MAX, y, SRGB_PRIMARIES)) n++;
      }
    }
    srgbCellCount = Math.max(1, n);
  }
  let hit = 0;
  for (let i = 0; i < cieBuf.length; i++) if (cieBuf[i]) hit++;
  return Math.min(1, hit / srgbCellCount);
}

function insideTriangle(x: number, y: number, tri: ReadonlyArray<readonly [number, number]>): boolean {
  const sign = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) =>
    (ax - cx) * (by - cy) - (bx - cx) * (ay - cy);
  const d1 = sign(x, y, tri[0][0], tri[0][1], tri[1][0], tri[1][1]);
  const d2 = sign(x, y, tri[1][0], tri[1][1], tri[2][0], tri[2][1]);
  const d3 = sign(x, y, tri[2][0], tri[2][1], tri[0][0], tri[0][1]);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}
