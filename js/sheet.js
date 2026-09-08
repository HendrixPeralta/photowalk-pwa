/**
 * Study-sheet export.
 *
 * Renders a contact-sheet-style summary to a canvas and downloads it as a JPEG.
 * A real PDF would mean shipping a PDF library for one button; a 1400px JPEG
 * drops straight into a notes app, a print, or a message to whoever you walked
 * with, which is what the sheet is for.
 */

import { showToast } from './toast.js';
import { canvasToBlob, loadImage } from './util.js';

const W = 1400;
const PAD = 56;
const INK = '#e2e2e9';
const DIM = '#9ca3af';
const AMBER = '#f59e0b';
const BG = '#111318';
const PANEL = '#1a1b21';
const HAIRLINE = '#2a2e39';

const mono = (size, weight = 500) => `${weight} ${size}px "JetBrains Mono", ui-monospace, monospace`;
const display = (size, weight = 600) => `${weight} ${size}px "Space Grotesk", system-ui, sans-serif`;
const body = (size, weight = 400) => `${weight} ${size}px "Hanken Grotesk", system-ui, sans-serif`;

/** Draws wrapped text and returns the y coordinate just below it. */
function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  let line = '';
  let cursor = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, cursor);
      cursor += lineHeight;
      line = word;
    } else {
      line = test;
    }
  }
  if (line) { ctx.fillText(line, x, cursor); cursor += lineHeight; }
  return cursor;
}

function capsLabel(ctx, text, x, y) {
  ctx.font = display(18, 700);
  ctx.fillStyle = DIM;
  ctx.fillText(String(text).toUpperCase(), x, y);
  return y + 26;
}

function hairline(ctx, y, width) {
  ctx.strokeStyle = HAIRLINE;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PAD, y + 0.5);
  ctx.lineTo(PAD + width, y + 0.5);
  ctx.stroke();
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser a moment to start the download before dropping the blob.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * Analysis breakdown: the frame with its guides burnt in, plus the tonal,
 * colour and EXIF readouts.
 *
 * @param {object} spec
 * @param {HTMLCanvasElement} spec.imageCanvas  the analysed photo
 * @param {HTMLCanvasElement} spec.overlayCanvas guides drawn on top (optional)
 * @param {HTMLCanvasElement} spec.histogramCanvas
 * @param {{hex:string, share:number, role:string}[]} spec.clusters
 * @param {string} spec.tonalTitle
 * @param {string} spec.tonalText
 * @param {string} spec.harmony
 * @param {string} spec.takeaway
 * @param {[string,string][]} spec.exifRows
 */
