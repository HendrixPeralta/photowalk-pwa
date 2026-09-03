// The four video-style scopes a colorist keeps open in DaVinci Resolve.
//
// The histogram already says *how much* of each tone the frame holds. These
// say *where* that tone sits in the frame (waveform, parade) and *what color*
// it is (vectorscope, CIE chromaticity) — the readings you need to spot a cast
// or a blown sky, which a histogram alone hides.
//
// Measure-and-draw only: no app state and no imports beyond util, so
// analysis.js can call in and nothing here ever calls back.

import { clamp } from './util.js';

// Trace buffers are accumulated at a fixed resolution and scaled to whatever
// the canvas ends up being, so a phone and a desktop read the same shape.
const TRACE_W = 256; // horizontal position buckets
const TRACE_H = 256; // one row per 8-bit code value
const VEC_N = 256;
const CIE_N = 256;

// Vectorscope scale: pure primaries top out near a chroma of 152 (magenta and
// yellow are the far ones), so an edge of 160 puts them just inside the outer
// ring, where a broadcast scope's bar targets sit.
const VEC_MAX_CHROMA = 160;
// The classic vectorscope skin-tone axis. Skin of any complexion lands close
// to this angle; what differs between complexions is brightness, which a
// vectorscope deliberately throws away.
const SKIN_LINE_DEG = 123;
const SKIN_TOLERANCE_DEG = 15;
const SKIN_AXIS_CB = Math.cos((SKIN_LINE_DEG * Math.PI) / 180);
const SKIN_AXIS_CR = Math.sin((SKIN_LINE_DEG * Math.PI) / 180);
const SKIN_AXIS_COS = Math.cos((SKIN_TOLERANCE_DEG * Math.PI) / 180);
const CHROMATIC_MIN = 10; // below this a pixel is too neutral to have a usable hue

const CIE_X_MAX = 0.8;
const CIE_Y_MAX = 0.9;
const D65 = { x: 0.3127, y: 0.3290 };
// sRGB / Rec.709 primaries — the triangle drawn over the CIE horseshoe.
const SRGB_PRIMARIES = [[0.640, 0.330], [0.300, 0.600], [0.150, 0.060]];

const SCOPE_BG = '#0b0d10'; // scopes stay dark in both themes; a trace needs it
const GRID = 'rgba(255,255,255,0.13)';
const GRID_STRONG = 'rgba(255,255,255,0.26)';
const LABEL = 'rgba(255,255,255,0.55)';

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
const LOCUS = [
  [0.1741, 0.0050], [0.1738, 0.0049], [0.1733, 0.0048], [0.1726, 0.0048],
  [0.1714, 0.0051], [0.1689, 0.0069], [0.1644, 0.0109], [0.1566, 0.0177],
  [0.1440, 0.0297], [0.1241, 0.0578], [0.1096, 0.0868], [0.0913, 0.1327],
  [0.0687, 0.2007], [0.0454, 0.2950], [0.0235, 0.4127], [0.0082, 0.5384],
  [0.0039, 0.6548], [0.0139, 0.7502], [0.0389, 0.8120], [0.0743, 0.8338],
  [0.1096, 0.8344], [0.1547, 0.8059], [0.1913, 0.7932], [0.2296, 0.7543],
  [0.3016, 0.6923], [0.3731, 0.6245], [0.4441, 0.5547],
  [0.5125, 0.4866], [0.5752, 0.4242], [0.6270, 0.3725], [0.6658, 0.3340],
  [0.6915, 0.3083], [0.7079, 0.2920], [0.7190, 0.2809], [0.7260, 0.2740],
  [0.7300, 0.2700], [0.7320, 0.2680], [0.7334, 0.2666], [0.7344, 0.2656],
  [0.7347, 0.2653]
];

/* ---------- Measurement ---------- */

/**
 * Single pass over the sampled pixels that fills every scope's trace buffer
 * and the statistics the plain-language readings are derived from.
 * Takes the same ImageData the histogram reads, and returns
 * { wave, parade, vector, cie, stats } — buffers are raw hit counts.
 */
export function computeScopes(imageData) {
  const { data, width, height } = imageData;

  const wave = new Uint32Array(TRACE_W * TRACE_H);
  const parade = [
    new Uint32Array(TRACE_W * TRACE_H),
    new Uint32Array(TRACE_W * TRACE_H),
    new Uint32Array(TRACE_W * TRACE_H)
  ];
  const vector = new Uint32Array(VEC_N * VEC_N);
  const cie = new Uint32Array(CIE_N * CIE_N);

  const lumHist = new Uint32Array(256);
  const chanHist = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];

  // x -> trace column, resolved once instead of per pixel.
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

      // Rec.709 color-difference pair — the same axes a broadcast vectorscope
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
  const channels = ['r', 'g', 'b'].reduce((acc, key, idx) => {
    acc[key] = channelStats(chanHist[idx], total);
    return acc;
  }, {});

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
      channels,
      vector: {
        meanChroma: chromaSum / total,
        chromaticShare: chromaticCount / total,
        skinShare: chromaticCount ? skinCount / chromaticCount : 0,
        hueDeg: hueAngle(hueX, hueY),
        hueRgb: chromaFromVector(hueX, hueY, chromaticCount)
      },
      cie: { x: avgX, y: avgY, gamutShare: gamutShare(cie) }
    }
  };
}

