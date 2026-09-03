import { state, save, warnIfStorageTight } from './store.js';
import { readExif, isHeif } from './exif.js';
import { putImage, imageUrl, hydrateImages } from './db.js';
import { showToast } from './toast.js';
import { openModal, closeModal } from './modal.js';
import { CONCEPTS, THEMES, renderConceptCard } from './concepts.js';
import {
  histogramSummary, paletteRelationship, waveformSummary, paradeSummary,
  vectorscopeSummary, chromaticitySummary, SHADOW_END, HIGHLIGHT_START
} from './interpret.js';
import { computeScopes, drawWaveform, drawParade, drawVectorscope, drawChromaticity } from './scopes.js';
import {
  escapeHtml, uid, clamp, loadImage, readFileAsDataUrl, rgbToHex, nearestColorName,
  drawToCanvas, canvasToBlob, focalBucket, apertureBucket, formatCoords
} from './util.js';

// Histogram and palette always read a fixed 640px sample, so their numbers are
// cheap and stable no matter how large the display canvas gets.
const MAX_DIM = 640;
// The visible canvas is bigger so zooming in shows real detail...
const DISPLAY_MAX_DIM = 1280;
// ...and a reference you'll study later deserves more still; IndexedDB has room.
const ALBUM_MAX_DIM = 1600;

// Grid overlay ids double as CONCEPTS keys, so the matching tip is a direct lookup.
const LINE_FRACTIONS = {
  thirds: [1 / 3, 2 / 3],
  golden: [0.382, 0.618]
};
const OVERLAY_TYPES = ['none', 'thirds', 'golden', 'golden-triangles', 'spiral-section', 'golden-spiral'];
// Golden Triangles mirrored = Harmonious Triangles, so one guide + Flip covers both.
const FLIPPABLE_OVERLAYS = ['golden-triangles'];
// The spirals can start in any corner; Rotate steps through the four.
const ROTATABLE_OVERLAYS = ['spiral-section', 'golden-spiral'];
const PHI = (1 + Math.sqrt(5)) / 2;
const ZOOM_MAX = 3;
const LINE_HIT_PX = 20; // screen-px hit radius for grabbing a single guide line

// Each scope pairs a renderer with the rule that puts its trace into words.
const SCOPES = [
  { key: 'waveform', draw: drawWaveform, read: waveformSummary },
  { key: 'parade', draw: drawParade, read: paradeSummary },
  { key: 'vectorscope', draw: drawVectorscope, read: vectorscopeSummary },
  { key: 'cie', draw: drawChromaticity, read: chromaticitySummary }
];

let els = {};
let overlayType = 'thirds';
let overlayFlip = false; // mirrors the triangle guide
let overlayRotation = 0; // quarter-turns applied to the spiral guides
// One normalized offset per guide line, so each can be dragged independently.
let lineOffsets = { x: [0, 0], y: [0, 0] };
let view = { zoom: 1, panX: 0, panY: 0 };
let pointers = new Map(); // active pointers on the canvas, for pinch
let gesture = null; // { kind: 'line' | 'pan' | 'pinch', ... }

let imageCtx = null;
let overlayCtx = null;
let refImageCtx = null;
let refOverlayCtx = null;
let currentImage = null;
let currentImageData = null;
let currentExif = null;
let currentPalette = [];
let currentHist = null;
let currentScopes = null;
let scopeView = 'waveform'; // one scope key, or 'all' for the 2x2 wall
let resizeTimer = null;
let avgLuminance = 128;
let albumItemId = null; // set when re-analyzing a saved reference -> save updates in place
let compareRef = null; // { item, hist } while comparison mode is active

