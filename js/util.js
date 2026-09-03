export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

export function uid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * Asks app.js to switch views. A window event (matching the existing
 * `photowalk:stats-changed` bus) rather than an export, because app.js sits at
 * the top of the import graph and importing it back would create a cycle.
 */
export function navigateTo(view) {
  window.dispatchEvent(new CustomEvent('photowalk:navigate', { detail: { view } }));
}

export function roomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function formatDate(isoOrMs) {
  const d = new Date(isoOrMs);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatTime(isoOrMs) {
  const d = new Date(isoOrMs);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** Hours are the app's unit of progress, so they read the same everywhere: 2h, 2.5h, 45m. */
export function formatHours(hours) {
  const h = Math.max(0, hours || 0);
  if (h > 0 && h < 1) {
    // Guard the boundary: 0.999h rounds to 60 minutes, which should read "1h".
    const mins = Math.round(h * 60);
    if (mins < 60) return Math.max(1, mins) + 'm';
  }
  const rounded = Math.round(h * 10) / 10;
  return (Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)) + 'h';
}

/** Local (not UTC) YYYY-MM-DD key, so a day boundary matches the user's own clock. */
export function localDateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Decodes a base64 data URL into a Blob, for moving legacy photos into IndexedDB. */
export function dataUrlToBlob(dataUrl) {
  const [header, body] = String(dataUrl).split(',');
  if (!body || !header.includes(';base64')) throw new Error('Not a base64 data URL');
  const mime = (header.match(/:(.*?);/) || [, 'image/jpeg'])[1];
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export function canvasToBlob(canvas, type = 'image/jpeg', quality = 0.85) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode canvas'))),
      type,
      quality
    );
  });
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode image'));
    img.src = src;
  });
}

/** Draws an image onto a fresh canvas, capping the longest side at maxDim. */
export function drawToCanvas(img, maxDim) {
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
  const w = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
  const h = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(img, 0, 0, w, h);
  return canvas;
}

export function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
}

export function rgbToHsl(r, g, b) {
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

const HUE_NAMES = [
  [15, 'Red'], [45, 'Orange'], [70, 'Yellow'], [170, 'Green'],
  [200, 'Teal'], [255, 'Blue'], [290, 'Purple'], [330, 'Pink'], [360, 'Red']
];

/** Buckets a focal length into the categories the album filters by. */
export function focalBucket(mm) {
  if (!mm || !Number.isFinite(mm)) return null;
  if (mm < 35) return 'Wide';
  if (mm <= 70) return 'Normal';
  return 'Tele';
}

/** Buckets an f-number by how much of the frame stays sharp. */
export function apertureBucket(fNumber) {
  if (!fNumber || !Number.isFinite(fNumber)) return null;
  if (fNumber <= 2.8) return 'Fast';
  if (fNumber <= 8) return 'Mid';
  return 'Deep';
}

export function formatCoords(lat, lon) {
  const fmt = (v, pos, neg) => `${Math.abs(v).toFixed(5)}° ${v >= 0 ? pos : neg}`;
  return `${fmt(lat, 'N', 'S')}, ${fmt(lon, 'E', 'W')}`;
}

export function nearestColorName(r, g, b) {
  const { h, s, l } = rgbToHsl(r, g, b);
  if (l < 0.12) return 'Black';
  if (l > 0.92 && s < 0.15) return 'White';
  if (s < 0.14) return 'Neutral';
  for (const [max, name] of HUE_NAMES) {
    if (h <= max) return name;
  }
  return 'Neutral';
}
