// An interactive tone curve, read as an instrument rather than an editor.
//
// The histogram says how the frame's tones are distributed. This says what a
// redistribution would cost you: drag a point and the output histogram behind
// the curve moves with it, so a shadow lift that quietly crushes separation in
// the darks is something you *see* instead of something you're told.
//
// Nothing here writes a corrected image. The curve is a lens over the preview
// (an SVG feComponentTransfer, so dragging stays cheap) and it is thrown away
// with the frame — you leave with the understanding, not a new JPEG.
//
// Owns its control points, so unlike scopes.js this module holds state; the
// drawing half still only reads what it is handed.

import { clamp } from './util.js';

const BG = '#0b0d10'; // matches the scopes: a thin curve needs a dark ground
const GRID = 'rgba(255,255,255,0.13)';
const GRID_STRONG = 'rgba(255,255,255,0.26)';
const LABEL = 'rgba(255,255,255,0.55)';
const IDENTITY = 'rgba(255,255,255,0.22)';
const CURVE = '#f0bd7a';
const POINT = '#e8a854';
const HIST_IN = 'rgba(255,255,255,0.14)';
const HIST_OUT = 'rgba(232,168,84,0.34)';

// Touch slop. A finger on a 430px-wide phone can't hit a 4px dot, so the
// grab radius is deliberately far larger than the drawn point.
const GRAB_RADIUS = 24;
// Two points can't be dragged closer than this in x, or the segment between
// them goes vertical and the curve stops being a function.
const MIN_GAP = 0.02;

let points = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
let selected = -1;
let dragging = false;
let histBins = null; // 64-bin luma histogram of the loaded frame
let lut = identityLut();
let onChange = null;
let plot = null; // last drawn geometry, for hit-testing

function identityLut() {
  const t = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) t[i] = i;
  return t;
}

/* ---------- Curve maths ---------- */

/**
 * Monotone cubic Hermite (Fritsch-Carlson). Plain Catmull-Rom overshoots
 * between close points, and an overshooting tone curve inverts tones — a
 * highlight coming out darker than the midtone below it — which reads as a
 * solarised artefact rather than a grade. Monotone can't do that.
 */