export function initAnalysis() {
  els = {
    input: document.getElementById('photoInput'),
    chooseBtn: document.getElementById('choosePhotoBtn'),
    empty: document.getElementById('analyzeEmpty'),
    workspace: document.getElementById('analyzeWorkspace'),
    pinnedTip: document.getElementById('analyzePinnedTip'),
    stack: document.getElementById('canvasStack'),
    inner: document.getElementById('canvasInner'),
    imageCanvas: document.getElementById('imageCanvas'),
    overlayCanvas: document.getElementById('overlayCanvas'),
    refPane: document.getElementById('refPane'),
    refStack: document.getElementById('refCanvasStack'),
    refImageCanvas: document.getElementById('refImageCanvas'),
    refOverlayCanvas: document.getElementById('refOverlayCanvas'),
    overlaySelect: document.getElementById('overlaySelect'),
    flipGuideBtn: document.getElementById('flipGuideBtn'),
    rotateGuideBtn: document.getElementById('rotateGuideBtn'),
    compareBtn: document.getElementById('compareBtn'),
    exitCompareBtn: document.getElementById('exitCompareBtn'),
    fitViewBtn: document.getElementById('fitViewBtn'),
    resetGrid: document.getElementById('resetGridBtn'),
    overlayTipBox: document.getElementById('overlayTipBox'),
    histogramCanvas: document.getElementById('histogramCanvas'),
    histogramCaption: document.getElementById('histogramCaption'),
    refHistBlock: document.getElementById('refHistBlock'),
    refHistogramCanvas: document.getElementById('refHistogramCanvas'),
    refHistogramCaption: document.getElementById('refHistogramCaption'),
    scopeTabs: document.getElementById('scopeTabs'),
    scopeGrid: document.getElementById('scopeGrid'),
    scopeCells: SCOPES.map((scope) => ({
      ...scope,
      cell: document.querySelector(`.scope-cell[data-scope="${scope.key}"]`),
      canvas: document.getElementById(`${scope.key}Canvas`),
      caption: document.getElementById(`${scope.key}Caption`)
    })),
    paletteRow: document.getElementById('paletteRow'),
    paletteCaption: document.getElementById('paletteCaption'),
    exifBlock: document.getElementById('exifBlock'),
    tagsInput: document.getElementById('tagsInput'),
    saveBtn: document.getElementById('saveToAlbumBtn'),
    anotherBtn: document.getElementById('chooseAnotherBtn')
  };

  imageCtx = els.imageCanvas.getContext('2d', { willReadFrequently: true });
  overlayCtx = els.overlayCanvas.getContext('2d');
  refImageCtx = els.refImageCanvas.getContext('2d');
  refOverlayCtx = els.refOverlayCanvas.getContext('2d');

  els.chooseBtn.addEventListener('click', () => els.input.click());
  els.input.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) handleFile(file);
  });

  els.overlaySelect.addEventListener('change', () => setOverlay(els.overlaySelect.value));
  els.flipGuideBtn.addEventListener('click', () => {
    overlayFlip = !overlayFlip;
    drawOverlay();
  });
  els.rotateGuideBtn.addEventListener('click', () => {
    overlayRotation = (overlayRotation + 1) % 4;
    drawOverlay();
  });
  els.resetGrid.addEventListener('click', () => {
    lineOffsets = { x: [0, 0], y: [0, 0] };
    overlayFlip = false;
    overlayRotation = 0;
    drawOverlay();
  });
  els.fitViewBtn.addEventListener('click', () => setViewTransform(1, 0, 0));
  els.compareBtn.addEventListener('click', openComparePicker);
  els.exitCompareBtn.addEventListener('click', exitCompare);

  els.overlayCanvas.addEventListener('pointerdown', onPointerDown);
  els.overlayCanvas.addEventListener('pointermove', onPointerMove);
  els.overlayCanvas.addEventListener('pointerup', onPointerEnd);
  els.overlayCanvas.addEventListener('pointercancel', onPointerEnd);
  els.overlayCanvas.addEventListener('wheel', (e) => {
    if (!currentImage) return;
    e.preventDefault();
    zoomTo(e.clientX, e.clientY, view.zoom * Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });
  els.overlayCanvas.addEventListener('dblclick', (e) => {
    if (!currentImage) return;
    zoomTo(e.clientX, e.clientY, view.zoom > 1 ? 1 : 2);
  });

  els.scopeTabs.addEventListener('click', (e) => {
    const btn = e.target.closest('.chip-btn');
    if (btn) setScopeView(btn.dataset.scope);
  });

  // Scopes size themselves off their CSS box, so a rotation or a window
  // drag leaves them stretched until they are drawn again.
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (!currentImage) return;
      drawHistogramView();
      drawScopes();
    }, 150);
  });

  els.saveBtn.addEventListener('click', saveToAlbum);
  els.anotherBtn.addEventListener('click', resetWorkspace);

  setScopeView(scopeView); // hides the cells the default tab does not show

  renderPinnedTip();
  window.addEventListener('photowalk:stats-changed', renderPinnedTip);

  setOverlay('thirds');
}

function setOverlay(type) {
  if (!OVERLAY_TYPES.includes(type)) return;
  overlayType = type;
  els.overlaySelect.value = type;
  els.flipGuideBtn.classList.toggle('hidden', !FLIPPABLE_OVERLAYS.includes(type));
  els.rotateGuideBtn.classList.toggle('hidden', !ROTATABLE_OVERLAYS.includes(type));
  renderOverlayTip();
  drawOverlay();
}

/** The concept card text for the active guide — the "why" next to the "what". */
function renderOverlayTip() {
  const concept = CONCEPTS[overlayType];
  els.overlayTipBox.classList.toggle('hidden', !concept);
  if (!concept) return;
  els.overlayTipBox.innerHTML = `
    <p><strong>${escapeHtml(concept.title)}</strong>${escapeHtml(concept.tip)}</p>
    <button type="button" id="overlayTipMoreBtn" class="btn btn-ghost btn-sm">See diagram</button>`;
  document.getElementById('overlayTipMoreBtn').addEventListener('click', () => {
    openModal(`<div class="concept-grid">${renderConceptCard(overlayType)}</div>`);
  });
}

