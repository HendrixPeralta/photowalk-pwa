// Draws the brightness chart. Browser-only.

import { t } from "../i18n/core";
import { HIGHLIGHT_START, SHADOW_END, type HistogramReading } from "../interpret";
import type { HistogramBin } from "./histogram";

export function drawHistogram(canvas: HTMLCanvasElement, bins: HistogramBin[], summary: HistogramReading | null): void {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 300;
  const h = canvas.clientHeight || 100;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  // Region bands so the axis reads without prior knowledge.
  const s0 = w * (SHADOW_END / 64);
  const s1 = w * (HIGHLIGHT_START / 64);
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.fillRect(0, 0, s0, h);
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  ctx.fillRect(s1, 0, w - s1, h);

  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  [s0, s1].forEach((x) => {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  });
  ctx.setLineDash([]);

  const narrow = w < 220; // compare mode halves the canvas, so shorten labels
  ctx.font = "600 9px system-ui, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.textAlign = "center";
  ctx.fillText(narrow ? t("S") : t("Shadows"), s0 / 2, 11);
  ctx.fillText(narrow ? t("M") : t("Mids"), (s0 + s1) / 2, 11);
  ctx.fillText(narrow ? t("H") : t("Highlights"), (s1 + w) / 2, 11);

  let maxCount = 1;
  bins.forEach((bin) => { maxCount = Math.max(maxCount, bin.r, bin.g, bin.b, bin.lum); });
  const barW = w / bins.length;

  const fillChannel = (key: "r" | "g" | "b", color: string) => {
    ctx.beginPath();
    ctx.moveTo(0, h);
    bins.forEach((bin, i) => ctx.lineTo(i * barW, h - (bin[key] / maxCount) * h));
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  };

  fillChannel("r", "rgba(255,90,90,0.35)");
  fillChannel("g", "rgba(90,220,120,0.35)");
  fillChannel("b", "rgba(90,150,255,0.35)");

  ctx.beginPath();
  bins.forEach((bin, i) => {
    const x = i * barW + barW / 2;
    const y = h - (bin.lum / maxCount) * h;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Clipped edges get a warning bar: detail lost past this line.
  if (summary) {
    ctx.fillStyle = "rgba(255,170,60,0.9)";
    if (summary.clippedBlack) ctx.fillRect(0, 0, 3, h);
    if (summary.clippedWhite) ctx.fillRect(w - 3, 0, 3, h);
  }
}
