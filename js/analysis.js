import { state, save } from './store.js';
import { readExif } from './exif.js';
import { showToast } from './toast.js';
import { escapeHtml, uid, clamp, loadImage, readFileAsDataUrl, rgbToHex, nearestColorName } from './util.js';

const MAX_DIM = 640;
const LINE_FRACTIONS = {
  thirds: [1 / 3, 2 / 3],
  golden: [0.382, 0.618]
};

let els = {};
let overlayType = 'thirds';
let dragOffset = { x: 0, y: 0 };
let dragging = false;
let dragStart = { x: 0, y: 0 };
let dragStartOffset = { x: 0, y: 0 };

let imageCtx = null;
let overlayCtx = null;
let currentImageData = null;
let currentExif = null;
let currentPalette = [];
let avgLuminance = 128;

export function initAnalysis() {
  els = {
    input: document.getElementById('photoInput'),
    chooseBtn: document.getElementById('choosePhotoBtn'),
    empty: document.getElementById('analyzeEmpty'),
    workspace: document.getElementById('analyzeWorkspace'),
    stack: document.getElementById('canvasStack'),
    imageCanvas: document.getElementById('imageCanvas'),
    overlayCanvas: document.getElementById('overlayCanvas'),
    ovNone: document.getElementById('ovNoneBtn'),
    ovThirds: document.getElementById('ovThirdsBtn'),
    ovGolden: document.getElementById('ovGoldenBtn'),
    resetGrid: document.getElementById('resetGridBtn'),
    histogramCanvas: document.getElementById('histogramCanvas'),
    paletteRow: document.getElementById('paletteRow'),
    exifBlock: document.getElementById('exifBlock'),
    tagsInput: document.getElementById('tagsInput'),
    saveBtn: document.getElementById('saveToAlbumBtn'),
    anotherBtn: document.getElementById('chooseAnotherBtn')
  };

  imageCtx = els.imageCanvas.getContext('2d', { willReadFrequently: true });
  overlayCtx = els.overlayCanvas.getContext('2d');

  els.chooseBtn.addEventListener('click', () => els.input.click());
  els.input.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) handleFile(file);
  });

  els.ovNone.addEventListener('click', () => setOverlay('none'));
  els.ovThirds.addEventListener('click', () => setOverlay('thirds'));
  els.ovGolden.addEventListener('click', () => setOverlay('golden'));
  els.resetGrid.addEventListener('click', () => { dragOffset = { x: 0, y: 0 }; drawOverlay(); });

  els.overlayCanvas.addEventListener('pointerdown', (e) => {
    if (overlayType === 'none') return;
    dragging = true;
    els.overlayCanvas.setPointerCapture(e.pointerId);
    dragStart = { x: e.clientX, y: e.clientY };
    dragStartOffset = { ...dragOffset };
  });
  els.overlayCanvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const rect = els.overlayCanvas.getBoundingClientRect();
    const dx = (e.clientX - dragStart.x) / rect.width;
    const dy = (e.clientY - dragStart.y) / rect.height;
    dragOffset = { x: clamp(dragStartOffset.x + dx, -0.2, 0.2), y: clamp(dragStartOffset.y + dy, -0.2, 0.2) };
    drawOverlay();
  });
  window.addEventListener('pointerup', () => { dragging = false; });

  els.saveBtn.addEventListener('click', saveToAlbum);
  els.anotherBtn.addEventListener('click', resetWorkspace);

  setOverlay('thirds');
}

function setOverlay(type) {
  overlayType = type;
  [els.ovNone, els.ovThirds, els.ovGolden].forEach((btn) => btn.classList.remove('active'));
  ({ none: els.ovNone, thirds: els.ovThirds, golden: els.ovGolden })[type].classList.add('active');
  drawOverlay();
}