async function handleFile(file) {
  const exifPromise = readExif(file);
  let img;
  try {
    img = await loadImage(await readFileAsDataUrl(file));
  } catch (err) {
    // Safari is the only browser that decodes HEIC, and it's the default
    // format on iPhones — so say which problem this is.
    showToast(await isHeif(file)
      ? "This browser can't open HEIC photos — export the shot as JPEG and try again."
      : 'That file could not be opened as an image.');
    els.exifBlock.innerHTML = '';
    els.input.value = '';
    return;
  }

  await analyzeImage(img, { countStat: true });

  els.exifBlock.innerHTML = '<p class="muted">Reading metadata...</p>';
  const exif = await exifPromise;
  // Guard against a second photo loading while EXIF parsing was in flight.
  if (currentImage === img) {
    currentExif = exif;
    renderExif(exif);
  }
}

/**
 * Loads an image element into the analysis workspace. The public entry point
 * for every path that isn't the file input: shared-room photos, album
 * references, and (via handleFile) fresh uploads.
 */
export async function analyzeImage(img, { exif = null, countStat = false, albumItemId: itemId = null, restore = null } = {}) {
  currentImage = img;
  currentExif = exif;
  albumItemId = itemId;
  exitCompare();

  const scale = Math.min(1, DISPLAY_MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  els.imageCanvas.width = w;
  els.imageCanvas.height = h;
  els.overlayCanvas.width = w;
  els.overlayCanvas.height = h;
  els.stack.style.aspectRatio = `${w} / ${h}`;
  imageCtx.drawImage(img, 0, 0, w, h);

  const sample = drawToCanvas(img, MAX_DIM);
  currentImageData = sample.getContext('2d').getImageData(0, 0, sample.width, sample.height);

  currentHist = computeHistogram(currentImageData);
  avgLuminance = currentHist.avgLum;
  currentPalette = computePalette(currentImageData);
  currentScopes = computeScopes(currentImageData);

  // Reveal before drawing: the histogram and guide-line widths measure the
  // on-screen layout, which is zero while the workspace is display:none.
  els.empty.classList.add('hidden');
  els.workspace.classList.remove('hidden');

  setViewTransform(1, 0, 0);
  lineOffsets = { x: [0, 0], y: [0, 0] };
  if (restore && restore.overlay) {
    const o = restore.overlay;
    if (o.lineOffsets && Array.isArray(o.lineOffsets.x) && Array.isArray(o.lineOffsets.y)) {
      lineOffsets = {
        x: [Number(o.lineOffsets.x[0]) || 0, Number(o.lineOffsets.x[1]) || 0],
        y: [Number(o.lineOffsets.y[0]) || 0, Number(o.lineOffsets.y[1]) || 0]
      };
    }
    overlayFlip = !!o.flip;
    overlayRotation = Number.isInteger(o.rotation) ? ((o.rotation % 4) + 4) % 4 : 0;
    setOverlay(OVERLAY_TYPES.includes(o.type) ? o.type : overlayType);
  } else {
    setOverlay(overlayType); // keep the user's chosen guide across photos
  }

  drawHistogramView();
  drawScopes();
  renderPalette(currentPalette);
  renderExif(exif);

  els.tagsInput.value = restore && restore.tags ? restore.tags.join(', ') : '';
  updateSaveButtonLabel();

  if (countStat) {
    state.profile.photosAnalyzed += 1;
    save();
    window.dispatchEvent(new CustomEvent('photowalk:stats-changed'));
  }
}

/** Analyzes a photo already stored in IndexedDB (room photos, album refs). */
export async function analyzeStoredImage(imageId, opts = {}) {
  const url = await imageUrl(imageId);
  if (!url) {
    showToast('This photo is missing from storage.');
    return false;
  }
  let img;
  try {
    img = await loadImage(url);
  } catch (err) {
    showToast('Could not open this photo.');
    return false;
  }
  await analyzeImage(img, { countStat: false, ...opts });
  return true;
}

/* ---------- Guides: per-line drag, pan & zoom ---------- */

function drawOverlay() {
  drawGuidesOn(overlayCtx, els.overlayCanvas);
  if (compareRef) drawGuidesOn(refOverlayCtx, els.refOverlayCanvas);
}

function drawGuidesOn(ctx, canvas) {
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  if (overlayType === 'none' || !w || !h) return;

  const rect = canvas.getBoundingClientRect();
  const px = rect.width ? w / rect.width : 1; // canvas px per on-screen px

  if (LINE_FRACTIONS[overlayType]) {
    const [a, b] = LINE_FRACTIONS[overlayType];
    const xs = [(a + lineOffsets.x[0]) * w, (b + lineOffsets.x[1]) * w];
    const ys = [(a + lineOffsets.y[0]) * h, (b + lineOffsets.y[1]) * h];
    xs.forEach((x) => drawGuideLine(ctx, x, 0, x, h, px));
    ys.forEach((y) => drawGuideLine(ctx, 0, y, w, y, px));
  } else if (overlayType === 'golden-triangles') {
    drawTriangleGuides(ctx, w, h, px);
  } else {
    drawSpiralGuides(ctx, w, h, px);
  }
}

/**
 * Golden Triangles: the frame diagonal plus true perpendiculars dropped from
 * the two free corners. Computed in pixel space so the right angles survive
 * any aspect ratio; Flip mirrors it into the "Harmonious Triangles" variant.
 */
function drawTriangleGuides(ctx, w, h, px) {
  const A = overlayFlip ? [w, 0] : [0, 0];
  const B = overlayFlip ? [0, h] : [w, h];
  const corners = overlayFlip ? [[0, 0], [w, h]] : [[w, 0], [0, h]];
  drawGuideLine(ctx, A[0], A[1], B[0], B[1], px);
  corners.forEach((P) => {
    const F = perpFoot(P, A, B);
    drawGuideLine(ctx, P[0], P[1], F[0], F[1], px);
  });
}

/** Foot of the perpendicular from point P onto the line through A and B. */
function perpFoot(P, A, B) {
  const dx = B[0] - A[0], dy = B[1] - A[1];
  const t = ((P[0] - A[0]) * dx + (P[1] - A[1]) * dy) / (dx * dx + dy * dy);
  return [A[0] + t * dx, A[1] + t * dy];
}

/**
 * Spiral Section and Golden Spiral share one generator: the classic
 * golden-rectangle subdivision. Section shows only the cut lines; Spiral
 * dims them and draws the quarter-arc spiral on top. Rotate re-anchors the
 * whole pattern a quarter-turn at a time.
 */
function drawSpiralGuides(ctx, w, h, px) {
  const { cuts, spiral } = goldenSpiralGeometry();
  const toPx = ([u, v]) => {
    let p = [u, v];
    for (let i = 0; i < overlayRotation; i++) p = [1 - p[1], p[0]];
    return [p[0] * w, p[1] * h];
  };
  const cutAlpha = overlayType === 'golden-spiral' ? 0.45 : 1;
  cuts.forEach(([x1, y1, x2, y2]) => strokeGuidePath(ctx, [toPx([x1, y1]), toPx([x2, y2])], px, cutAlpha));
  if (overlayType === 'golden-spiral') strokeGuidePath(ctx, spiral.map(toPx), px);
}

/**
 * Subdivides a golden rectangle (left, top, right, bottom, repeating), then
 * squeezes it into the unit square — stretching to the photo's aspect happens
 * when the caller scales by canvas size, matching how other apps fit these
 * overlays. Arcs are polylines so that non-uniform scale is free.
 * @returns {{cuts: number[][], spiral: number[][]}} cut segments [x1,y1,x2,y2]
 *          and the spiral polyline, all in unit-square coordinates.
 */
function goldenSpiralGeometry(turns = 8) {
  const cuts = [];
  const spiral = [];
  let x = 0, y = 0, w = PHI, h = 1;
  for (let i = 0; i < turns; i++) {
    const side = i % 4;
    let s, cx, cy, a0;
    if (side === 0) {
      s = h; cx = x + s; cy = y + s; a0 = Math.PI;
      cuts.push([x + s, y, x + s, y + h]);
      x += s; w -= s;
    } else if (side === 1) {
      s = w; cx = x; cy = y + s; a0 = Math.PI * 1.5;
      cuts.push([x, y + s, x + w, y + s]);
      y += s; h -= s;
    } else if (side === 2) {
      s = h; cx = x + w - s; cy = y; a0 = 0;
      cuts.push([x + w - s, y, x + w - s, y + h]);
      w -= s;
    } else {
      s = w; cx = x + s; cy = y + h - s; a0 = Math.PI * 0.5;
      cuts.push([x, y + h - s, x + w, y + h - s]);
      h -= s;
    }
    for (let k = 0; k <= 24; k++) {
      const a = a0 + (Math.PI / 2) * (k / 24);
      spiral.push([(cx + s * Math.cos(a)) / PHI, cy + s * Math.sin(a)]);
    }
  }
  return {
    cuts: cuts.map(([x1, y1, x2, y2]) => [x1 / PHI, y1, x2 / PHI, y2]),
    spiral
  };
}

// Dark casing + light core so lines read on any photo; widths are given in
// screen pixels so zooming in doesn't fatten the guides.
function drawGuideLine(ctx, x1, y1, x2, y2, px) {
  strokeGuidePath(ctx, [[x1, y1], [x2, y2]], px);
}

function strokeGuidePath(ctx, pts, px, alpha = 1) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.strokeStyle = `rgba(0,0,0,${0.55 * alpha})`;
  ctx.lineWidth = 3 * px;
  ctx.stroke();

  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.strokeStyle = `rgba(255,255,255,${0.9 * alpha})`;
  ctx.lineWidth = 1 * px;
  ctx.stroke();
}

