import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const BUNDLED_PHOTOS = ["a.jpg", "a_1.jpg", "a_25.jpg", "a_31.jpg", "a_33.jpg", "a_49.jpg", "dr-3474.jpg"] as const;

/** One of the bundled sample photos as a JPEG Blob, read from public/photos. */
export function photoBlob(name: string): Blob {
  return new Blob([readFileSync(resolve(process.cwd(), "public/photos", name))], { type: "image/jpeg" });
}
