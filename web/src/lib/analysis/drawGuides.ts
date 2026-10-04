// Strokes composition guides onto an overlay canvas. Browser-only.

import type { Overlay } from "@/state/types";
import { guidePaths, type GuidePath } from "./guides";

/**
 * Clears the canvas and draws the overlay. Dark casing plus a light core so
 * lines read on any photo; widths are given in screen pixels (via the
 * canvas's on-screen size) so zooming in doesn't fatten the guides.
 */
export function drawGuides(canvas: HTMLCanvasElement, overlay: Overlay): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const rect = canvas.getBoundingClientRect();
  const px = rect.width ? w / rect.width : 1; // canvas px per on-screen px
  for (const path of guidePaths(overlay, w, h)) strokeGuidePath(ctx, path, px);
}

function strokeGuidePath(ctx: CanvasRenderingContext2D, { points, alpha }: GuidePath, px: number): void {
  const trace = () => {
    ctx.beginPath();
    points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  };
  trace();
  ctx.strokeStyle = `rgba(0,0,0,${0.55 * alpha})`;
  ctx.lineWidth = 3 * px;
  ctx.stroke();

  trace();
  ctx.strokeStyle = `rgba(255,255,255,${0.9 * alpha})`;
  ctx.lineWidth = 1 * px;
  ctx.stroke();
}