/** Nearest guide line within LINE_HIT_PX of the pointer, or null. */
function hitTestLine(clientX, clientY) {
  const rect = els.overlayCanvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  let best = null;
  LINE_FRACTIONS[overlayType].forEach((f, i) => {
    const dx = Math.abs(clientX - (rect.left + (f + lineOffsets.x[i]) * rect.width));
    if (dx <= LINE_HIT_PX && (!best || dx < best.d)) best = { axis: 'x', idx: i, d: dx };
    const dy = Math.abs(clientY - (rect.top + (f + lineOffsets.y[i]) * rect.height));
    if (dy <= LINE_HIT_PX && (!best || dy < best.d)) best = { axis: 'y', idx: i, d: dy };
  });
  return best;
}

function onPointerDown(e) {
  if (!currentImage) return;
  els.overlayCanvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    gesture = {
      kind: 'pinch',
      startDist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      startZoom: view.zoom
    };
    return;
  }

  const hit = LINE_FRACTIONS[overlayType] ? hitTestLine(e.clientX, e.clientY) : null;
  if (hit) {
    gesture = {
      kind: 'line',
      axis: hit.axis,
      idx: hit.idx,
      startX: e.clientX,
      startY: e.clientY,
      startOffset: lineOffsets[hit.axis][hit.idx]
    };
  } else if (view.zoom > 1) {
    gesture = { kind: 'pan', startX: e.clientX, startY: e.clientY, startPanX: view.panX, startPanY: view.panY };
  } else {
    gesture = null;
  }
}

