/**
 * The written half of the Analysis screen: the tonal-key verdict and the
 * color gamut deconstruction, plus the takeaway paragraph the export sheet
 * prints.
 *
 * All of it is rule-based arithmetic over the histogram, the palette and the
 * EXIF block: the same numbers already on screen, phrased. Nothing is sent
 * anywhere and no model is consulted; if the numbers don't support a claim,
 * the claim isn't made.
 */

import { rgbToHex } from "./color";
import type { Exif } from "./exif";
import type { HistogramBin } from "./analysis/histogram";
import { t } from "./i18n/core";
import { joinSentences, paletteRelationship, type HistogramReading } from "./interpret";
import type { Rgb } from "./scopes/compute";

export interface TonalKey {
  title: string;
  /** The title as it reads mid-sentence (lowercased in English), so callers never lowercase a translation. */
  phrase: string;
  tag: string;
}

/** Names the tonal key from the histogram's shadow/mid/highlight split. */
export function tonalKey(summary: Pick<HistogramReading, "shadows" | "highs">): TonalKey {
  const { shadows, highs } = summary;
  if (shadows > 0.5) return { title: t("Low-key (mostly dark)"), phrase: t("low-key (mostly dark)"), tag: t("Moody") };
  if (highs > 0.5) return { title: t("High-key (mostly bright)"), phrase: t("high-key (mostly bright)"), tag: t("Airy") };
  if (shadows > 0.28 && highs > 0.28) return { title: t("High contrast"), phrase: t("high contrast"), tag: t("Punchy") };
  if (shadows < 0.08 && highs < 0.08) return { title: t("Low contrast"), phrase: t("low contrast"), tag: t("Soft") };
  return { title: t("Balanced"), phrase: t("balanced"), tag: t("Even") };
}

/** Share of the frame sitting in the very first and very last histogram bin. */
export function clipShares(bins: HistogramBin[]): { black: number; white: number } {
  const total = bins.reduce((sum, b) => sum + b.lum, 0) || 1;
  return { black: bins[0].lum / total, white: bins[63].lum / total };
}

/** Everything the Tonal key card shows: its title, tag, and explanation. */
export function tonalKeyNote(bins: HistogramBin[], summary: HistogramReading): { title: string; tag: string; text: string } {
  const key = tonalKey(summary);
  const clip = clipShares(bins);

  const dominant = summary.shadows >= summary.highs
    ? t("{pct}% of the photo is in the darker tones.", { pct: Math.round(summary.shadows * 100) })
    : t("{pct}% of the photo is in the brighter tones.", { pct: Math.round(summary.highs * 100) });

  const clipLine = t("Pure black: {black}% · pure white: {white}%.", {
    black: (clip.black * 100).toFixed(1),
    white: (clip.white * 100).toFixed(1),
  });

  return {
    title: t("Tonal key: {title}", { title: key.title }),
    tag: key.tag,
    text: joinSentences([dominant, clipLine, summary.caption]),
  };
}

/** A short stamped label for each cluster. Stored in English, translated for display. */
export type GamutRole = "DOM" | "SPEC" | "BLACK" | "BASE" | "RIM" | "WARM" | "COOL";

export interface GamutCluster { hex: string; share: number; role: GamutRole }

/**
 * Turns the extracted palette into clusters with a percentage share.
 * The shares are relative to the extracted clusters, not the whole frame
 * (quantisation leaves colors outside every cluster), so they always total 100.
 */
export function gamutClusters(palette: (Rgb & { count?: number })[]): GamutCluster[] {
  const counts = palette.map((c) => c.count || 1);
  const total = counts.reduce((a, b) => a + b, 0) || 1;
  return palette.map((c, i) => ({
    hex: rgbToHex(c.r, c.g, c.b),
    share: counts[i] / total,
    role: roleFor(c, i),
  }));
}

function roleFor(c: Rgb, index: number): GamutRole {
  const lum = (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;
  const max = Math.max(c.r, c.g, c.b), min = Math.min(c.r, c.g, c.b);
  const sat = max === 0 ? 0 : (max - min) / max;
  if (index === 0) return "DOM";
  if (lum > 0.82) return "SPEC";
  if (lum < 0.12) return "BLACK";
  if (sat < 0.15) return "BASE";
  if (c.r > c.b && lum > 0.5) return "RIM";
  if (c.r > c.b) return "WARM";
  return "COOL";
}

/**
 * One paragraph tying the exposure decisions to what the frame looks like.
 * Every clause is guarded by the measurement that justifies it, so a photo
 * with no EXIF simply gets a shorter note rather than an invented one.
 */
export function takeawayText(palette: Rgb[], summary: HistogramReading, exif: Exif | null | undefined): string {
  const key = tonalKey(summary);
  const rel = palette.length ? paletteRelationship(palette) : null;
  const parts: string[] = [];

  if (exif && exif.aperture && exif.shutter) {
    const at = [exif.shutter, exif.aperture.replace("f/", "ƒ/"), exif.iso].filter(Boolean).join(" · ");
    parts.push(t("Shot at {at}, the photo comes out {key}.", { at, key: key.phrase }));
  } else {
    parts.push(t("The photo comes out {key}.", { key: key.phrase }));
  }

  if (summary.shadows > 0.5) {
    parts.push(t("Most of the scene falls into darkness, so whatever is lit becomes the focus."));
  } else if (summary.highs > 0.5) {
    parts.push(t("Tones are bright and airy. That softens texture but keeps the subject easy to see against a light background."));
  } else if (summary.shadows > 0.28 && summary.highs > 0.28) {
    parts.push(t("Strong darks and brights with little in between make shapes and edges stand out."));
  }

  if (summary.clippedWhite) parts.push(t("Some bright areas are pure white, and editing can't bring that detail back."));
  if (summary.clippedBlack) parts.push(t("Some dark areas are pure black, with no detail left to brighten."));

  // The label is already translated; lowercasing only affects English.
  if (rel) parts.push(t("Color: {harmony}.", { harmony: rel.label.toLowerCase() }), rel.caption);

  if (exif && exif.focalMm) {
    const wide = exif.focalMm < 35;
    parts.push(wide
      ? t("At {focal} (wide), you were close enough for the foreground to play a big part.", { focal: exif.focalLength! })
      : t("At {focal} (zoomed in), the background looks pulled closer, stacking the layers together.", { focal: exif.focalLength! }));
  }

  return joinSentences(parts);
}