export async function exportBreakdownSheet(spec) {
  const canvas = document.createElement('canvas');
  const inner = W - PAD * 2;

  // Cap the frame's height so a tall portrait doesn't push the readouts off
  // the bottom of a sheet someone is going to read side by side with it.
  const MAX_PHOTO_H = 760;
  const natural = spec.imageCanvas.height / spec.imageCanvas.width;
  const photoH = Math.min(MAX_PHOTO_H, Math.round(inner * natural));
  const photoW = Math.round(photoH / natural);
  const photoX = PAD + Math.round((inner - photoW) / 2);
  const height = PAD + 120 + photoH + 640;

  canvas.width = W;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, height);

  let y = PAD + 34;
  ctx.textBaseline = 'alphabetic';
  ctx.font = display(20, 700);
  ctx.fillStyle = AMBER;
  ctx.fillText('P H O T O W A L K', PAD, y);
  ctx.font = display(40, 600);
  ctx.fillStyle = INK;
  y += 48;
  ctx.fillText('Frame breakdown', PAD, y);
  ctx.font = mono(18, 400);
  ctx.fillStyle = DIM;
  ctx.textAlign = 'right';
  ctx.fillText(new Date().toLocaleString(), W - PAD, y);
  ctx.textAlign = 'left';
  y += 24;
  hairline(ctx, y, inner);
  y += 30;

  ctx.drawImage(spec.imageCanvas, photoX, y, photoW, photoH);
  if (spec.overlayCanvas) ctx.drawImage(spec.overlayCanvas, photoX, y, photoW, photoH);
  ctx.strokeStyle = HAIRLINE;
  ctx.lineWidth = 2;
  ctx.strokeRect(photoX, y, photoW, photoH);
  y += photoH + 44;

  // Left column: tonal readout with the histogram. Right column: EXIF.
  const colW = (inner - 40) / 2;
  const colTop = y;

  y = capsLabel(ctx, 'Luminance spectrum', PAD, y);
  if (spec.histogramCanvas) {
    const hh = 150;
    ctx.fillStyle = PANEL;
    ctx.fillRect(PAD, y, colW, hh);
    ctx.drawImage(spec.histogramCanvas, PAD, y, colW, hh);
    ctx.strokeStyle = HAIRLINE;
    ctx.strokeRect(PAD, y, colW, hh);
    y += hh + 26;
  }
  ctx.font = display(24, 600);
  ctx.fillStyle = INK;
  ctx.fillText(spec.tonalTitle || '', PAD, y);
  y += 28;
  ctx.font = body(19);
  ctx.fillStyle = DIM;
  y = wrapText(ctx, spec.tonalText, PAD, y, colW, 27);

  const leftBottom = y;

  // Right column.
  const rx = PAD + colW + 40;
  let ry = capsLabel(ctx, 'Optical payload', rx, colTop);
  ctx.font = mono(19, 500);
  for (const [label, value] of spec.exifRows || []) {
    ctx.fillStyle = DIM;
    ctx.fillText(String(label), rx, ry);
    ctx.fillStyle = INK;
    ctx.fillText(String(value), rx + 200, ry);
    ry += 30;
  }
  if (!spec.exifRows || !spec.exifRows.length) {
    ctx.fillStyle = DIM;
    ctx.font = body(19);
    ry = wrapText(ctx, 'No EXIF metadata in this file.', rx, ry, colW, 27);
  }

  ry += 20;
  ry = capsLabel(ctx, 'Colour gamut', rx, ry);
  if (spec.harmony) {
    ctx.font = display(22, 600);
    ctx.fillStyle = AMBER;
    ctx.fillText(spec.harmony, rx, ry);
    ry += 30;
  }
  const clusters = spec.clusters || [];
  if (clusters.length) {
    const barH = 34;
    let cx = rx;
    for (const c of clusters) {
      const cw = Math.max(2, colW * c.share);
      ctx.fillStyle = c.hex;
      ctx.fillRect(cx, ry, cw, barH);
      cx += cw;
    }
    ctx.strokeStyle = HAIRLINE;
    ctx.strokeRect(rx, ry, colW, barH);
    ry += barH + 26;
    ctx.font = mono(17, 500);
    for (const c of clusters) {
      ctx.fillStyle = c.hex;
      ctx.fillRect(rx, ry - 13, 15, 15);
      ctx.fillStyle = INK;
      ctx.fillText(c.hex.toUpperCase(), rx + 26, ry);
      ctx.fillStyle = DIM;
      ctx.fillText(`${Math.round(c.share * 100)}% ${c.role}`, rx + 160, ry);
      ry += 26;
    }
  }

  y = Math.max(leftBottom, ry) + 24;
  if (spec.takeaway) {
    hairline(ctx, y, inner);
    y += 34;
    y = capsLabel(ctx, 'Analysis takeaway', PAD, y);
    ctx.font = body(21);
    ctx.fillStyle = INK;
    y = wrapText(ctx, spec.takeaway, PAD, y, inner, 30);
  }

  await finish(canvas, y, 'photowalk-breakdown');
}

/**
 * Partner study sheet: two frames side by side with their EXIF, the walk's
 * challenge prompt, and the critique thread.
 */