function onPointerMove(e) {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (gesture && gesture.kind === 'pinch') {
    if (pointers.size < 2) return;
    const [a, b] = [...pointers.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    zoomTo((a.x + b.x) / 2, (a.y + b.y) / 2, gesture.startZoom * (dist / gesture.startDist));
    return;
  }
  if (!gesture) return;

  if (gesture.kind === 'line') {
    const rect = els.overlayCanvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const f = LINE_FRACTIONS[overlayType][gesture.idx];
    const delta = gesture.axis === 'x'
      ? (e.clientX - gesture.startX) / rect.width
      : (e.clientY - gesture.startY) / rect.height;
    // Clamp the line's resulting position, so no guide can leave the frame.
    lineOffsets[gesture.axis][gesture.idx] = clamp(gesture.startOffset + delta, 0.02 - f, 0.98 - f);
    drawOverlay();
  } else if (gesture.kind === 'pan') {
    setViewTransform(
      view.zoom,
      gesture.startPanX + (e.clientX - gesture.startX),
      gesture.startPanY + (e.clientY - gesture.startY)
    );
  }
}

function onPointerEnd(e) {
  pointers.delete(e.pointerId);
  try {
    els.overlayCanvas.releasePointerCapture(e.pointerId);
  } catch (err) { /* capture already gone */ }
  if (!pointers.size || (gesture && gesture.kind === 'pinch' && pointers.size < 2)) gesture = null;
}

/** Zooms about a fixed client-space point, so the pixel under the cursor stays put. */
function zoomTo(clientX, clientY, newZoom) {
  const rect = els.stack.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const px = clientX - rect.left;
  const py = clientY - rect.top;
  const z = clamp(newZoom, 1, ZOOM_MAX);
  const cx = (px - view.panX) / view.zoom;
  const cy = (py - view.panY) / view.zoom;
  setViewTransform(z, px - cx * z, py - cy * z);
}

function setViewTransform(zoom, panX, panY) {
  view.zoom = clamp(zoom, 1, ZOOM_MAX);
  const rect = els.stack.getBoundingClientRect();
  // Pan is clamped so the image always covers the frame.
  view.panX = view.zoom === 1 ? 0 : clamp(panX, rect.width * (1 - view.zoom), 0);
  view.panY = view.zoom === 1 ? 0 : clamp(panY, rect.height * (1 - view.zoom), 0);
  els.inner.style.transform = `translate(${view.panX}px, ${view.panY}px) scale(${view.zoom})`;
  drawOverlay(); // keep guide-line screen width constant across zoom levels
}

/* ---------- Histogram ---------- */

function computeHistogram(imageData) {
  const bins = Array.from({ length: 64 }, () => ({ r: 0, g: 0, b: 0, lum: 0 }));
  const data = imageData.data;
  const totalPixels = imageData.width * imageData.height;
  let lumSum = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    lumSum += lum;
    bins[Math.min(63, (lum / 4) | 0)].lum++;
    bins[Math.min(63, (r / 4) | 0)].r++;
    bins[Math.min(63, (g / 4) | 0)].g++;
    bins[Math.min(63, (b / 4) | 0)].b++;
  }

  return { bins, avgLum: totalPixels ? lumSum / totalPixels : 128 };
}

function drawHistogramView() {
  if (!currentHist) return;
  const summary = histogramSummary(currentHist.bins);
  drawHistogram(els.histogramCanvas, currentHist.bins, summary);
  els.histogramCaption.textContent = summary.caption;
}