async function handleFile(file) {
  currentExif = null;
  els.exifBlock.innerHTML = '<p class="muted">Reading metadata...</p>';

  const exifPromise = readExif(file);
  const dataUrl = await readFileAsDataUrl(file);
  const img = await loadImage(dataUrl);

  const scale = Math.min(1, MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  els.imageCanvas.width = w;
  els.imageCanvas.height = h;
  els.overlayCanvas.width = w;
  els.overlayCanvas.height = h;
  els.stack.style.aspectRatio = `${w} / ${h}`;
  imageCtx.drawImage(img, 0, 0, w, h);

  currentImageData = imageCtx.getImageData(0, 0, w, h);
  const hist = computeHistogram(currentImageData);
  avgLuminance = hist.avgLum;
  drawHistogram(hist.bins);

  currentPalette = computePalette(currentImageData);
  renderPalette(currentPalette);

  dragOffset = { x: 0, y: 0 };
  drawOverlay();

  els.empty.classList.add('hidden');
  els.workspace.classList.remove('hidden');

  state.profile.photosAnalyzed += 1;
  save();
  window.dispatchEvent(new CustomEvent('photowalk:stats-changed'));

  currentExif = await exifPromise;
  renderExif(currentExif);
}

function drawOverlay() {
  const w = els.overlayCanvas.width;
  const h = els.overlayCanvas.height;
  overlayCtx.clearRect(0, 0, w, h);
  if (overlayType === 'none') return;

  const [a, b] = LINE_FRACTIONS[overlayType];
  const xs = [a + dragOffset.x, b + dragOffset.x].map((f) => f * w);
  const ys = [a + dragOffset.y, b + dragOffset.y].map((f) => f * h);

  xs.forEach((x) => drawGuideLine(0, x, 0, x, h));
  ys.forEach((y) => drawGuideLine(1, 0, y, w, y));
}

function drawGuideLine(_axis, x1, y1, x2, y2) {
  overlayCtx.beginPath();
  overlayCtx.moveTo(x1, y1);
  overlayCtx.lineTo(x2, y2);
  overlayCtx.strokeStyle = 'rgba(0,0,0,0.55)';
  overlayCtx.lineWidth = 3;
  overlayCtx.stroke();

  overlayCtx.beginPath();
  overlayCtx.moveTo(x1, y1);
  overlayCtx.lineTo(x2, y2);
  overlayCtx.strokeStyle = 'rgba(255,255,255,0.9)';
  overlayCtx.lineWidth = 1;
  overlayCtx.stroke();
}

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

function drawHistogram(bins) {
  const canvas = els.histogramCanvas;
  const w = canvas.width, h = canvas.height;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);

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
}

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

function renderExif(exif) {
  if (!exif) {
    els.exifBlock.innerHTML = '<p class="muted">No EXIF metadata found in this file. Screenshots, downloads, and messaging-app copies usually strip this data — a known limitation for reference libraries.</p>';
    return;
  }
  const rows = [
    ['Camera', [exif.make, exif.model].filter(Boolean).join(' ')],
    ['Aperture', exif.aperture],
    ['Shutter', exif.shutter],
    ['ISO', exif.iso],
    ['Focal length', exif.focalLength],
    ['Date taken', exif.dateTaken]
  ].filter(([, v]) => v);

  els.exifBlock.innerHTML = rows.length
    ? `<dl class="exif-list">${rows.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`).join('')}</dl>`
    : '<p class="muted">An EXIF block was found, but it did not contain the fields PhotoWalk reads.</p>';
}

function saveToAlbum() {
  if (!currentImageData) return;
  const w = els.imageCanvas.width, h = els.imageCanvas.height;
  const aspect = w / h;
  const aspectLabel = aspect > 1.15 ? 'Landscape' : aspect < 0.87 ? 'Portrait' : 'Square';
  const brightnessLabel = avgLuminance > 170 ? 'Bright' : avgLuminance < 85 ? 'Dark' : 'Balanced';
  const tags = els.tagsInput.value.split(',').map((t) => t.trim()).filter(Boolean);
  const colors = currentPalette.slice(0, 5).map((c) => rgbToHex(c.r, c.g, c.b));
  const colorName = currentPalette[0] ? nearestColorName(currentPalette[0].r, currentPalette[0].g, currentPalette[0].b) : 'Neutral';

  state.album.unshift({
    id: uid(),
    dataUrl: els.imageCanvas.toDataURL('image/jpeg', 0.85),
    width: w,
    height: h,
    aspectLabel,
    brightnessLabel,
    colorName,
    colors,
    tags,
    exif: currentExif,
    savedAt: Date.now()
  });
  save();
  window.dispatchEvent(new CustomEvent('photowalk:stats-changed'));
  els.tagsInput.value = '';
  showToast('Saved to your Reference Album.');
}

function resetWorkspace() {
  currentExif = null;
  currentImageData = null;
  currentPalette = [];
  els.input.value = '';
  els.workspace.classList.add('hidden');
  els.empty.classList.remove('hidden');
}
