import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { decode } from "jpeg-js";
import type { PixelSource } from "@/lib/scopes/compute";

export const BUNDLED_PHOTOS = ["a.jpg", "a_1.jpg", "a_25.jpg", "a_31.jpg", "a_33.jpg", "a_49.jpg", "dr-3474.jpg"] as const;

const photoBytes = (name: string) => readFileSync(resolve(process.cwd(), "public/photos", name));

/** One of the bundled sample photos as a JPEG Blob, read from public/photos. */
export function photoBlob(name: string): Blob {
  return new Blob([photoBytes(name)], { type: "image/jpeg" });
}

const pixelCache = new Map<string, PixelSource>();

/**
 * A bundled photo decoded to RGBA and scaled down (nearest neighbour) so its
 * longest side is at most `maxDim`, like the 640px sample the Analysis screen
 * reads. jsdom has no canvas, so tests decode with jpeg-js instead.
 */
export function photoPixels(name: string, maxDim = 640): PixelSource {
  const key = `${name}@${maxDim}`;
  const cached = pixelCache.get(key);
  if (cached) return cached;

  const full = decode(photoBytes(name), { useTArray: true, formatAsRGBA: true });
  const scale = Math.min(1, maxDim / Math.max(full.width, full.height));
  const width = Math.max(1, Math.round(full.width * scale));
  const height = Math.max(1, Math.round(full.height * scale));
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const sy = Math.min(full.height - 1, Math.floor(y / scale));
    for (let x = 0; x < width; x++) {
      const sx = Math.min(full.width - 1, Math.floor(x / scale));
      const s = (sy * full.width + sx) * 4, d = (y * width + x) * 4;
      data[d] = full.data[s]; data[d + 1] = full.data[s + 1]; data[d + 2] = full.data[s + 2]; data[d + 3] = 255;
    }
  }
  const out = { data, width, height };
  pixelCache.set(key, out);
  return out;
}