function buildLut(pts) {
  const n = pts.length;
  const out = new Uint8ClampedArray(256);
  if (n < 2) return identityLut();

  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const delta = new Array(n - 1);
  for (let i = 0; i < n - 1; i++) {
    const dx = xs[i + 1] - xs[i];
    delta[i] = dx > 0 ? (ys[i + 1] - ys[i]) / dx : 0;
  }

  const m = new Array(n);
  m[0] = delta[0];
  m[n - 1] = delta[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = (delta[i - 1] + delta[i]) / 2;

  for (let i = 0; i < n - 1; i++) {
    if (delta[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / delta[i];
    const b = m[i + 1] / delta[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * delta[i];
      m[i + 1] = t * b * delta[i];
    }
  }

  let seg = 0;
  for (let i = 0; i < 256; i++) {
    const x = i / 255;
    while (seg < n - 2 && x > xs[seg + 1]) seg++;
    const h = xs[seg + 1] - xs[seg];
    if (h <= 0) { out[i] = Math.round(ys[seg] * 255); continue; }
    const t = clamp((x - xs[seg]) / h, 0, 1);
    const t2 = t * t;
    const t3 = t2 * t;
    const y = (2 * t3 - 3 * t2 + 1) * ys[seg]
            + (t3 - 2 * t2 + t) * h * m[seg]
            + (-2 * t3 + 3 * t2) * ys[seg + 1]
            + (t3 - t2) * h * m[seg + 1];
    out[i] = Math.round(clamp(y, 0, 1) * 255);
  }
  return out;
}

export function getToneCurveLut() {
  return lut;
}

export function isToneCurveIdentity() {
  for (let i = 0; i < 256; i++) if (Math.abs(lut[i] - i) > 1) return false;
  return true;
}

/**
 * SVG feComponentTransfer wants a tableValues list, not 256 entries. 33 stops
 * is past the point where the interpolation between them is visible, and it
 * keeps the attribute short enough to rewrite on every pointermove.
 */
export function toneCurveTableValues(stops = 33) {
  const vals = new Array(stops);
  for (let i = 0; i < stops; i++) {
    const src = Math.round((i / (stops - 1)) * 255);
    vals[i] = (lut[src] / 255).toFixed(4);
  }
  return vals.join(' ');
}

export function resetToneCurve() {
  points = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
  selected = -1;
  lut = buildLut(points);
  onChange?.();
}

export function setToneCurveHistogram(bins) {
  histBins = bins || null;
}

/** Drops the curve and the frame's histogram when the workspace is cleared. */
export function clearToneCurve() {
  histBins = null;
  points = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
  selected = -1;
  lut = buildLut(points);
}

/* ---------- Interaction ---------- */

export function initToneCurve(canvas, changed) {
  onChange = changed;
  canvas.addEventListener('pointerdown', (e) => {
    if (!plot) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    const { x, y } = toCurveSpace(canvas, e);
    const hit = nearestPoint(canvas, e);
    if (hit >= 0) {
      selected = hit;
    } else {
      points.push({ x, y });
      points.sort((a, b) => a.x - b.x);
      selected = points.findIndex((p) => p.x === x && p.y === y);
    }
    dragging = true;
    applyDrag(x, y);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!dragging || !plot) return;
    e.preventDefault();
    const { x, y } = toCurveSpace(canvas, e);
    applyDrag(x, y);
  });

  const end = (e) => {
    if (!dragging) return;
    dragging = false;
    if (canvas.hasPointerCapture?.(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  // Double-tap a point to drop it. The two endpoints stay: without them the
  // curve has no defined black and white, and the LUT loses its anchors.
  canvas.addEventListener('dblclick', (e) => {
    const hit = nearestPoint(canvas, e);
    if (hit <= 0 || hit >= points.length - 1) return;
    points.splice(hit, 1);
    selected = -1;
    lut = buildLut(points);
    onChange?.();
  });
}

function applyDrag(x, y) {
  const p = points[selected];
  if (!p) return;
  const isFirst = selected === 0;
  const isLast = selected === points.length - 1;
  // The endpoints are the black and white point: they slide vertically only,
  // so the curve always spans the full input range.
  if (!isFirst && !isLast) {
    const lo = points[selected - 1].x + MIN_GAP;
    const hi = points[selected + 1].x - MIN_GAP;
    p.x = clamp(x, lo, hi);
  }
  p.y = clamp(y, 0, 1);
  lut = buildLut(points);
  onChange?.();
}

function toCurveSpace(canvas, e) {
  const rect = canvas.getBoundingClientRect();
  const px = e.clientX - rect.left;
  const py = e.clientY - rect.top;
  return {
    x: clamp((px - plot.x) / plot.size, 0, 1),
    y: clamp(1 - (py - plot.y) / plot.size, 0, 1)
  };
}

function nearestPoint(canvas, e) {
  if (!plot) return -1;
  const rect = canvas.getBoundingClientRect();
  const px = e.clientX - rect.left;
  const py = e.clientY - rect.top;
  let best = -1;
  let bestDist = GRAB_RADIUS;
  points.forEach((p, i) => {
    const cx = plot.x + p.x * plot.size;
    const cy = plot.y + (1 - p.y) * plot.size;
    const d = Math.hypot(px - cx, py - cy);
    if (d < bestDist) { bestDist = d; best = i; }
  });
  return best;
}

/* ---------- Drawing ---------- */

function prepare(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 320;
  const h = canvas.clientHeight || 210;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, w, h);
  ctx.font = '600 9px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  return { ctx, w, h };
}

/**
 * Input and output tones share one square box, so the 45-degree identity line
 * means "unchanged" and any departure from it is legible at a glance.
 */
export function drawToneCurve(canvas) {
  const { ctx, w, h } = prepare(canvas);
  const padL = 20, padR = 10, padT = 10, padB = 18;
  const size = Math.max(40, Math.min(w - padL - padR, h - padT - padB));
  const x = padL + (w - padL - padR - size) / 2;
  const y = padT;
  plot = { x, y, size };

  drawHistBackdrop(ctx, x, y, size);

  // Quarter grid, with the frame emphasised.
  ctx.save();
  for (let i = 0; i <= 4; i++) {
    const t = i / 4;
    const gx = x + t * size;
    const gy = y + t * size;
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

  // The curve itself, straight off the LUT so what you see is what is applied.
  ctx.save();
  ctx.strokeStyle = CURVE;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let i = 0; i < 256; i++) {
    const px = x + (i / 255) * size;
    const py = y + (1 - lut[i] / 255) * size;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.restore();

  // Control points.
  points.forEach((p, i) => {
    const cx = x + p.x * size;
    const cy = y + (1 - p.y) * size;
    ctx.save();
    if (i === selected) {
      ctx.strokeStyle = CURVE;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, 9, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = POINT;
    ctx.beginPath();
    ctx.arc(cx, cy, i === selected ? 5 : 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = BG;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  });

  // Axis hints: which end is shadows, which is highlights.
  ctx.save();
  ctx.fillStyle = LABEL;
  ctx.textAlign = 'left';
  ctx.fillText('shadows', x, y + size + 9);
  ctx.textAlign = 'right';
  ctx.fillText('highlights', x + size, y + size + 9);
  ctx.translate(x - 6, y + size / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.fillText('output', 0, 0);
  ctx.restore();
}

/**
 * Two histograms in the same box: the frame as loaded, and the frame as the
 * curve would leave it. Watching the second one pile up against an edge is
 * the whole point — that is clipping about to happen.
 */
function drawHistBackdrop(ctx, x, y, size) {
  if (!histBins) return;
  const n = histBins.length;
  const inBins = new Array(n).fill(0);
  const outBins = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const count = histBins[i].lum;
    inBins[i] += count;
    // Each bin covers 4 code values; sample its centre through the LUT.
    const mapped = lut[Math.min(255, Math.round((i + 0.5) * (256 / n)))];
    outBins[Math.min(n - 1, Math.floor(mapped / (256 / n)))] += count;
  }
  const peak = Math.max(1, ...inBins, ...outBins);

  const fill = (bins, style) => {
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
  if (!isToneCurveIdentity()) fill(outBins, HIST_OUT);
}

/* ---------- Reading ---------- */

/**
 * Names the shape rather than scoring it. "Contrast is up, and you have paid
 * for it in the shadows" is a sentence you can act on; a number out of ten is
 * the AI-grading this app deliberately doesn't do.
 */
export function toneCurveSummary() {
  if (isToneCurveIdentity()) {
    return {
      label: 'Linear',
      caption: 'Untouched — output matches input. Drag the line to see what a grade would cost.'
    };
  }

  const shadow = lut[64] - 64;
  const mid = lut[128] - 128;
  const high = lut[191] - 191;
  const slope = (lut[191] - lut[64]) / 127;

  let label;
  if (slope > 1.12 && shadow < 0 && high > 0) label = 'S-curve';
  else if (slope < 0.9) label = 'Flattened';
  else if (mid > 6) label = 'Lifted';
  else if (mid < -6) label = 'Deepened';
  else if (shadow > 6) label = 'Shadow lift';
  else if (high < -6) label = 'Highlight pull';
  else label = 'Shaped';

  const parts = [`Midtone contrast ${slope >= 1 ? 'up' : 'down'} ${Math.round(Math.abs(slope - 1) * 100)}%.`];
  if (lut[0] > 4) parts.push('Blacks are lifted off zero — the frame will look milky.');
  if (lut[255] < 251) parts.push('Whites are pulled down — no clean white left.');
  if (shadow < -12) parts.push('Shadows pushed down; watch the darks for lost separation.');
  if (high > 12) parts.push('Highlights pushed up; the brightest tones are near clipping.');

  return { label, caption: parts.join(' ') };
}