function drawHistogram(canvas, bins, summary) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 300;
  const h = canvas.clientHeight || 100;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  // Region bands so the axis reads without prior knowledge.
  const s0 = w * (SHADOW_END / 64);
  const s1 = w * (HIGHLIGHT_START / 64);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(0, 0, s0, h);
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fillRect(s1, 0, w - s1, h);

  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  [s0, s1].forEach((x) => {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  });
  ctx.setLineDash([]);

  const narrow = w < 220; // compare mode halves the canvas — shorten labels
  ctx.font = '600 9px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.textAlign = 'center';
  ctx.fillText(narrow ? 'S' : 'Shadows', s0 / 2, 11);
  ctx.fillText(narrow ? 'M' : 'Mids', (s0 + s1) / 2, 11);
  ctx.fillText(narrow ? 'H' : 'Highlights', (s1 + w) / 2, 11);

  let maxCount = 1;
  bins.forEach((bin) => { maxCount = Math.max(maxCount, bin.r, bin.g, bin.b, bin.lum); });
  const barW = w / bins.length;

  function fillChannel(key, color) {
    ctx.beginPath();
    ctx.moveTo(0, h);
    bins.forEach((bin, i) => ctx.lineTo(i * barW, h - (bin[key] / maxCount) * h));
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  fillChannel('r', 'rgba(255,90,90,0.35)');
  fillChannel('g', 'rgba(90,220,120,0.35)');
  fillChannel('b', 'rgba(90,150,255,0.35)');

  ctx.beginPath();
  bins.forEach((bin, i) => {
    const x = i * barW + barW / 2;
    const y = h - (bin.lum / maxCount) * h;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Clipped edges get a warning bar: detail lost past this line.
  if (summary) {
    ctx.fillStyle = 'rgba(255,170,60,0.9)';
    if (summary.clippedBlack) ctx.fillRect(0, 0, 3, h);
    if (summary.clippedWhite) ctx.fillRect(w - 3, 0, 3, h);
  }
}

/* ---------- Scopes ---------- */

/**
 * Shows one scope at a time, or all four at once the way Resolve's 1/2/4
 * buttons do. Only visible canvases are drawn: a hidden one measures zero
 * wide, which would bake a stretched trace in until the next redraw.
 */
function setScopeView(view) {
  if (view !== 'all' && !SCOPES.some((s) => s.key === view)) return;
  scopeView = view;
  els.scopeTabs.querySelectorAll('.chip-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.scope === view);
  });
  els.scopeGrid.classList.toggle('scope-grid-all', view === 'all');
  for (const entry of els.scopeCells) {
    entry.cell.classList.toggle('hidden', view !== 'all' && entry.key !== view);
  }
  drawScopes();
}

function drawScopes() {
  if (!currentScopes) return;
  for (const entry of els.scopeCells) {
    if (entry.cell.classList.contains('hidden')) continue;
    entry.draw(entry.canvas, currentScopes);
    const reading = entry.read(currentScopes.stats);
    entry.caption.innerHTML = `<strong>${escapeHtml(reading.label)}.</strong> ${escapeHtml(reading.caption)}`;
  }
}

/* ---------- Palette ---------- */

function computePalette(imageData, maxSwatches = 6) {
  const data = imageData.data;
  const quant = 24;
  const buckets = new Map();

  for (let i = 0; i < data.length; i += 8) {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    if (a < 100) continue;
    const key = `${Math.round(r / quant)},${Math.round(g / quant)},${Math.round(b / quant)}`;
    let bucket = buckets.get(key);
    if (!bucket) { bucket = { r: 0, g: 0, b: 0, count: 0 }; buckets.set(key, bucket); }
    bucket.r += r; bucket.g += g; bucket.b += b; bucket.count++;
  }

  const sorted = Array.from(buckets.values())
    .map((b) => ({ r: Math.round(b.r / b.count), g: Math.round(b.g / b.count), b: Math.round(b.b / b.count), count: b.count }))
    .sort((a, b) => b.count - a.count);

  const picked = [];
  for (const c of sorted) {
    if (picked.length >= maxSwatches) break;
    const tooClose = picked.some((p) => Math.abs(p.r - c.r) + Math.abs(p.g - c.g) + Math.abs(p.b - c.b) < 40);
    if (!tooClose) picked.push(c);
  }
  return picked;
}

function renderPalette(palette) {
  els.paletteRow.innerHTML = palette.map((c) => {
    const hex = rgbToHex(c.r, c.g, c.b);
    return `<button type="button" class="swatch" style="background:${hex}" data-hex="${hex}" title="Copy ${hex}">
      <span>${escapeHtml(hex)}</span>
    </button>`;
  }).join('') || '<p class="muted">No colors extracted.</p>';

  if (palette.length) {
    const rel = paletteRelationship(palette);
    els.paletteCaption.innerHTML = `<strong>${escapeHtml(rel.label)}.</strong> ${escapeHtml(rel.caption)}`;
  } else {
    els.paletteCaption.textContent = '';
  }

  els.paletteRow.querySelectorAll('.swatch').forEach((sw) => {
    sw.addEventListener('click', () => {
      const hex = sw.dataset.hex;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(hex).then(() => showToast(`Copied ${hex}`)).catch(() => showToast(hex));
      } else {
        showToast(hex);
      }
    });
  });
}

