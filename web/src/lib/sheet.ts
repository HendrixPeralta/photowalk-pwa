/**
 * Study-sheet export.
 *
 * Renders a contact-sheet-style summary to a canvas and downloads it as a
 * JPEG. A real PDF would mean shipping a PDF library for one button; a 1400px
 * JPEG drops straight into a notes app, a print, or a message to whoever you
 * walked with, which is what the sheet is for. Browser-only.
 */

import type { GamutCluster, GamutRole } from "./deconstruct";
import type { ExifRow } from "./analysis/album";
import { getDateLocale, t } from "./i18n/core";
import { canvasToBlob, loadImage } from "./image";

type Ctx = CanvasRenderingContext2D;

const W = 1400;
const PAD = 56;
const INK = "#e2e2e9";
const DIM = "#9ca3af";
const AMBER = "#f59e0b";
const BG = "#111318";
const PANEL = "#1a1b21";
const HAIRLINE = "#2a2e39";

/**
 * The page's font stack for a role. next/font self-hosts the fonts under
 * generated family names, so the sheet asks the page instead of hard-coding
 * "Space Grotesk"; canvas text in a family the page never loaded would fall
 * back silently.
 */
function family(cssVar: "--font-display" | "--font-body" | "--font-data", fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
  return value || fallback;
}

const mono = (size: number, weight = 500) => `${weight} ${size}px ${family("--font-data", "ui-monospace, monospace")}`;
const display = (size: number, weight = 600) => `${weight} ${size}px ${family("--font-display", "system-ui, sans-serif")}`;
const body = (size: number, weight = 400) => `${weight} ${size}px ${family("--font-body", "system-ui, sans-serif")}`;

// Japanese has no spaces between words, so every CJK character is its own
// break point. Closing punctuation is kept off the start of a line.
const CJK = "　-ヿ㐀-鿿＀-￯";
const TOKEN = new RegExp(`\\s+|[${CJK}]|[^\\s${CJK}]+`, "g");
const NO_LINE_START = /^[、。，．）」』！？：・ー]$/;

/** Splits text into the tokens line wrapping may break between. Exported for tests. */
export function wrapTokens(text: string): string[] {
  return String(text || "").match(TOKEN) || [];
}

/** Draws wrapped text and returns the y coordinate just below it. */
function wrapText(ctx: Ctx, text: string, x: number, y: number, maxWidth: number, lineHeight: number): number {
  let line = "";
  let pendingSpace = false;
  let cursor = y;
  for (const token of wrapTokens(text)) {
    if (/^\s+$/.test(token)) { pendingSpace = !!line; continue; }
    const test = line + (pendingSpace ? " " : "") + token;
    pendingSpace = false;
    if (ctx.measureText(test).width > maxWidth && line && !NO_LINE_START.test(token)) {
      ctx.fillText(line, x, cursor);
      cursor += lineHeight;
      line = token;
    } else {
      line = test;
    }
  }
  if (line) { ctx.fillText(line, x, cursor); cursor += lineHeight; }
  return cursor;
}

function capsLabel(ctx: Ctx, text: string, x: number, y: number): number {
  ctx.font = display(18, 700);
  ctx.fillStyle = DIM;
  ctx.fillText(String(text).toUpperCase(), x, y);
  return y + 26;
}

function hairline(ctx: Ctx, y: number, width: number): void {
  ctx.strokeStyle = HAIRLINE;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PAD, y + 0.5);
  ctx.lineTo(PAD + width, y + 0.5);
  ctx.stroke();
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser a moment to start the download before dropping the blob.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function roleWord(role: GamutRole): string {
  switch (role) {
    case "DOM": return t("DOM");
    case "SPEC": return t("SPEC");
    case "BLACK": return t("BLACK");
    case "BASE": return t("BASE");
    case "RIM": return t("RIM");
    case "WARM": return t("WARM");
    case "COOL": return t("COOL");
  }
}

export interface BreakdownSpec {
  /** The analysed photo. */
  imageCanvas: HTMLCanvasElement;
  /** Guides drawn on top, burnt into the sheet. */
  overlayCanvas?: HTMLCanvasElement | null;
  histogramCanvas?: HTMLCanvasElement | null;
  clusters: GamutCluster[];
  tonalTitle: string;
  tonalText: string;
  harmony: string;
  takeaway: string;
  exifRows: ExifRow[];
}

/**
 * Analysis breakdown: the frame with its guides burnt in, plus the tonal,
 * color and EXIF readouts. Resolves true once the download has started.
 */
