import { deltaE, rgbToLab } from "../color";
import type { Rgb, PixelSource } from "../scopes/compute";

// Minimum CIE76 deltaE between palette swatches, so near-identical shades of
// the same color (two similar sky blues, say) collapse into one instead of
// padding the palette with lookalikes. About 20 is "different colors at a glance".
const MIN_PALETTE_DELTA_E = 20;

/** The photo's main colors, most common first, with lookalikes merged. */
export function computePalette(imageData: PixelSource, maxSwatches = 6): Rgb[] {
  const data = imageData.data;
  const quant = 24;
  const buckets = new Map<string, { r: number; g: number; b: number; count: number }>();

  for (let i = 0; i < data.length; i += 8) {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    if (a < 100) continue;
    const key = `${Math.round(r / quant)},${Math.round(g / quant)},${Math.round(b / quant)}`;
    let bucket = buckets.get(key);
    if (!bucket) { bucket = { r: 0, g: 0, b: 0, count: 0 }; buckets.set(key, bucket); }
    bucket.r += r; bucket.g += g; bucket.b += b; bucket.count++;
  }

  const sorted = Array.from(buckets.values())
    .map((bucket) => {
      const r = Math.round(bucket.r / bucket.count), g = Math.round(bucket.g / bucket.count), bl = Math.round(bucket.b / bucket.count);
      return { r, g, b: bl, count: bucket.count, lab: rgbToLab(r, g, bl) };
    })
    .sort((a, b) => b.count - a.count);

  const picked: typeof sorted = [];
  for (const c of sorted) {
    if (picked.length >= maxSwatches) break;
    const tooClose = picked.some((p) => deltaE(p.lab, c.lab) < MIN_PALETTE_DELTA_E);
    if (!tooClose) picked.push(c);
  }
  return picked.map(({ r, g, b }) => ({ r, g, b }));
}