/* ---------- EXIF ---------- */

function renderExif(exif) {
  if (!exif) {
    els.exifBlock.innerHTML = '<p class="muted">No EXIF metadata found in this file. Screenshots, downloads, and messaging-app copies usually strip this data — a known limitation for reference libraries.</p>';
    return;
  }
  const rows = exifRows(exif);
  els.exifBlock.innerHTML = rows.length
    ? `<dl class="exif-list">${rows.join('')}</dl>`
    : '<p class="muted">An EXIF block was found, but it did not contain the fields PhotoWalk reads.</p>';
}

/** Shared by the analysis pane and the album detail sheet. */
export function exifRows(exif) {
  if (!exif) return [];
  const rows = [
    ['Camera', [exif.make, exif.model].filter(Boolean).join(' ')],
    ['Aperture', exif.aperture],
    ['Shutter', exif.shutter],
    ['ISO', exif.iso],
    ['Focal length', exif.focalLength],
    ['Date taken', exif.dateTaken]
  ].filter(([, v]) => v)
    .map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`);

  if (exif.lat != null && exif.lon != null) {
    const label = formatCoords(exif.lat, exif.lon);
    const href = `https://www.openstreetmap.org/?mlat=${exif.lat}&mlon=${exif.lon}#map=15/${exif.lat}/${exif.lon}`;
    rows.push(`<dt>Location</dt><dd><a class="exif-link" href="${escapeHtml(href)}" `
      + `target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a></dd>`);
  }
  return rows;
}

/* ---------- Pinned walk-theme tip ---------- */

/** After a walk, pin its theme tips here so analysis becomes the post-walk ritual. */
function renderPinnedTip() {
  const lastWalk = state.lastWalk;
  const fresh = lastWalk && !lastWalk.tipDismissed && Date.now() - lastWalk.endedAt < 24 * 3600000;
  const theme = fresh ? THEMES.find((t) => t.id === lastWalk.themeId) : null;
  els.pinnedTip.classList.toggle('hidden', !theme);
  if (!theme) return;

  const tips = theme.concepts
    .map((key) => CONCEPTS[key])
    .filter(Boolean)
    .map((c) => `<p class="pinned-tip-line"><strong>${escapeHtml(c.title)}:</strong> ${escapeHtml(c.tip)}</p>`)
    .join('');

  els.pinnedTip.innerHTML = `
    <p class="pinned-tip-head">Today's walk theme: <strong>${escapeHtml(theme.title)}</strong> — check your shots against it.</p>
    ${tips}
    <button type="button" id="dismissPinnedTipBtn" class="btn btn-ghost btn-sm">Dismiss</button>`;

  document.getElementById('dismissPinnedTipBtn').addEventListener('click', () => {
    state.lastWalk.tipDismissed = true;
    save();
    els.pinnedTip.classList.add('hidden');
  });
}

/* ---------- Comparison mode ---------- */

function openComparePicker() {
  const candidates = state.album.filter((item) => item.id !== albumItemId && item.imageId);
  if (!candidates.length) {
    showToast('Save a reference to your album first, then compare against it.');
    return;
  }

  openModal(`
    <h3>Compare with a reference</h3>
    <p class="muted">Same guides on both, both histograms — study what their frame does that yours doesn't.</p>
    <div class="album-grid compare-pick-grid" id="comparePickGrid">
      ${candidates.map((item) => `
        <button type="button" class="album-thumb" data-id="${escapeHtml(item.id)}" data-image="${escapeHtml(item.imageId)}">
          <span class="album-thumb-tag">${escapeHtml(item.aspectLabel || '')}</span>
        </button>`).join('')}
    </div>
  `);

  const grid = document.getElementById('comparePickGrid');
  hydrateImages(grid);
  grid.querySelectorAll('.album-thumb').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = state.album.find((i) => i.id === btn.dataset.id);
      closeModal();
      if (item) enterCompare(item);
    });
  });
}

