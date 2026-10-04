// Draws the scope buffers from compute.ts onto canvases. Browser-only: call
// from effects, never during render. Every function sizes its canvas to the
// CSS box at device resolution, so call again after a resize.

import { clamp } from "../util";
import {
  CIE_N, CIE_X_MAX, CIE_Y_MAX, D65, SKIN_LINE_DEG, SRGB_PRIMARIES, TRACE_H, TRACE_W,
  VEC_MAX_CHROMA, VEC_N, insideLocus, ycbcrToRgb,
  type ChannelStats, type Scopes,
} from "./compute";

type Ctx = CanvasRenderingContext2D;
type Tint = readonly [number, number, number] | ((x: number, y: number) => readonly [number, number, number]);

const SCOPE_BG = "#0b0d10"; // scopes stay dark in both themes; a trace needs it
const GRID = "rgba(255,255,255,0.13)";
const GRID_STRONG = "rgba(255,255,255,0.26)";
const LABEL = "rgba(255,255,255,0.55)";

/* ---------- Shared drawing helpers ---------- */

let scratch: HTMLCanvasElement | null = null;

function blit(ctx: Ctx, img: ImageData, x: number, y: number, w: number, h: number): void {
  if (!scratch) scratch = document.createElement("canvas");
  if (scratch.width !== img.width || scratch.height !== img.height) {
    scratch.width = img.width;
    scratch.height = img.height;
  }
  scratch.getContext("2d")!.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(scratch, x, y, w, h);
}

/**
 * Maps hit counts to pixel alpha. Real scopes are analog: a faint trace still
 * has to be visible next to a dense one, so the reference is a fraction of the
 * peak and the response is a gentle power curve rather than linear.
 */
function traceImage(buf: Uint32Array, bw: number, bh: number, tint: Tint): ImageData {
  let max = 0;
  for (let i = 0; i < buf.length; i++) if (buf[i] > max) max = buf[i];
  const ref = Math.max(1, max * 0.09);
  const img = new ImageData(bw, bh);
  const px = img.data;

  for (let i = 0; i < buf.length; i++) {
    const count = buf[i];
    if (!count) continue;
    const level = Math.min(1, Math.pow(count / ref, 0.55));
    const color = typeof tint === "function" ? tint(i % bw, (i / bw) | 0) : tint;
    const o = i * 4;
    px[o] = color[0];
    px[o + 1] = color[1];
    px[o + 2] = color[2];
    px[o + 3] = Math.round(level * 255);
  }
  return img;
}

/** Sizes a canvas to its CSS box at device resolution and paints the backdrop. */
function prepare(canvas: HTMLCanvasElement): { ctx: Ctx; w: number; h: number } {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 320;
  const h = canvas.clientHeight || 200;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = SCOPE_BG;
  ctx.fillRect(0, 0, w, h);
  ctx.font = "600 9px system-ui, sans-serif";
  ctx.textBaseline = "middle";
  return { ctx, w, h };
}

/**
 * Horizontal 0-100% graticule shared by the waveform and every parade panel.
 * Percent, not code values: the sample is 8-bit canvas data, so quoting a
 * 10-bit 0-1023 scale like Resolve's would be inventing precision.
 */
function drawLevelGrid(ctx: Ctx, x: number, y: number, w: number, h: number, { labels = false } = {}): void {
  ctx.save();
  ctx.textAlign = "right";
  for (let pct = 0; pct <= 100; pct += 25) {
    const gy = y + h - (pct / 100) * h;
    ctx.strokeStyle = pct === 0 || pct === 100 ? GRID_STRONG : GRID;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, gy + 0.5);
    ctx.lineTo(x + w, gy + 0.5);
    ctx.stroke();
    if (labels) {
      ctx.fillStyle = LABEL;
      ctx.fillText(String(pct), x - 4, clamp(gy, y + 5, y + h - 5));
    }
  }
  ctx.restore();
}

/** Orange bars on the rails a real scope would show you are riding into. */
function markClipping(ctx: Ctx, x: number, y: number, w: number, h: number, stats: ChannelStats): void {
  ctx.fillStyle = "rgba(255,170,60,0.9)";
  if (stats.clipWhite > 0.01) ctx.fillRect(x, y, w, 2);
  if (stats.clipBlack > 0.01) ctx.fillRect(x, y + h - 2, w, 2);
}

/* ---------- Waveform ---------- */

/**
 * Luma against horizontal position: the trace sits directly under the part of
 * the frame it came from, which is what makes it readable as "that sky is
 * blown" rather than just "something is blown".
 */