/** Black point, white point, clipping share and mean from a 256-bin histogram. */
function channelStats(hist, total) {
  return {
    low: percentile(hist, total, 0.005),
    high: percentile(hist, total, 0.995),
    clipBlack: hist[0] / total,
    clipWhite: hist[255] / total,
    mean: meanOf(hist, total)
  };
}

function percentile(hist, total, p) {
  const target = total * p;
  let run = 0;
  for (let i = 0; i < 256; i++) {
    run += hist[i];
    if (run >= target) return i;
  }
  return 255;
}

function meanOf(hist, total) {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += hist[i] * i;
  return sum / total;
}

function hueAngle(x, y) {
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
function chromaFromVector(hueX, hueY, count) {
  if (!count) return null;
  const cb = hueX / count;
  const cr = hueY / count;
  const scale = Math.max(1, 90 / (Math.sqrt(cb * cb + cr * cr) || 1)); // push to a nameable saturation
  return ycbcrToRgb(150, cb * scale, cr * scale);
}

function ycbcrToRgb(y, cb, cr) {
  const r = y + 1.5748 * cr;
  const b = y + 1.8556 * cb;
  const g = (y - 0.2126 * r - 0.0722 * b) / 0.7152;
  return {
    r: clamp(Math.round(r), 0, 255),
    g: clamp(Math.round(g), 0, 255),
    b: clamp(Math.round(b), 0, 255)
  };
}

/* ---------- Shared drawing helpers ---------- */

let scratch = null;

function blit(ctx, img, x, y, w, h) {
  if (!scratch) scratch = document.createElement('canvas');
  if (scratch.width !== img.width || scratch.height !== img.height) {
    scratch.width = img.width;
    scratch.height = img.height;
  }
  scratch.getContext('2d').putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(scratch, x, y, w, h);
}

/**
 * Maps hit counts to pixel alpha. Real scopes are analog: a faint trace still
 * has to be visible next to a dense one, so the reference is a fraction of the
 * peak and the response is a gentle power curve rather than linear.
 */
function traceImage(buf, bw, bh, tint) {
  let max = 0;
  for (let i = 0; i < buf.length; i++) if (buf[i] > max) max = buf[i];
  const ref = Math.max(1, max * 0.09);
  const img = new ImageData(bw, bh);
  const px = img.data;
  const dynamic = typeof tint === 'function';

  for (let i = 0; i < buf.length; i++) {
    const count = buf[i];
    if (!count) continue;
    const t = Math.min(1, Math.pow(count / ref, 0.55));
    const color = dynamic ? tint(i % bw, (i / bw) | 0) : tint;
    const o = i * 4;
    px[o] = color[0];
    px[o + 1] = color[1];
    px[o + 2] = color[2];
    px[o + 3] = Math.round(t * 255);
  }
  return img;
}

/** Sizes a canvas to its CSS box at device resolution and paints the backdrop. */
function prepare(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 320;
  const h = canvas.clientHeight || 200;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = SCOPE_BG;
  ctx.fillRect(0, 0, w, h);
  ctx.font = '600 9px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  return { ctx, w, h };
}

/**
 * Horizontal 0-100% graticule shared by the waveform and every parade panel.
 * Percent, not code values: the sample is 8-bit canvas data, so quoting a
 * 10-bit 0-1023 scale like Resolve's would be inventing precision.
 */
function drawLevelGrid(ctx, x, y, w, h, { labels = false } = {}) {
  ctx.save();
  ctx.textAlign = 'right';
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

/* ---------- Waveform ---------- */

/**
 * Luma against horizontal position: the trace sits directly under the part of
 * the frame it came from, which is what makes it readable as "that sky is
 * blown" rather than just "something is blown".
 */
export function drawWaveform(canvas, scopes) {
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

/** Orange bars on the rails a real scope would show you are riding into. */
function markClipping(ctx, x, y, w, h, stats) {
  ctx.fillStyle = 'rgba(255,170,60,0.9)';
  if (stats.clipWhite > 0.01) ctx.fillRect(x, y, w, 2);
  if (stats.clipBlack > 0.01) ctx.fillRect(x, y + h - 2, w, 2);
}

/* ---------- RGB Parade ---------- */

/**
 * The waveform split into R, G and B panels. Lining up the three panel floors
 * neutralizes the shadows and lining up their ceilings neutralizes the
 * highlights — the classic way to kill a color cast by eye.
 */
export function drawParade(canvas, scopes) {
  const { ctx, w, h } = prepare(canvas);
  if (!scopes) return;

  const gutter = 22;
  const pad = 6;
  const gap = 6;
  const plotY = pad;
  const plotH = Math.max(10, h - pad * 2);
  const totalW = Math.max(12, w - gutter - pad);
  const panelW = (totalW - gap * 2) / 3;

  const tints = [[255, 96, 96], [92, 226, 132], [110, 160, 255]];
  const keys = ['r', 'g', 'b'];

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
export function drawVectorscope(canvas, scopes) {
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
  const tintFor = (bx, by) => {
    const cb = ((bx / (VEC_N - 1)) * 2 - 1) * VEC_MAX_CHROMA;
    const cr = (1 - (by / (VEC_N - 1)) * 2) * VEC_MAX_CHROMA;
    const c = ycbcrToRgb(150, cb, cr);
    return [c.r, c.g, c.b];
  };

  drawVectorGraticule(ctx, cx, cy, radius, perChroma);

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();
  blit(ctx, traceImage(scopes.vector, VEC_N, VEC_N, tintFor), x0, y0, size, size);
  ctx.restore();

  drawVectorTargets(ctx, cx, cy, perChroma);
}

function drawVectorGraticule(ctx, cx, cy, radius, perChroma) {
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
  ctx.strokeStyle = 'rgba(255,190,150,0.55)';
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
  { label: 'R', rgb: [255, 0, 0] },
  { label: 'YL', rgb: [255, 255, 0] },
  { label: 'G', rgb: [0, 255, 0] },
  { label: 'CY', rgb: [0, 255, 255] },
  { label: 'B', rgb: [0, 0, 255] },
  { label: 'MG', rgb: [255, 0, 255] }
];

function drawVectorTargets(ctx, cx, cy, perChroma) {
  ctx.save();
  ctx.textAlign = 'center';
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
export function drawChromaticity(canvas, scopes) {
  const { ctx, w, h } = prepare(canvas);
  if (!scopes) return;

  const size = Math.max(40, Math.min(w, h) - 12);
  const x0 = (w - size) / 2;
  const y0 = (h - size) / 2;
  const toX = (x) => x0 + (x / CIE_X_MAX) * size;
  const toY = (y) => y0 + (1 - y / CIE_Y_MAX) * size;

  blit(ctx, cieBackdrop(), x0, y0, size, size);
  blit(ctx, traceImage(scopes.cie, CIE_N, CIE_N, [255, 255, 255]), x0, y0, size, size);

  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  SRGB_PRIMARIES.forEach(([x, y], i) => {
    const px = toX(x), py = toY(y);
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  });
  ctx.closePath();
  ctx.stroke();

  const wx = toX(D65.x), wy = toY(D65.y);
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.beginPath();
  ctx.moveTo(wx - 4, wy); ctx.lineTo(wx + 4, wy);
  ctx.moveTo(wx, wy - 4); ctx.lineTo(wx, wy + 4);
  ctx.stroke();

  ctx.fillStyle = LABEL;
  ctx.textAlign = 'left';
  ctx.fillText('sRGB / Rec.709', x0 + 4, y0 + 8);
  ctx.fillText('D65', wx + 6, wy + 8);
}

let cieCache = null;

/** The colored horseshoe. Fixed geometry, so it is built once and reused. */
function cieBackdrop() {
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

/** xyY at unit luminance -> displayable sRGB, normalized so hue survives. */
function chromaticityColor(x, y) {
  const X = x / y;
  const Y = 1;
  const Z = (1 - x - y) / y;
  let r = 3.2406 * X - 1.5372 * Y - 0.4986 * Z;
  let g = -0.9689 * X + 1.8758 * Y + 0.0415 * Z;
  let b = 0.0557 * X - 0.2040 * Y + 1.0570 * Z;
  r = Math.max(0, r); g = Math.max(0, g); b = Math.max(0, b);
  const peak = Math.max(r, g, b, 1e-6);
  const encode = (v) => {
    const n = v / peak;
    const s = n <= 0.0031308 ? n * 12.92 : 1.055 * Math.pow(n, 1 / 2.4) - 0.055;
    return clamp(Math.round(s * 255), 0, 255);
  };
  return [encode(r), encode(g), encode(b)];
}

function insideLocus(x, y) {
  let inside = false;
  for (let i = 0, j = LOCUS.length - 1; i < LOCUS.length; j = i++) {
    const [xi, yi] = LOCUS[i];
    const [xj, yj] = LOCUS[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

let srgbCellCount = null;

/**
 * Share of the sRGB triangle the image touches, by occupied grid cells. A
 * coarse but honest "how wide is this palette" number that the CIE plot makes
 * visually obvious.
 */
function gamutShare(cieBuf) {
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

function insideTriangle(x, y, tri) {
  const sign = (ax, ay, bx, by, cx, cy) => (ax - cx) * (by - cy) - (bx - cx) * (ay - cy);
  const d1 = sign(x, y, tri[0][0], tri[0][1], tri[1][0], tri[1][1]);
  const d2 = sign(x, y, tri[1][0], tri[1][1], tri[2][0], tri[2][1]);
  const d3 = sign(x, y, tri[2][0], tri[2][1], tri[0][0], tri[0][1]);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}