async function enterCompare(item) {
  const url = await imageUrl(item.imageId);
  if (!url) {
    showToast('This reference is missing from storage.');
    return;
  }
  let img;
  try {
    img = await loadImage(url);
  } catch (err) {
    showToast('Could not open that reference.');
    return;
  }

  const scale = Math.min(1, DISPLAY_MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  els.refImageCanvas.width = w;
  els.refImageCanvas.height = h;
  els.refOverlayCanvas.width = w;
  els.refOverlayCanvas.height = h;
  els.refStack.style.aspectRatio = `${w} / ${h}`;
  refImageCtx.drawImage(img, 0, 0, w, h);

  const sample = drawToCanvas(img, MAX_DIM);
  const data = sample.getContext('2d').getImageData(0, 0, sample.width, sample.height);
  compareRef = { item, hist: computeHistogram(data) };

  els.workspace.classList.add('comparing');
  els.refPane.classList.remove('hidden');
  els.refHistBlock.classList.remove('hidden');
  els.compareBtn.classList.add('hidden');
  els.exitCompareBtn.classList.remove('hidden');

  // The two-column layout resized every canvas — re-render what measures itself.
  const refSummary = histogramSummary(compareRef.hist.bins);
  drawHistogram(els.refHistogramCanvas, compareRef.hist.bins, refSummary);
  els.refHistogramCaption.textContent = refSummary.caption;
  drawHistogramView();
  drawScopes();
  drawOverlay();
}

function exitCompare() {
  const wasComparing = !!compareRef;
  compareRef = null;
  els.workspace.classList.remove('comparing');
  els.refPane.classList.add('hidden');
  els.refHistBlock.classList.add('hidden');
  els.compareBtn.classList.remove('hidden');
  els.exitCompareBtn.classList.add('hidden');
  if (wasComparing) {
    drawHistogramView();
    drawScopes();
    drawOverlay();
  }
}

/* ---------- Save / reset ---------- */

function updateSaveButtonLabel() {
  els.saveBtn.textContent = albumItemId ? 'Update Reference' : 'Save to Album';
}

function overlaySnapshot() {
  return {
    type: overlayType,
    flip: overlayFlip,
    rotation: overlayRotation,
    lineOffsets: { x: [...lineOffsets.x], y: [...lineOffsets.y] }
  };
}

async function saveToAlbum() {
  if (!currentImageData || !currentImage) return;
  const tags = els.tagsInput.value.split(',').map((t) => t.trim()).filter(Boolean);

  // Re-analyzing a saved reference updates it in place rather than duplicating.
  if (albumItemId) {
    const item = state.album.find((i) => i.id === albumItemId);
    if (item) {
      item.tags = tags;
      item.overlay = overlaySnapshot();
      save();
      showToast('Reference updated.');
      window.dispatchEvent(new CustomEvent('photowalk:stats-changed'));
      return;
    }
    albumItemId = null; // it was deleted while open — save as a new reference
    updateSaveButtonLabel();
  }

  const w = els.imageCanvas.width, h = els.imageCanvas.height;
  const aspect = w / h;
  const aspectLabel = aspect > 1.15 ? 'Landscape' : aspect < 0.87 ? 'Portrait' : 'Square';
  const brightnessLabel = avgLuminance > 170 ? 'Bright' : avgLuminance < 85 ? 'Dark' : 'Balanced';
  const colors = currentPalette.slice(0, 5).map((c) => rgbToHex(c.r, c.g, c.b));
  const colorName = currentPalette[0] ? nearestColorName(currentPalette[0].r, currentPalette[0].g, currentPalette[0].b) : 'Neutral';
  const exif = currentExif;

  els.saveBtn.disabled = true;
  try {
    const full = drawToCanvas(currentImage, ALBUM_MAX_DIM);
    const imageId = uid();
    await putImage(imageId, await canvasToBlob(full, 'image/jpeg', 0.85));

    state.album.unshift({
      id: uid(),
      imageId,
      width: full.width,
      height: full.height,
      aspectLabel,
      brightnessLabel,
      colorName,
      colors,
      tags,
      overlay: overlaySnapshot(),
      themeId: state.activeWalk ? state.activeWalk.themeId : null,
      exif,
      focalLabel: focalBucket(exif && exif.focalMm),
      apertureLabel: apertureBucket(exif && exif.fNumber),
      hasLocation: !!(exif && exif.lat != null && exif.lon != null),
      savedAt: Date.now()
    });
    save();
    window.dispatchEvent(new CustomEvent('photowalk:stats-changed'));
    els.tagsInput.value = '';
    showToast('Saved to your Reference Album.');
    warnIfStorageTight();
  } catch (err) {
    console.warn('PhotoWalk: could not save reference.', err);
    showToast('Could not save this reference — your device may be out of storage.');
  } finally {
    els.saveBtn.disabled = false;
  }
}

function resetWorkspace() {
  currentExif = null;
  currentImage = null;
  currentImageData = null;
  currentPalette = [];
  currentHist = null;
  currentScopes = null;
  albumItemId = null;
  exitCompare();
  lineOffsets = { x: [0, 0], y: [0, 0] };
  setViewTransform(1, 0, 0);
  setOverlay('thirds');
  els.tagsInput.value = '';
  updateSaveButtonLabel();
  els.input.value = '';
  els.workspace.classList.add('hidden');
  els.empty.classList.remove('hidden');
}
