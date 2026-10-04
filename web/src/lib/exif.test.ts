import { describe, expect, it } from "vitest";
import { legacy } from "@/test/legacy";
import { BUNDLED_PHOTOS, photoBlob } from "@/test/photos";
import { isHeif, readExif } from "./exif";

describe("readExif", () => {
  it.each(BUNDLED_PHOTOS)("reads %s exactly like the old app", async (name) => {
    const old = await legacy("exif.js");
    const blob = photoBlob(name);
    expect(await readExif(blob)).toEqual(await old.readExif(blob));
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
