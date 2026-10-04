import jsQR from "jsqr";
import { describe, expect, it } from "vitest";
import { legacy } from "@/test/legacy";
import { qrMatrix, qrPathData } from "./qr";

/** Rasterizes a QR matrix to RGBA pixels with a quiet zone, for the decoder. */
function rasterize(matrix: boolean[][], scale = 4, quiet = 4) {
  const size = (matrix.length + quiet * 2) * scale;
  const data = new Uint8ClampedArray(size * size * 4).fill(255);
  matrix.forEach((row, r) => row.forEach((dark, c) => {
    if (!dark) return;
    for (let y = 0; y < scale; y++) {
      for (let x = 0; x < scale; x++) {
        const i = (((r + quiet) * scale + y) * size + (c + quiet) * scale + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = 0;
      }
    }
  }));
  return { data, size };
}

describe("qr", () => {
  it.each([
    "https://photoeye-wine.vercel.app/partners/?room=ABC234",
    "A",
    "日本語のルーム招待",
    "x".repeat(200),
  ])("round-trips %s through a real decoder", (text) => {
    const { data, size } = rasterize(qrMatrix(text));
    expect(jsQR(data, size, size)?.data).toBe(text);
  });

  it("produces the same modules as the old app", async () => {
    const old = await legacy("qr.js");
    for (const text of ["https://example.com/?room=QWERTY", "hello", "x".repeat(150)]) {
      expect(qrMatrix(text)).toEqual(old.qrMatrix(text));
    }
  });

  it("rejects text that does not fit version 10", () => {
    expect(() => qrMatrix("x".repeat(300))).toThrow(/too long/);
  });

  it("path data covers the quiet zone", () => {
    const { dim, path } = qrPathData("hi", { moduleSize: 4, quiet: 4 });
    expect(dim).toBe((21 + 8) * 4);
    expect(path.startsWith("M16 16")).toBe(true);
  });
});