export async function exportBreakdownSheet(spec: BreakdownSpec): Promise<boolean> {
  const canvas = document.createElement("canvas");
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
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, height);

  let y = PAD + 34;
  ctx.textBaseline = "alphabetic";
  ctx.font = display(20, 700);
  ctx.fillStyle = AMBER;
  ctx.fillText("P H O T O E Y E", PAD, y);
  ctx.font = display(40, 600);
  ctx.fillStyle = INK;
  y += 48;
  ctx.fillText(t("Photo breakdown"), PAD, y);
  ctx.font = mono(18, 400);
  ctx.fillStyle = DIM;
  ctx.textAlign = "right";
  ctx.fillText(new Date().toLocaleString(getDateLocale()), W - PAD, y);
  ctx.textAlign = "left";
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

  y = capsLabel(ctx, t("Brightness chart"), PAD, y);
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
  ctx.fillText(spec.tonalTitle || "", PAD, y);
  y += 28;
  ctx.font = body(19);
  ctx.fillStyle = DIM;
  y = wrapText(ctx, spec.tonalText, PAD, y, colW, 27);

  const leftBottom = y;

  // Right column.
  const rx = PAD + colW + 40;
  let ry = capsLabel(ctx, t("Camera settings"), rx, colTop);
  ctx.font = mono(19, 500);
  for (const row of spec.exifRows) {
    ctx.fillStyle = DIM;
    ctx.fillText(row.label, rx, ry);
    ctx.fillStyle = INK;
    ctx.fillText(row.value, rx + 200, ry);
    ry += 30;
  }
  if (!spec.exifRows.length) {
    ctx.fillStyle = DIM;
    ctx.font = body(19);
    ry = wrapText(ctx, t("No camera settings saved in this file."), rx, ry, colW, 27);
  }

  ry += 20;
  ry = capsLabel(ctx, t("Main colors"), rx, ry);
  if (spec.harmony) {
    ctx.font = display(22, 600);
    ctx.fillStyle = AMBER;
    ctx.fillText(spec.harmony, rx, ry);
    ry += 30;
  }
  const clusters = spec.clusters;
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
      ctx.fillText(`${Math.round(c.share * 100)}% ${roleWord(c.role)}`, rx + 160, ry);
      ry += 26;
    }
  }

  y = Math.max(leftBottom, ry) + 24;
  if (spec.takeaway) {
    hairline(ctx, y, inner);
    y += 34;
    y = capsLabel(ctx, t("Takeaway"), PAD, y);
    ctx.font = body(21);
    ctx.fillStyle = INK;
    y = wrapText(ctx, spec.takeaway, PAD, y, inner, 30);
  }

  return finish(canvas, y, "photoeye-breakdown");
}

export interface StudyPane {
  /** Image URL (an object URL from the photo store). */
  src: string;
  who: string;
  exposure: string;
  detail: string;
}

export interface StudyNote { author: string; when: string; text: string }

export interface StudySpec {
  title: string;
  subtitle: string;
  panes: StudyPane[];
  notes: StudyNote[];
}

/**
 * Partner study sheet: two frames side by side with their EXIF, and the
 * critique thread. Resolves true once the download has started.
 */
export async function exportStudySheet(spec: StudySpec): Promise<boolean> {
  const canvas = document.createElement("canvas");
  const inner = W - PAD * 2;
  const gap = 32;
  const paneW = Math.floor((inner - gap) / 2);
  const paneH = Math.round(paneW * 1.25);

  canvas.width = W;
  canvas.height = PAD + 200 + paneH + 200 + Math.max(1, spec.notes.length) * 130;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, canvas.height);

  let y = PAD + 34;
  ctx.font = display(20, 700);
  ctx.fillStyle = AMBER;
  ctx.fillText(`P H O T O E Y E   ·   ${t("G R O U P   R E V I E W")}`, PAD, y);
  y += 50;
  ctx.font = display(40, 600);
  ctx.fillStyle = INK;
  ctx.fillText(spec.title || t("Side-by-side study"), PAD, y);
  y += 30;
  ctx.font = body(20);
  ctx.fillStyle = DIM;
  y = wrapText(ctx, spec.subtitle || "", PAD, y, inner, 28);
  y += 8;
  hairline(ctx, y, inner);
  y += 32;

  const images = await Promise.all(spec.panes.slice(0, 2).map(async (p) => {
    try { return { ...p, img: await loadImage(p.src) as HTMLImageElement | null }; } catch { return { ...p, img: null }; }
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
    ctx.fillText(pane.who || "", px + 14, y + 34);

    ctx.font = mono(18, 500);
    ctx.fillStyle = INK;
    ctx.fillText(pane.exposure || t("no camera data"), px + 14, y + paneH + 30);
    ctx.fillStyle = DIM;
    ctx.fillText(pane.detail || "", px + 14, y + paneH + 56);
  });

  y += paneH + 90;
  hairline(ctx, y, inner);
  y += 34;
  y = capsLabel(ctx, t("Feedback notes"), PAD, y);

  for (const note of spec.notes) {
    ctx.font = mono(17, 600);
    ctx.fillStyle = AMBER;
    ctx.fillText(`${(note.author || t("partner")).toUpperCase()} · ${note.when || ""}`, PAD, y);
    y += 28;
    ctx.font = body(20);
    ctx.fillStyle = INK;
    y = wrapText(ctx, note.text, PAD, y, inner, 28) + 16;
  }
  if (!spec.notes.length) {
    ctx.font = body(20);
    ctx.fillStyle = DIM;
    y = wrapText(ctx, t("No feedback notes yet."), PAD, y, inner, 28);
  }

  return finish(canvas, y, "photoeye-study-sheet");
}

/** Trims the canvas to the content height, encodes it, and starts the download. */
async function finish(canvas: HTMLCanvasElement, contentBottom: number, name: string): Promise<boolean> {
  const height = Math.round(contentBottom + PAD);
  const out = document.createElement("canvas");
  out.width = canvas.width;
  out.height = height;
  const ctx = out.getContext("2d")!;
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, out.width, height);
  ctx.drawImage(canvas, 0, 0);

  try {
    const blob = await canvasToBlob(out, "image/jpeg", 0.92);
    download(blob, `${name}-${new Date().toISOString().slice(0, 10)}.jpg`);
    return true;
  } catch (err) {
    console.warn("PhotoEYE: could not build the sheet.", err);
    return false;
  }
}
