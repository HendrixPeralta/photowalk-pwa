import type { PixelSource } from "../scopes/compute";

export interface HistogramBin { r: number; g: number; b: number; lum: number }
export interface Histogram {
  /** 64 bins covering levels 0-255, four levels each. */
  bins: HistogramBin[];
  avgLum: number;
}

export function computeHistogram(imageData: PixelSource): Histogram {
  const bins: HistogramBin[] = Array.from({ length: 64 }, () => ({ r: 0, g: 0, b: 0, lum: 0 }));
  const data = imageData.data;
  const totalPixels = imageData.width * imageData.height;
  let lumSum = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    lumSum += lum;
    bins[Math.min(63, (lum / 4) | 0)].lum++;
    bins[Math.min(63, (r / 4) | 0)].r++;
    bins[Math.min(63, (g / 4) | 0)].g++;
    bins[Math.min(63, (b / 4) | 0)].b++;
  }

  return { bins, avgLum: totalPixels ? lumSum / totalPixels : 128 };
}