export async function exportStudySheet(spec) {
  const canvas = document.createElement('canvas');
  const inner = W - PAD * 2;
  const gap = 32;
  const paneW = Math.floor((inner - gap) / 2);
  const paneH = Math.round(paneW * 1.25);

  canvas.width = W;
  canvas.height = PAD + 200 + paneH + 200 + Math.max(1, (spec.notes || []).length) * 130;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, canvas.height);

  let y = PAD + 34;
  ctx.font = display(20, 700);
  ctx.fillStyle = AMBER;
  ctx.fillText('P H O T O W A L K   ·   D E B R I E F', PAD, y);
  y += 50;
  ctx.font = display(40, 600);
  ctx.fillStyle = INK;
  ctx.fillText(spec.title || 'Side-by-side study', PAD, y);
  y += 30;
  ctx.font = body(20);
  ctx.fillStyle = DIM;
  y = wrapText(ctx, spec.subtitle || '', PAD, y, inner, 28);
  y += 8;
  hairline(ctx, y, inner);
  y += 32;

  const images = await Promise.all((spec.panes || []).slice(0, 2).map(async (p) => {
    try { return { ...p, img: await loadImage(p.src) }; } catch (err) { return { ...p, img: null }; }
  }));

  images.forEach((pane, i) => {
    const px = PAD + i * (paneW + gap);
    ctx.fillStyle = PANEL;
    ctx.fillRect(px, y, paneW, paneH);
    if (pane.img) {
      // Cover-fit, so neither frame is letterboxed against the other.
      const scale = Math.max(paneW / pane.img.naturalWidth, paneH / pane.img.naturalHeight);
      const dw = pane.img.naturalWidth * scale;
      const dh = pane.img.naturalHeight * scale;
      ctx.save();
      ctx.beginPath();
      ctx.rect(px, y, paneW, paneH);
      ctx.clip();
      ctx.drawImage(pane.img, px + (paneW - dw) / 2, y + (paneH - dh) / 2, dw, dh);
      ctx.restore();
    }
    ctx.strokeStyle = HAIRLINE;
    ctx.lineWidth = 2;
    ctx.strokeRect(px, y, paneW, paneH);

    ctx.font = mono(20, 600);
    ctx.fillStyle = AMBER;
    ctx.fillText(pane.who || '', px + 14, y + 34);

    ctx.font = mono(18, 500);
    ctx.fillStyle = INK;
    ctx.fillText(pane.exposure || 'no EXIF', px + 14, y + paneH + 30);
    ctx.fillStyle = DIM;
    ctx.fillText(pane.detail || '', px + 14, y + paneH + 56);
  });

  y += paneH + 90;
  hairline(ctx, y, inner);
  y += 34;
  y = capsLabel(ctx, 'Technical critique', PAD, y);

  for (const note of spec.notes || []) {
    ctx.font = mono(17, 600);
    ctx.fillStyle = AMBER;
    ctx.fillText(`${(note.author || 'partner').toUpperCase()} · ${note.when || ''}`, PAD, y);
    y += 28;
    ctx.font = body(20);
    ctx.fillStyle = INK;
    y = wrapText(ctx, note.text, PAD, y, inner, 28) + 16;
  }
  if (!spec.notes || !spec.notes.length) {
    ctx.font = body(20);
    ctx.fillStyle = DIM;
    y = wrapText(ctx, 'No critique notes on this debrief yet.', PAD, y, inner, 28);
  }

  await finish(canvas, y, 'photowalk-study-sheet');
}

/** Trims the canvas to the content height, encodes it, and starts the download. */
async function finish(canvas, contentBottom, name) {
  const height = Math.round(contentBottom + PAD);
  const out = document.createElement('canvas');
  out.width = canvas.width;
  out.height = height;
  const ctx = out.getContext('2d');
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, out.width, height);
  ctx.drawImage(canvas, 0, 0);

  try {
    const blob = await canvasToBlob(out, 'image/jpeg', 0.92);
    download(blob, `${name}-${new Date().toISOString().slice(0, 10)}.jpg`);
    showToast('Study sheet downloaded.');
  } catch (err) {
    console.warn('PhotoWalk: could not build the sheet.', err);
    showToast('Could not build the sheet on this device.');
  }
}