export function drawWaveform(canvas: HTMLCanvasElement, scopes: Scopes | null): void {
  const { ctx, w, h } = prepare(canvas);
  if (!scopes) return;

  const gutter = 22;
  const pad = 6;
  const plotX = gutter;
  const plotY = pad;
  const plotW = Math.max(10, w - gutter - pad);
  const plotH = Math.max(10, h - pad * 2);

  drawLevelGrid(ctx, plotX, plotY, plotW, plotH, { labels: true });
  blit(ctx, traceImage(scopes.wave, TRACE_W, TRACE_H, [235, 245, 255]), plotX, plotY, plotW, plotH);
  drawLevelGrid(ctx, plotX, plotY, plotW, plotH);
  markClipping(ctx, plotX, plotY, plotW, plotH, scopes.stats.luma);
}

/* ---------- RGB Parade ---------- */

/**
 * The waveform split into R, G and B panels. Lining up the three panel floors
 * neutralizes the shadows and lining up their ceilings neutralizes the
 * highlights: the classic way to kill a color cast by eye.
 */
export function drawParade(canvas: HTMLCanvasElement, scopes: Scopes | null): void {
  const { ctx, w, h } = prepare(canvas);
  if (!scopes) return;

  const gutter = 22;
  const pad = 6;
  const gap = 6;
  const plotY = pad;
  const plotH = Math.max(10, h - pad * 2);
  const totalW = Math.max(12, w - gutter - pad);
  const panelW = (totalW - gap * 2) / 3;

  const tints = [[255, 96, 96], [92, 226, 132], [110, 160, 255]] as const;
  const keys = ["r", "g", "b"] as const;

  for (let i = 0; i < 3; i++) {
    const px = gutter + i * (panelW + gap);
    drawLevelGrid(ctx, px, plotY, panelW, plotH, { labels: i === 0 });
    blit(ctx, traceImage(scopes.parade[i], TRACE_W, TRACE_H, tints[i]), px, plotY, panelW, plotH);
    drawLevelGrid(ctx, px, plotY, panelW, plotH);
    markClipping(ctx, px, plotY, panelW, plotH, scopes.stats.channels[keys[i]]);
  }
}

/* ---------- Vectorscope ---------- */

/**
 * Hue as angle, saturation as distance from center, brightness discarded.
 * Two frames that look nothing alike in exposure land on the same spot here if
 * they share a palette, which is exactly why it is the tool for matching color.
 */
export function drawVectorscope(canvas: HTMLCanvasElement, scopes: Scopes | null): void {
  const { ctx, w, h } = prepare(canvas);
  if (!scopes) return;

  const size = Math.max(40, Math.min(w, h) - 12);
  const x0 = (w - size) / 2;
  const y0 = (h - size) / 2;
  const cx = x0 + size / 2;
  const cy = y0 + size / 2;
  const radius = size / 2;
  const perChroma = radius / VEC_MAX_CHROMA;

  // Tint each cell by the color that position represents, so the trace names
  // its own hues instead of relying on the graticule labels.
  const tintFor = (bx: number, by: number) => {
    const cb = ((bx / (VEC_N - 1)) * 2 - 1) * VEC_MAX_CHROMA;
    const cr = (1 - (by / (VEC_N - 1)) * 2) * VEC_MAX_CHROMA;
    const c = ycbcrToRgb(150, cb, cr);
    return [c.r, c.g, c.b] as const;
  };

  drawVectorGraticule(ctx, cx, cy, radius);

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();
  blit(ctx, traceImage(scopes.vector, VEC_N, VEC_N, tintFor), x0, y0, size, size);
  ctx.restore();

  drawVectorTargets(ctx, cx, cy, perChroma);
}

function drawVectorGraticule(ctx: Ctx, cx: number, cy: number, radius: number): void {
  ctx.strokeStyle = GRID;
  ctx.lineWidth = 1;
  [0.5, 1].forEach((f) => {
    ctx.beginPath();
    ctx.arc(cx, cy, radius * f, 0, Math.PI * 2);
    ctx.stroke();
  });
  ctx.beginPath();
  ctx.moveTo(cx - radius, cy); ctx.lineTo(cx + radius, cy);
  ctx.moveTo(cx, cy - radius); ctx.lineTo(cx, cy + radius);
  ctx.stroke();

  // Skin-tone line: hue is the same for every complexion, so a face reading
  // off-axis means a cast, not a skin color.
  const a = (SKIN_LINE_DEG * Math.PI) / 180;
  ctx.strokeStyle = "rgba(255,190,150,0.55)";
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(a) * radius, cy - Math.sin(a) * radius);
  ctx.stroke();
  ctx.setLineDash([]);
}

