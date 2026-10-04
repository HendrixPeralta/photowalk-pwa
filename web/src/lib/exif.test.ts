import { describe, expect, it } from "vitest";
import { BUNDLED_PHOTOS, photoBlob } from "@/test/photos";
import { exposureLine, isHeif, readExif } from "./exif";

describe("readExif", () => {
  // Exactly what the old app read when ported; the snapshot keeps it so.
  it.each(BUNDLED_PHOTOS)("reads %s the same", async (name) => {
    expect(await readExif(photoBlob(name))).toMatchSnapshot();
  });

  it("finds real camera data in the bundled photos", async () => {
    const found = await Promise.all(BUNDLED_PHOTOS.map((n) => readExif(photoBlob(n))));
    const withCamera = found.filter((e) => e?.aperture && e.shutter && e.iso);
    expect(withCamera.length).toBeGreaterThan(0);
  });

  it("returns null for non-JPEG input", async () => {
    expect(await readExif(new Blob(["hello"], { type: "text/plain" }))).toBeNull();
    expect(await readExif(new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }))).toBeNull();
    expect(await readExif(null)).toBeNull();
  });
});

describe("isHeif", () => {
  it("recognises the ftyp brand", async () => {
    const heic = new Uint8Array([0, 0, 0, 24, ...new TextEncoder().encode("ftypheic")]);
    expect(await isHeif(new Blob([heic]))).toBe(true);
    expect(await isHeif(photoBlob("a.jpg"))).toBe(false);
  });
});

describe("exposureLine", () => {
  it("joins whatever exposure settings the file carried", () => {
    expect(exposureLine({ aperture: "f/2.8", shutter: "1/250s", iso: "ISO 400" })).toBe("ƒ/2.8 · 1/250s · ISO 400");
    expect(exposureLine({ shutter: "1/60s" })).toBe("1/60s");
    expect(exposureLine(null)).toBe("");
  });
});
