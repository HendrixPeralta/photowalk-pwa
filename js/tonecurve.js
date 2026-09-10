// A tone curve in two modes, read as an instrument rather than an editor.
//
// MEASURED (default) plots the frame's own cumulative tone distribution: for
// each input level, the share of the picture at or below it. This is the only
// curve a single JPEG can honestly yield. The curve that was *applied* to make
// the file is unrecoverable — you hold the output and not the scene, and
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
const MEASURED = '#7fb2d9'; // cool, to read as measurement rather than as the amber you control

// Touch slop. A finger on a 430px-wide phone can't hit a 4px dot, so the
// grab radius is deliberately far larger than the drawn point.
const GRAB_RADIUS = 24;
// Two points can't be dragged closer than this in x, or the segment between
// them goes vertical and the curve stops being a function.
const MIN_GAP = 0.02;

let mode = 'measured'; // 'measured' reads the frame; 'adjust' lets you reshape it
let points = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
let selected = -1;
let dragging = false;
let histBins = null; // 64-bin luma histogram of the loaded frame
let cdf = null; // Float32Array(256): share of the frame at or below each level
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

/**
 * Also true throughout measured mode: that curve is a reading of the frame,
 * not an adjustment to it, so it must never reach the preview.
 */
export function isToneCurveIdentity() {
  if (mode === 'measured') return true;
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
  cdf = bins ? buildCdf(bins) : null;
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
function buildCdf(bins) {
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
    const t = pos - lo;
    out[i] = edges[lo] + (edges[Math.min(n, lo + 1)] - edges[lo]) * t;
  }
  return out;
}

export function setToneCurveMode(next) {
  if (next !== 'measured' && next !== 'adjust') return;
  mode = next;
  onChange?.();
}

export function getToneCurveMode() {
  return mode;
}

/** Drops the curve and the frame's histogram when the workspace is cleared. */
export function clearToneCurve() {
  histBins = null;
  cdf = null;
  mode = 'measured';
  points = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
  selected = -1;
  lut = buildLut(points);
}

/* ---------- Interaction ---------- */

export function initToneCurve(canvas, changed) {
  onChange = changed;
  canvas.addEventListener('pointerdown', (e) => {
    if (!plot || mode !== 'adjust') return;
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
    if (!dragging || !plot || mode !== 'adjust') return;
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
    if (mode !== 'adjust') return;
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

  if (mode === 'measured') {
    drawMeasuredCurve(ctx, x, y, size);
    drawAxisLabels(ctx, x, y, size, 'share of frame');
    return;
  }

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

  drawAxisLabels(ctx, x, y, size, 'output');
}

/** Axis hints: which end is shadows, which is highlights, and what y means. */
function drawAxisLabels(ctx, x, y, size, yLabel) {
  ctx.save();
  ctx.fillStyle = LABEL;
  ctx.textAlign = 'left';
  ctx.fillText('shadows', x, y + size + 9);
  ctx.textAlign = 'right';
  ctx.fillText('highlights', x + size, y + size + 9);
  ctx.translate(x - 6, y + size / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.fillText(yLabel, 0, 0);
  ctx.restore();
}

/**
 * The measured curve, with the median marked. The diagonal is the reference
 * that matters here too: a frame whose tones were spread perfectly evenly
 * would trace it exactly, so the gap between curve and diagonal is the
 * frame's tonal bias made visible — above the line is a picture living in
 * its shadows, below it one living in its highlights.
 */
function drawMeasuredCurve(ctx, x, y, size) {
  if (!cdf) {
    ctx.save();
    ctx.fillStyle = LABEL;
    ctx.textAlign = 'center';
    ctx.fillText('No frame loaded', x + size / 2, y + size / 2);
    ctx.restore();
    return;
  }

  ctx.save();
  ctx.strokeStyle = MEASURED;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let i = 0; i < 256; i++) {
    const px = x + (i / 255) * size;
    const py = y + (1 - cdf[i]) * size;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.stroke();

  // Median: the level with half the frame below it. The single most useful
  // number on the plot, so it gets a marker rather than only a caption.
  const median = levelAtShare(0.5);
  if (median !== null) {
    const mx = x + (median / 255) * size;
    const my = y + (1 - 0.5) * size;
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = 'rgba(127,178,217,0.5)';
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

/** Lowest code level at or below which `share` of the frame sits. */
function levelAtShare(share) {
  if (!cdf) return null;
  for (let i = 0; i < 256; i++) if (cdf[i] >= share) return i;
  return 255;
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
  if (mode === 'measured') return measuredSummary();

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

/**
 * Reads the measured curve back as a sentence. Steepness is the whole story:
 * the tonal band the curve climbs through fastest is where the frame has
 * spent its range, and the bands it crosses flat are the ones it never used.
 */
function measuredSummary() {
  if (!cdf) {
    return { label: 'No frame', caption: 'Load a photo to plot how its tones are actually distributed.' };
  }

  const p5 = levelAtShare(0.05);
  const p50 = levelAtShare(0.5);
  const p95 = levelAtShare(0.95);
  const pct = (v) => Math.round((v / 255) * 100);

  // Share of the frame inside each band, straight off the cumulative curve.
  const inShadows = cdf[63];
  const inHighs = 1 - cdf[191];
  const inMids = Math.max(0, 1 - inShadows - inHighs);

  let label;
  if (inShadows > 0.5) label = 'Weighted to shadows';
  else if (inHighs > 0.5) label = 'Weighted to highlights';
  else if (inMids > 0.7) label = 'Midtone-heavy';
  else if (inShadows > 0.28 && inHighs > 0.28) label = 'Split tonality';
  else label = 'Evenly spread';

  const parts = [
    `Median tone at ${pct(p50)}%, with 90% of the frame between ${pct(p5)}% and ${pct(p95)}%.`
  ];

  const steepest = steepestBand();
  if (steepest) parts.push(`Climbs fastest through the ${steepest} — that is where this frame spends its separation.`);

  // A curve that leaves the floor already high, or hits the ceiling early,
  // has pixels stacked at an extreme with nothing beyond them.
  if (cdf[4] > 0.02) parts.push(`${Math.round(cdf[4] * 100)}% is crushed at black.`);
  if (1 - cdf[251] > 0.02) parts.push(`${Math.round((1 - cdf[251]) * 100)}% is clipped at white.`);
  if (p95 - p5 < 100) parts.push('The whole frame occupies a narrow slice of the scale — low contrast by construction.');

  return { label, caption: parts.join(' ') };
}

/** Which of the three tonal bands the cumulative curve rises through fastest. */
function steepestBand() {
  if (!cdf) return null;
  const bands = [
    { name: 'shadows', rise: cdf[63] },
    { name: 'midtones', rise: cdf[191] - cdf[63] },
    { name: 'highlights', rise: 1 - cdf[191] }
  ];
  // Per-level rise, so the comparison is fair across bands of unequal width.
  bands[0].rate = bands[0].rise / 64;
  bands[1].rate = bands[1].rise / 128;
  bands[2].rate = bands[2].rise / 64;
  const top = bands.reduce((a, b) => (b.rate > a.rate ? b : a));
  return top.rate > 0 ? top.name : null;
}
