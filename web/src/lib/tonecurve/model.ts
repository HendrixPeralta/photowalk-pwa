// A tone curve in two modes, read as an instrument rather than an editor.
//
// MEASURED (default) plots the frame's own cumulative tone distribution: for
// each input level, the share of the picture at or below it. This is the only
// curve a single JPEG can honestly yield. The curve that was *applied* to make
// the file is unrecoverable: you hold the output and not the scene, and
// endless original-plus-curve pairs land on identical pixels. What survives is
// how the tones ended up spread, and that is what this draws. Its slope is the
// reading: steep means the frame spends its range there, flat means those
// tones go unused.
//
// ADJUST is the hypothetical. Drag a control point and the output histogram
// behind the curve moves with it, so a shadow lift that quietly crushes
// separation in the darks is something you *see* instead of something you're
// told.
//
// Nothing here writes a corrected image. The curve is a lens over the preview
// (an SVG feComponentTransfer, so dragging stays cheap) and it is thrown away
// with the frame: you leave with the understanding, not a new JPEG.
//
// The old app kept this state in module variables, one curve per page. Here
// it is an instance, owned by whatever holds the Analysis session.

import type { HistogramBin } from "../analysis/histogram";
import { t } from "../i18n/core";
import { joinSentences, type Reading } from "../interpret";
import { clamp } from "../util";

export type ToneCurveMode = "measured" | "adjust";
export interface CurvePoint { x: number; y: number }
/** Where the square plot box was last drawn, in CSS pixels, for hit-testing. */
export interface PlotBox { x: number; y: number; size: number }

// Touch slop. A finger on a 430px-wide phone can't hit a 4px dot, so the
// grab radius is deliberately far larger than the drawn point.
const GRAB_RADIUS = 24;
// Two points can't be dragged closer than this in x, or the segment between
// them goes vertical and the curve stops being a function.
const MIN_GAP = 0.02;

const identityPoints = (): CurvePoint[] => [{ x: 0, y: 0 }, { x: 1, y: 1 }];

export function identityLut(): Uint8ClampedArray {
  const out = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) out[i] = i;
  return out;
}

/**
 * Monotone cubic Hermite (Fritsch-Carlson). Plain Catmull-Rom overshoots
 * between close points, and an overshooting tone curve inverts tones (a
 * highlight coming out darker than the midtone below it), which reads as a
 * solarised artefact rather than a grade. Monotone can't do that.
 */
