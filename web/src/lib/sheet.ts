/**
 * Study-sheet export.
 *
 * Renders a one-page summary to a canvas and downloads it as a JPEG: the
 * photo, then one line under it with the main colors, a
 * small brightness chart and the camera settings. A real PDF would mean
 * shipping a PDF library for one button; a 1400px JPEG drops straight into a
 * notes app, a print, or a message to whoever you walked with, which is what
 * the sheet is for. Browser-only.
 */

import type { HistogramBin } from "./analysis/histogram";
import { byLightness } from "./color";
import type { Exif } from "./exif";
import { canvasToBlob } from "./image";

type Ctx = CanvasRenderingContext2D;

const W = 1400;
/** Drawn at twice the page size so the swatches' edges and the text stay crisp in the JPEG. */
const SCALE = 2;
const PAD = 64;
const BG = "#ffffff";
const INK = "#1f2329";
const DIM = "#8a9099";
/** The app's amber, deepened enough to read on white. */
const AMBER = "#d97706";
const WELL = "#f3f4f6";
const EDGE = "#e3e5e9";
/**
 * The colors and the brightness chart share the album pop-up's swatch shape
 * (26px squares, 6px apart, 6px corners), kept small so the photo leads.
 */
const BLOCK = 34;
const BLOCK_GAP = 8;
const BLOCK_RADIUS = 8;

/**
 * The page's font stack for a role. next/font self-hosts the fonts under
 * generated family names, so the sheet asks the page instead of hard-coding
 * "Space Grotesk"; canvas text in a family the page never loaded would fall
 * back silently.
 */
function family(cssVar: "--font-display" | "--font-body", fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
  return value || fallback;
}

const display = (size: number, weight = 500) => `${weight} ${size}px ${family("--font-display", "system-ui, sans-serif")}`;
const body = (size: number, weight = 400) => `${weight} ${size}px ${family("--font-body", "system-ui, sans-serif")}`;

/** One swatch-shaped square, outlined so a white color still shows on the white page. */
function block(ctx: Ctx, x: number, y: number, fill: string, width = BLOCK): void {
  ctx.beginPath();
  ctx.roundRect(x + 0.5, y + 0.5, width - 1, BLOCK - 1, BLOCK_RADIUS);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = EDGE;
  ctx.lineWidth = 1;
  ctx.stroke();
}

/** The main colors as a row of squares, darkest first. Returns the x just past them. */
function swatches(ctx: Ctx, colors: string[], x: number, y: number): number {
  for (const hex of byLightness(colors)) {
    block(ctx, x, y, hex);
    x += BLOCK + BLOCK_GAP;
  }
  return x;
}

/** Brightness only, as one filled shape four blocks wide: no channels, no labels. */
function miniHistogram(ctx: Ctx, bins: HistogramBin[], x: number, y: number): void {
  const width = BLOCK * 4 + BLOCK_GAP * 3;
  block(ctx, x, y, WELL, width);
  // Square-root scale, so one tall spike doesn't flatten the rest of the shape.
  const max = Math.sqrt(Math.max(...bins.map((b) => b.lum)));
  if (!bins.length || !max) return;
  const inset = 6;
  const w = width - inset * 2;
  const h = BLOCK - inset * 2;
  const base = y + inset + h;
  ctx.beginPath();
  ctx.moveTo(x + inset, base);
  bins.forEach((bin, i) => ctx.lineTo(x + inset + (i / (bins.length - 1)) * w, base - (Math.sqrt(bin.lum) / max) * h));
  ctx.lineTo(x + inset + w, base);
  ctx.closePath();
  ctx.fillStyle = INK;
  ctx.fill();
}

/**
 * Aperture, shutter and ISO over lens and camera, right-aligned to `right`,
 * with an amber "--" for whatever the file didn't record, as in the app.
 */
