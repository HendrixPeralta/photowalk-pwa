// Composition guide geometry. Pure: everything here is in unit-square or
// pixel coordinates, so drawGuides.ts only has to stroke what this returns.

import type { Overlay } from "@/state/types";

const PHI = (1 + Math.sqrt(5)) / 2;

// Grid overlay ids double as concept keys, so the matching tip is a direct lookup.
export const LINE_FRACTIONS: Partial<Record<Overlay["type"], readonly number[]>> = {
  thirds: [1 / 3, 2 / 3],
  golden: [0.382, 0.618],
};

export type Point = readonly [number, number];
/** A polyline in canvas pixels, plus how strongly to draw it (1 = full). */
export interface GuidePath { points: Point[]; alpha: number }

/** Foot of the perpendicular from point P onto the line through A and B. */
export function perpFoot(P: Point, A: Point, B: Point): Point {
  const dx = B[0] - A[0], dy = B[1] - A[1];
  const k = ((P[0] - A[0]) * dx + (P[1] - A[1]) * dy) / (dx * dx + dy * dy);
  return [A[0] + k * dx, A[1] + k * dy];
}

/**
 * Subdivides a golden rectangle (left, top, right, bottom, repeating), then
 * squeezes it into the unit square. Stretching to the photo's aspect happens
 * when the caller scales by canvas size, matching how other apps fit these
 * overlays. Arcs are polylines so that non-uniform scale is free.
 * Returns cut segments [x1, y1, x2, y2] and the spiral polyline, all in
 * unit-square coordinates.
 */
export function goldenSpiralGeometry(turns = 8): { cuts: number[][]; spiral: number[][] } {
  const cuts: number[][] = [];
  const spiral: number[][] = [];
  let x = 0, y = 0, w = PHI, h = 1;
  for (let i = 0; i < turns; i++) {
    const side = i % 4;
    let s: number, cx: number, cy: number, a0: number;
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
    spiral,
  };
}

/**
 * Every line the chosen overlay draws on a w by h canvas, in pixels.
 *
 * Golden Triangles is the frame diagonal plus true perpendiculars dropped from
 * the two free corners, computed in pixel space so the right angles survive
 * any aspect ratio; Flip mirrors it into Harmonious Triangles. The spirals
 * share one generator: Section shows only the cut lines, Spiral dims them and
 * draws the quarter-arc spiral on top, and Rotate re-anchors the pattern a
 * quarter-turn at a time.
 */
export function guidePaths(overlay: Overlay, w: number, h: number): GuidePath[] {
  if (overlay.type === "none" || !w || !h) return [];

  const fractions = LINE_FRACTIONS[overlay.type];
  if (fractions) {
    return [
      ...fractions.map((f) => ({ points: [[f * w, 0], [f * w, h]] as Point[], alpha: 1 })),
      ...fractions.map((f) => ({ points: [[0, f * h], [w, f * h]] as Point[], alpha: 1 })),
    ];
  }

  if (overlay.type === "golden-triangles") {
    const A: Point = overlay.flip ? [w, 0] : [0, 0];
    const B: Point = overlay.flip ? [0, h] : [w, h];
    const corners: Point[] = overlay.flip ? [[0, 0], [w, h]] : [[w, 0], [0, h]];
    return [
      { points: [A, B], alpha: 1 },
      ...corners.map((P) => ({ points: [P, perpFoot(P, A, B)], alpha: 1 })),
    ];
  }

  const { cuts, spiral } = goldenSpiralGeometry();
  const toPx = ([u, v]: number[]): Point => {
    let p: [number, number] = [u, v];
    for (let i = 0; i < overlay.rotation; i++) p = [1 - p[1], p[0]];
    return [p[0] * w, p[1] * h];
  };
  const cutAlpha = overlay.type === "golden-spiral" ? 0.45 : 1;
  const paths: GuidePath[] = cuts.map(([x1, y1, x2, y2]) => ({ points: [toPx([x1, y1]), toPx([x2, y2])], alpha: cutAlpha }));
  if (overlay.type === "golden-spiral") paths.push({ points: spiral.map(toPx), alpha: 1 });
  return paths;
}