export function buildLut(pts: CurvePoint[]): Uint8ClampedArray {
  const n = pts.length;
  const out = new Uint8ClampedArray(256);
  if (n < 2) return identityLut();

  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const delta = new Array<number>(n - 1);
  for (let i = 0; i < n - 1; i++) {
    const dx = xs[i + 1] - xs[i];
    delta[i] = dx > 0 ? (ys[i + 1] - ys[i]) / dx : 0;
  }

  const m = new Array<number>(n);
  m[0] = delta[0];
  m[n - 1] = delta[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = (delta[i - 1] + delta[i]) / 2;

  for (let i = 0; i < n - 1; i++) {
    if (delta[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / delta[i];
    const b = m[i + 1] / delta[i];
    const s = a * a + b * b;
    if (s > 9) {
      const k = 3 / Math.sqrt(s);
      m[i] = k * a * delta[i];
      m[i + 1] = k * b * delta[i];
    }
  }

  let seg = 0;
  for (let i = 0; i < 256; i++) {
    const x = i / 255;
    while (seg < n - 2 && x > xs[seg + 1]) seg++;
    const h = xs[seg + 1] - xs[seg];
    if (h <= 0) { out[i] = Math.round(ys[seg] * 255); continue; }
    const u = clamp((x - xs[seg]) / h, 0, 1);
    const u2 = u * u;
    const u3 = u2 * u;
    const y = (2 * u3 - 3 * u2 + 1) * ys[seg]
      + (u3 - 2 * u2 + u) * h * m[seg]
      + (-2 * u3 + 3 * u2) * ys[seg + 1]
      + (u3 - u2) * h * m[seg + 1];
    out[i] = Math.round(clamp(y, 0, 1) * 255);
  }
  return out;
}

/**
 * The frame's cumulative tone distribution, upsampled from the 64-bin
 * histogram to a value per code level.
 *
 * Cumulative rather than the raw histogram because a curve has to be
 * monotonic to be read as a transfer function, and because the useful
 * quantity is the running share: the gradient at any point is how much of the
 * picture lives at that tone. It is also exactly what histogram equalisation
 * would apply, so the plot doubles as "here is what flattening this frame's
 * tonality would look like".
 */
export function buildCdf(bins: HistogramBin[]): Float32Array {
  const n = bins.length;
  const total = bins.reduce((sum, b) => sum + b.lum, 0) || 1;
  // Cumulative share at each bin's upper edge, plus a leading zero so the
  // interpolation below has a value at level 0.
  const edges = new Float32Array(n + 1);
  let running = 0;
  for (let i = 0; i < n; i++) {
    running += bins[i].lum;
    edges[i + 1] = running / total;
  }

  const out = new Float32Array(256);
  const perBin = 256 / n;
  for (let i = 0; i < 256; i++) {
    const pos = i / perBin;
    const lo = Math.min(n, Math.floor(pos));
    const frac = pos - lo;
    out[i] = edges[lo] + (edges[Math.min(n, lo + 1)] - edges[lo]) * frac;
  }
  return out;
}

export class ToneCurveModel {
  mode: ToneCurveMode = "measured";
  points: CurvePoint[] = identityPoints();
  selected = -1;
  /** 64-bin luma histogram of the loaded frame. */
  histBins: HistogramBin[] | null = null;
  /** Share of the frame at or below each level. */
  cdf: Float32Array | null = null;
  lut: Uint8ClampedArray = identityLut();
  /** Set by drawToneCurve; pointer input is resolved against it. */
  plot: PlotBox | null = null;
  private dragging = false;

  /** Called after anything that changes what the curve shows or applies. */
  constructor(public onChange: (() => void) | null = null) {}

  private changed(): void {
    this.onChange?.();
  }

  /**
   * Also true throughout measured mode: that curve is a reading of the frame,
   * not an adjustment to it, so it must never reach the preview.
   */
  isIdentity(): boolean {
    if (this.mode === "measured") return true;
    for (let i = 0; i < 256; i++) if (Math.abs(this.lut[i] - i) > 1) return false;
    return true;
  }

  /**
   * SVG feComponentTransfer wants a tableValues list, not 256 entries. 33 stops
   * is past the point where the interpolation between them is visible, and it
   * keeps the attribute short enough to rewrite on every pointermove.
   */
  tableValues(stops = 33): string {
    const vals = new Array<string>(stops);
    for (let i = 0; i < stops; i++) {
      const src = Math.round((i / (stops - 1)) * 255);
      vals[i] = (this.lut[src] / 255).toFixed(4);
    }
    return vals.join(" ");
  }

  reset(): void {
    this.points = identityPoints();
    this.selected = -1;
    this.lut = buildLut(this.points);
    this.changed();
  }

  setHistogram(bins: HistogramBin[] | null): void {
    this.histBins = bins || null;
    this.cdf = bins ? buildCdf(bins) : null;
  }

  setMode(next: ToneCurveMode): void {
    if (next !== "measured" && next !== "adjust") return;
    this.mode = next;
    this.changed();
  }

  /** Drops the curve and the frame's histogram when the workspace is cleared. */
  clear(): void {
    this.histBins = null;
    this.cdf = null;
    this.mode = "measured";
    this.points = identityPoints();
    this.selected = -1;
    this.lut = buildLut(this.points);
  }

  /* ---------- Interaction (pointer positions in CSS px relative to the canvas) ---------- */

  /** Grabs the point under the pointer, or adds one there. Returns false if input is ignored. */
  pointerDown(px: number, py: number): boolean {
    if (!this.plot || this.mode !== "adjust") return false;
    const { x, y } = this.toCurveSpace(px, py);
    const hit = this.nearestPoint(px, py);
    if (hit >= 0) {
      this.selected = hit;
    } else {
      this.points.push({ x, y });
      this.points.sort((a, b) => a.x - b.x);
      this.selected = this.points.findIndex((p) => p.x === x && p.y === y);
    }
    this.dragging = true;
    this.applyDrag(x, y);
    return true;
  }

  pointerMove(px: number, py: number): boolean {
    if (!this.dragging || !this.plot || this.mode !== "adjust") return false;
    const { x, y } = this.toCurveSpace(px, py);
    this.applyDrag(x, y);
    return true;
  }

  pointerEnd(): void {
    this.dragging = false;
  }

  /**
   * Double-tap a point to drop it. The two endpoints stay: without them the
   * curve has no defined black and white, and the LUT loses its anchors.
   */
  removeAt(px: number, py: number): boolean {
    if (this.mode !== "adjust") return false;
    const hit = this.nearestPoint(px, py);
    if (hit <= 0 || hit >= this.points.length - 1) return false;
    this.points.splice(hit, 1);
    this.selected = -1;
    this.lut = buildLut(this.points);
    this.changed();
    return true;
  }

  private applyDrag(x: number, y: number): void {
    const p = this.points[this.selected];
    if (!p) return;
    const isFirst = this.selected === 0;
    const isLast = this.selected === this.points.length - 1;
    // The endpoints are the black and white point: they slide vertically only,
    // so the curve always spans the full input range.
    if (!isFirst && !isLast) {
      const lo = this.points[this.selected - 1].x + MIN_GAP;
      const hi = this.points[this.selected + 1].x - MIN_GAP;
      p.x = clamp(x, lo, hi);
    }
    p.y = clamp(y, 0, 1);
    this.lut = buildLut(this.points);
    this.changed();
  }

  private toCurveSpace(px: number, py: number): CurvePoint {
    const plot = this.plot!;
    return {
      x: clamp((px - plot.x) / plot.size, 0, 1),
      y: clamp(1 - (py - plot.y) / plot.size, 0, 1),
    };
  }

  private nearestPoint(px: number, py: number): number {
    const plot = this.plot;
    if (!plot) return -1;
    let best = -1;
    let bestDist = GRAB_RADIUS;
    this.points.forEach((p, i) => {
      const cx = plot.x + p.x * plot.size;
      const cy = plot.y + (1 - p.y) * plot.size;
      const d = Math.hypot(px - cx, py - cy);
      if (d < bestDist) { bestDist = d; best = i; }
    });
    return best;
  }

  /* ---------- Reading ---------- */

  /** Lowest code level at or below which `share` of the frame sits. */
  levelAtShare(share: number): number | null {
    if (!this.cdf) return null;
    for (let i = 0; i < 256; i++) if (this.cdf[i] >= share) return i;
    return 255;
  }

  /**
   * Names the shape rather than scoring it. "Contrast is up, and you have paid
   * for it in the shadows" is a sentence you can act on; a number out of ten is
   * the AI-grading this app deliberately doesn't do.
   */
  summary(): Reading {
    if (this.mode === "measured") return this.measuredSummary();
    const lut = this.lut;

    if (this.isIdentity()) {
      return {
        label: t("No change"),
        caption: t("No changes yet. Drag the line to see how an edit would change the photo."),
      };
    }

    const shadow = lut[64] - 64;
    const mid = lut[128] - 128;
    const high = lut[191] - 191;
    const slope = (lut[191] - lut[64]) / 127;

    let label: string;
    if (slope > 1.12 && shadow < 0 && high > 0) label = t("S-curve");
    else if (slope < 0.9) label = t("Less contrast");
    else if (mid > 6) label = t("Brighter");
    else if (mid < -6) label = t("Darker");
    else if (shadow > 6) label = t("Shadow lift");
    else if (high < -6) label = t("Highlight pull");
    else label = t("Custom");

    const change = Math.round(Math.abs(slope - 1) * 100);
    const parts = [slope >= 1
      ? t("Midtone contrast up {n}%.", { n: change })
      : t("Midtone contrast down {n}%.", { n: change })];
    if (lut[0] > 4) parts.push(t("Blacks are lifted, so the photo will look faded."));
    if (lut[255] < 251) parts.push(t("Whites are pulled down, so nothing is pure white anymore."));
    if (shadow < -12) parts.push(t("Shadows pushed darker. Watch for dark areas merging together."));
    if (high > 12) parts.push(t("Highlights pushed brighter. The brightest areas are close to pure white."));

    return { label, caption: joinSentences(parts) };
  }

  /**
   * Reads the measured curve back as a sentence. Steepness is the whole story:
   * the tonal band the curve climbs through fastest is where the frame has
   * spent its range, and the bands it crosses flat are the ones it never used.
   */
  private measuredSummary(): Reading {
    const cdf = this.cdf;
    if (!cdf) {
      return { label: t("No photo"), caption: t("Load a photo to see how its light and dark tones are spread.") };
    }

    const p5 = this.levelAtShare(0.05)!;
    const p50 = this.levelAtShare(0.5)!;
    const p95 = this.levelAtShare(0.95)!;
    const pct = (v: number) => Math.round((v / 255) * 100);

    // Share of the frame inside each band, straight off the cumulative curve.
    const inShadows = cdf[63];
    const inHighs = 1 - cdf[191];
    const inMids = Math.max(0, 1 - inShadows - inHighs);

    let label: string;
    if (inShadows > 0.5) label = t("Mostly dark");
    else if (inHighs > 0.5) label = t("Mostly bright");
    else if (inMids > 0.7) label = t("Mostly midtones");
    else if (inShadows > 0.28 && inHighs > 0.28) label = t("Mostly darks and brights");
    else label = t("Evenly spread");

    const parts = [
      t("The middle tone is at {mid}%, and 90% of the photo falls between {low}% and {high}%.", { mid: pct(p50), low: pct(p5), high: pct(p95) }),
    ];

    const steepest = this.steepestBand();
    if (steepest) parts.push(t("The curve climbs fastest through the {band}, so that's where the photo shows the most detail.", { band: bandWord(steepest) }));

    // A curve that leaves the floor already high, or hits the ceiling early,
    // has pixels stacked at an extreme with nothing beyond them.
    if (cdf[4] > 0.02) parts.push(t("{pct}% is pure black.", { pct: Math.round(cdf[4] * 100) }));
    if (1 - cdf[251] > 0.02) parts.push(t("{pct}% is pure white.", { pct: Math.round((1 - cdf[251]) * 100) }));
    if (p95 - p5 < 100) parts.push(t("The whole photo sits in a narrow slice of tones, so it's low contrast."));

    return { label, caption: joinSentences(parts) };
  }

  /** Which of the three tonal bands the cumulative curve rises through fastest. */
  steepestBand(): Band | null {
    const cdf = this.cdf;
    if (!cdf) return null;
    // Per-level rise, so the comparison is fair across bands of unequal width.
    const bands: { name: Band; rate: number }[] = [
      { name: "shadows", rate: cdf[63] / 64 },
      { name: "midtones", rate: (cdf[191] - cdf[63]) / 128 },
      { name: "highlights", rate: (1 - cdf[191]) / 64 },
    ];
    const top = bands.reduce((a, b) => (b.rate > a.rate ? b : a));
    return top.rate > 0 ? top.name : null;
  }
}

type Band = "shadows" | "midtones" | "highlights";

function bandWord(band: Band): string {
  switch (band) {
    case "shadows": return t("shadows");
    case "midtones": return t("midtones");
    case "highlights": return t("highlights");
  }
}
