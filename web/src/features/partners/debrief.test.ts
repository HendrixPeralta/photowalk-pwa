import { describe, expect, it } from "vitest";
import type { RoomPhoto } from "@/state/types";
import { detailOf, exposureOf, formatSpan, partnersLabel, pickPair, shutterOf } from "./debrief";

const photo = (name: string, ts: number, exif: RoomPhoto["exif"] = null): RoomPhoto => ({
  id: `${name}-${ts}`, imageId: "img", name, note: "", ts, comments: [], exif, themeId: null,
});

describe("group review", () => {
  it("pairs the newest shot from each of the two latest posters", () => {
    const photos = [photo("Ana", 1), photo("Ken", 2), photo("Ana", 3), photo("Ana", 4)];
    expect(pickPair(photos).map((p) => p.id)).toEqual(["Ken-2", "Ana-4"]);
    // One poster: the two newest shots.
    expect(pickPair([photo("Ana", 1), photo("Ana", 2), photo("Ana", 3)]).map((p) => p.id)).toEqual(["Ana-2", "Ana-3"]);
    expect(pickPair([photo("Ana", 1)])).toHaveLength(1);
  });

  it("reads camera settings, with a placeholder when the file had none", () => {
    const shot = photo("Ana", 1, { focalLength: "35mm", aperture: "f/2", iso: "ISO 200", shutter: "1/500s" });
    expect(exposureOf(shot)).toBe("35mm · ƒ/2");
    expect(detailOf(shot)).toBe("ISO 200 · 1/500s");
    expect(shutterOf(shot)).toBe("1/500s");
    const bare = photo("Ken", 2);
    expect([exposureOf(bare), detailOf(bare), shutterOf(bare)]).toEqual(["no camera data", "", "--"]);
  });

  it("names the partners and the span of the session", () => {
    expect(partnersLabel([photo("Ana", 1), photo("Ken", 2), photo("Ana", 3)])).toBe("@Ana & @Ken");
    expect(partnersLabel([])).toBe("--");
    expect(formatSpan(42 * 60000)).toBe("42m");
    expect(formatSpan(135 * 60000)).toBe("2h 15m");
  });
});