function settings(ctx: Ctx, exif: Exif | null, right: number, y: number): void {
  const camera = [exif?.make, exif?.model].filter(Boolean).join(" ") || undefined;
  const line = (values: (string | undefined)[], font: string, color: string, baseline: number) => {
    ctx.font = font;
    ctx.letterSpacing = "0.5px";
    const gap = 18;
    const texts = values.map((v) => v || "--");
    const width = texts.reduce((sum, text) => sum + ctx.measureText(text).width, 0) + gap * (texts.length - 1);
    let cx = right - width;
    texts.forEach((text, i) => {
      if (i > 0) {
        ctx.fillStyle = EDGE;
        ctx.beginPath();
        ctx.arc(cx + gap / 2, baseline - 5, 1.6, 0, Math.PI * 2);
        ctx.fill();
        cx += gap;
      }
      ctx.fillStyle = values[i] ? color : AMBER;
      ctx.fillText(text, cx, baseline);
      cx += ctx.measureText(text).width;
    });
    ctx.letterSpacing = "0px";
  };
  line([exif?.aperture, exif?.shutter, exif?.iso], body(17, 500), INK, y + 14);
  line([exif?.focalLength, camera], body(13), DIM, y + BLOCK - 1);
}

export interface BreakdownSpec {
  /** The photo at full size. */
  image: HTMLImageElement;
  /** The main colors, as hex. */
  colors: string[];
  bins: HistogramBin[];
  exif: Exif | null;
}

/**
 * The summary sheet: the name, the photo, then the colors and brightness on
 * the left and the camera settings on the right, small so the photo leads.
 * Resolves true once the download has started.
 */
export async function exportBreakdownSheet(spec: BreakdownSpec): Promise<boolean> {
  const inner = W - PAD * 2;

  // Cap the frame's height so a tall portrait still leaves the details in view.
  const MAX_PHOTO_H = 1300;
  const natural = spec.image.naturalHeight / spec.image.naturalWidth;
  const photoH = Math.min(MAX_PHOTO_H, Math.round(inner * natural));
  const photoW = Math.round(photoH / natural);
  const photoX = PAD + Math.round((inner - photoW) / 2);
  // The gap between the photo and the line of details under it.
  const DETAILS_GAP = 20;
  const height = PAD + 40 + photoH + DETAILS_GAP + BLOCK + PAD;

  const canvas = document.createElement("canvas");
  canvas.width = W * SCALE;
  canvas.height = height * SCALE;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, height);
  ctx.textBaseline = "alphabetic";

  let y = PAD + 12;
  ctx.font = display(13, 500);
  ctx.letterSpacing = "5px";
  ctx.fillStyle = DIM;
  ctx.fillText("PHOTOEYE", PAD, y);
  ctx.letterSpacing = "0px";
  y += 28;

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(photoX, y, photoW, photoH, 6);
  ctx.clip();
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(spec.image, photoX, y, photoW, photoH);
  ctx.restore();
  y += photoH + DETAILS_GAP;

  // One line under the photo, edged to the photo rather than the page.
  const x = swatches(ctx, spec.colors, photoX, y);
  // Set apart from the swatches by three gaps, so it reads as its own thing.
  miniHistogram(ctx, spec.bins, x + BLOCK_GAP * 2, y);
  settings(ctx, spec.exif, photoX + photoW, y);

  return finish(canvas, "photoeye_breakdown");
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

/**
 * Local date and time to the second, e.g. "20261012_161901", so two
 * sheets saved the same day don't land on the same file name. Exported for tests.
 */
export function fileStamp(date: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}_${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}

/** Encodes the sheet and starts the download. */
async function finish(canvas: HTMLCanvasElement, name: string): Promise<boolean> {
  try {
    const blob = await canvasToBlob(canvas, "image/jpeg", 0.95);
    download(blob, `${name}_${fileStamp(new Date())}.jpg`);
    return true;
  } catch (err) {
    console.warn("PhotoEYE: could not build the sheet.", err);
    return false;
  }
}
