// Browser-only image helpers (FileReader, Image, canvas). Call them from
// effects and event handlers, never during render.

export type DrawableImage = HTMLImageElement | ImageBitmap | HTMLCanvasElement;

export function readFileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = "image/jpeg", quality = 0.85): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not encode canvas"))),
      type,
      quality,
    );
  });
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not decode image"));
    img.src = src;
  });
}

/** Natural size of anything drawable: an <img> reports naturalWidth, a bitmap or canvas just width. */
export function imageSize(img: DrawableImage): { width: number; height: number } {
  if (img instanceof HTMLImageElement) return { width: img.naturalWidth || img.width, height: img.naturalHeight || img.height };
  return { width: img.width, height: img.height };
}

/** Draws an image onto a fresh canvas, capping the longest side at maxDim. */
export function drawToCanvas(img: DrawableImage, maxDim: number): HTMLCanvasElement {
  const { width, height } = imageSize(img);
  const scale = Math.min(1, maxDim / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
  return canvas;
}