// The six bar targets, derived from the fully saturated primaries and
// secondaries rather than hardcoded, so they always match the plotted axes.
const VECTOR_TARGETS = [
  { label: "R", rgb: [255, 0, 0] },
  { label: "YL", rgb: [255, 255, 0] },
  { label: "G", rgb: [0, 255, 0] },
  { label: "CY", rgb: [0, 255, 255] },
  { label: "B", rgb: [0, 0, 255] },
  { label: "MG", rgb: [255, 0, 255] },
] as const;

function drawVectorTargets(ctx: Ctx, cx: number, cy: number, perChroma: number): void {
  ctx.save();
  ctx.textAlign = "center";
  ctx.fillStyle = LABEL;
  for (const target of VECTOR_TARGETS) {
    const [r, g, b] = target.rgb;
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const px = cx + ((b - lum) / 1.8556) * perChroma;
    const py = cy - ((r - lum) / 1.5748) * perChroma;
    ctx.strokeStyle = GRID_STRONG;
    ctx.lineWidth = 1;
    ctx.strokeRect(px - 4, py - 4, 8, 8);
    ctx.fillText(target.label, px, py - 10);
  }
  ctx.restore();
}

/* ---------- CIE chromaticity ---------- */

/**
 * Every color a person can see, laid out as a horseshoe, with the sRGB
 * triangle over it. Shows how much of the visible gamut a frame actually
 * uses and how far its average color drifts from neutral daylight.
 */
export function drawChromaticity(canvas: HTMLCanvasElement, scopes: Scopes | null): void {
  const { ctx, w, h } = prepare(canvas);
  if (!scopes) return;

  const size = Math.max(40, Math.min(w, h) - 12);
  const x0 = (w - size) / 2;
  const y0 = (h - size) / 2;
  const toX = (x: number) => x0 + (x / CIE_X_MAX) * size;
  const toY = (y: number) => y0 + (1 - y / CIE_Y_MAX) * size;

  blit(ctx, cieBackdrop(), x0, y0, size, size);
  blit(ctx, traceImage(scopes.cie, CIE_N, CIE_N, [255, 255, 255]), x0, y0, size, size);

  ctx.strokeStyle = "rgba(255,255,255,0.45)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  SRGB_PRIMARIES.forEach(([x, y], i) => {
    const px = toX(x), py = toY(y);
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  });
  ctx.closePath();
  ctx.stroke();

  const wx = toX(D65.x), wy = toY(D65.y);
  ctx.strokeStyle = "rgba(255,255,255,0.8)";
  ctx.beginPath();
  ctx.moveTo(wx - 4, wy); ctx.lineTo(wx + 4, wy);
  ctx.moveTo(wx, wy - 4); ctx.lineTo(wx, wy + 4);
  ctx.stroke();

  ctx.fillStyle = LABEL;
  ctx.textAlign = "left";
  ctx.fillText("sRGB / Rec.709", x0 + 4, y0 + 8);
  ctx.fillText("D65", wx + 6, wy + 8);
}

let cieCache: ImageData | null = null;

/** The colored horseshoe. Fixed geometry, so it is built once and reused. */
function cieBackdrop(): ImageData {
  if (cieCache) return cieCache;
  const img = new ImageData(CIE_N, CIE_N);
  const px = img.data;

  for (let gy = 0; gy < CIE_N; gy++) {
    const y = (1 - gy / (CIE_N - 1)) * CIE_Y_MAX;
    for (let gx = 0; gx < CIE_N; gx++) {
      const x = (gx / (CIE_N - 1)) * CIE_X_MAX;
      if (y <= 0.0001 || !insideLocus(x, y)) continue;
      const color = chromaticityColor(x, y);
      const o = (gy * CIE_N + gx) * 4;
      px[o] = color[0];
      px[o + 1] = color[1];
      px[o + 2] = color[2];
      px[o + 3] = 90; // dim: the plotted samples have to stay legible on top
    }
  }
  cieCache = img;
  return img;
}

/** xyY at unit luminance to displayable sRGB, normalized so hue survives. */
function chromaticityColor(x: number, y: number): [number, number, number] {
  const X = x / y;
  const Y = 1;
  const Z = (1 - x - y) / y;
  let r = 3.2406 * X - 1.5372 * Y - 0.4986 * Z;
  let g = -0.9689 * X + 1.8758 * Y + 0.0415 * Z;
  let b = 0.0557 * X - 0.204 * Y + 1.057 * Z;
  r = Math.max(0, r); g = Math.max(0, g); b = Math.max(0, b);
  const peak = Math.max(r, g, b, 1e-6);
  const encode = (v: number) => {
    const n = v / peak;
    const s = n <= 0.0031308 ? n * 12.92 : 1.055 * Math.pow(n, 1 / 2.4) - 0.055;
    return clamp(Math.round(s * 255), 0, 255);
  };
  return [encode(r), encode(g), encode(b)];
}
