// Draws a ToneCurveModel onto its canvas. Browser-only. Records the plot box
// on the model so pointer input lands on the same geometry that was drawn.

import { t } from "../i18n/core";
import type { ToneCurveModel } from "./model";

type Ctx = CanvasRenderingContext2D;

const BG = "#0b0d10"; // matches the scopes: a thin curve needs a dark ground
const GRID = "rgba(255,255,255,0.13)";
const GRID_STRONG = "rgba(255,255,255,0.26)";
const LABEL = "rgba(255,255,255,0.55)";
const IDENTITY = "rgba(255,255,255,0.22)";
const CURVE = "#f0bd7a";
const POINT = "#e8a854";
const HIST_IN = "rgba(255,255,255,0.14)";
const HIST_OUT = "rgba(232,168,84,0.34)";
const MEASURED = "#7fb2d9"; // cool, to read as measurement rather than as the amber you control

function prepare(canvas: HTMLCanvasElement): { ctx: Ctx; w: number; h: number } {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 320;
  const h = canvas.clientHeight || 210;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, w, h);
  ctx.font = "600 9px system-ui, sans-serif";
  ctx.textBaseline = "middle";
  return { ctx, w, h };
}

/**
 * Input and output tones share one square box, so the 45-degree identity line
 * means "unchanged" and any departure from it is legible at a glance.
 */
export function drawToneCurve(canvas: HTMLCanvasElement, model: ToneCurveModel): void {
  const { ctx, w, h } = prepare(canvas);
  const padL = 20, padR = 10, padT = 10, padB = 18;
  const size = Math.max(40, Math.min(w - padL - padR, h - padT - padB));
  const x = padL + (w - padL - padR - size) / 2;
  const y = padT;
  model.plot = { x, y, size };

  drawHistBackdrop(ctx, model, x, y, size);

  // Quarter grid, with the frame emphasised.
  ctx.save();
  for (let i = 0; i <= 4; i++) {
    const f = i / 4;
    const gx = x + f * size;
    const gy = y + f * size;
    ctx.strokeStyle = i === 0 || i === 4 ? GRID_STRONG : GRID;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.round(gx) + 0.5, y);
    ctx.lineTo(Math.round(gx) + 0.5, y + size);
    ctx.moveTo(x, Math.round(gy) + 0.5);
    ctx.lineTo(x + size, Math.round(gy) + 0.5);
    ctx.stroke();
  }
  ctx.restore();

  // Identity reference.
  ctx.save();
  ctx.strokeStyle = IDENTITY;
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y + size);
  ctx.lineTo(x + size, y);
  ctx.stroke();
  ctx.restore();

  if (model.mode === "measured") {
    drawMeasuredCurve(ctx, model, x, y, size);
    drawAxisLabels(ctx, x, y, size, t("share of photo"));
    return;
  }

  // The curve itself, straight off the LUT so what you see is what is applied.
  const lut = model.lut;
  ctx.save();
  ctx.strokeStyle = CURVE;
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.beginPath();
  for (let i = 0; i < 256; i++) {
    const px = x + (i / 255) * size;
    const py = y + (1 - lut[i] / 255) * size;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.restore();

  // Control points.
  model.points.forEach((p, i) => {
    const cx = x + p.x * size;
    const cy = y + (1 - p.y) * size;
    ctx.save();
    if (i === model.selected) {
      ctx.strokeStyle = CURVE;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, 9, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = POINT;
    ctx.beginPath();
    ctx.arc(cx, cy, i === model.selected ? 5 : 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = BG;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  });

  drawAxisLabels(ctx, x, y, size, t("output"));
}

/** Axis hints: which end is shadows, which is highlights, and what y means. */
function drawAxisLabels(ctx: Ctx, x: number, y: number, size: number, yLabel: string): void {
  ctx.save();
  ctx.fillStyle = LABEL;
  ctx.textAlign = "left";
  ctx.fillText(t("shadows"), x, y + size + 9);
  ctx.textAlign = "right";
  ctx.fillText(t("highlights"), x + size, y + size + 9);
  ctx.translate(x - 6, y + size / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "center";
  ctx.fillText(yLabel, 0, 0);
  ctx.restore();
}

/**
 * The measured curve, with the median marked. The diagonal is the reference
 * that matters here too: a frame whose tones were spread perfectly evenly
 * would trace it exactly, so the gap between curve and diagonal is the
 * frame's tonal bias made visible. Above the line is a picture living in its
 * shadows, below it one living in its highlights.
 */
function drawMeasuredCurve(ctx: Ctx, model: ToneCurveModel, x: number, y: number, size: number): void {
  const cdf = model.cdf;
  if (!cdf) {
    ctx.save();
    ctx.fillStyle = LABEL;
    ctx.textAlign = "center";
    ctx.fillText(t("No photo loaded"), x + size / 2, y + size / 2);
    ctx.restore();
    return;
  }

  ctx.save();
  ctx.strokeStyle = MEASURED;
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.beginPath();
  for (let i = 0; i < 256; i++) {
    const px = x + (i / 255) * size;
    const py = y + (1 - cdf[i]) * size;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.stroke();

  // Median: the level with half the frame below it. The single most useful
  // number on the plot, so it gets a marker rather than only a caption.
  const median = model.levelAtShare(0.5);
  if (median !== null) {
    const mx = x + (median / 255) * size;
    const my = y + (1 - 0.5) * size;
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = "rgba(127,178,217,0.5)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(mx, y + size);
    ctx.lineTo(mx, my);
    ctx.lineTo(x, my);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = MEASURED;
    ctx.beginPath();
    ctx.arc(mx, my, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Two histograms in the same box: the frame as loaded, and the frame as the
 * curve would leave it. Watching the second one pile up against an edge is
 * the whole point: that is clipping about to happen.
 */
function drawHistBackdrop(ctx: Ctx, model: ToneCurveModel, x: number, y: number, size: number): void {
  const histBins = model.histBins;
  if (!histBins) return;
  const lut = model.lut;
  const n = histBins.length;
  const inBins = new Array<number>(n).fill(0);
  const outBins = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    const count = histBins[i].lum;
    inBins[i] += count;
    // Each bin covers 4 code values; sample its centre through the LUT.
    const mapped = lut[Math.min(255, Math.round((i + 0.5) * (256 / n)))];
    outBins[Math.min(n - 1, Math.floor(mapped / (256 / n)))] += count;
  }
  const peak = Math.max(1, ...inBins, ...outBins);

  const fill = (bins: number[], style: string) => {
    ctx.save();
    ctx.fillStyle = style;
    ctx.beginPath();
    ctx.moveTo(x, y + size);
    for (let i = 0; i < n; i++) {
      const bx = x + ((i + 0.5) / n) * size;
      const by = y + size - (bins[i] / peak) * size * 0.85;
      ctx.lineTo(bx, by);
    }
    ctx.lineTo(x + size, y + size);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };

  fill(inBins, HIST_IN);
  if (!model.isIdentity()) fill(outBins, HIST_OUT);
}
