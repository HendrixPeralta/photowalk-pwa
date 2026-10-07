import { describe, expect, it } from "vitest";
import type { RoomPhoto, RoomSnapshot } from "@/lib/rooms/protocol";
import { critiqueTagLabel, detailOf, exposureOf, formatSpan, partnersLabel, personName, pickPair, shutterOf } from "./debrief";

const photo = (userId: string, ts: number, exif: RoomPhoto["exif"] = null): RoomPhoto => ({
  id: `${userId}-${ts}`, userId, note: "", ts, width: 900, height: 600, comments: [], exif, themeId: null,
});
const people: RoomSnapshot["people"] = {
  ana: { id: "ana", name: "Ana Sato", image: null },
  ken: { id: "ken", name: "伊藤 健", image: null },
};

describe("group review", () => {
  it("pairs the newest shot from each of the two latest posters", () => {
    const photos = [photo("ana", 1), photo("ken", 2), photo("ana", 3), photo("ana", 4)];
    expect(pickPair(photos).map((p) => p.id)).toEqual(["ken-2", "ana-4"]);
    // One poster: the two newest shots.
    expect(pickPair([photo("ana", 1), photo("ana", 2), photo("ana", 3)]).map((p) => p.id)).toEqual(["ana-2", "ana-3"]);
    expect(pickPair([photo("ana", 1)])).toHaveLength(1);
  });

  it("reads camera settings, with a placeholder when the file had none", () => {
    const shot = photo("ana", 1, { focalLength: "35mm", aperture: "f/2", iso: "ISO 200", shutter: "1/500s" });
    expect(exposureOf(shot)).toBe("35mm · ƒ/2");
    expect(detailOf(shot)).toBe("ISO 200 · 1/500s");
    expect(shutterOf(shot)).toBe("1/500s");
    const bare = photo("ken", 2);
    expect([exposureOf(bare), detailOf(bare), shutterOf(bare)]).toEqual(["no camera data", "", "--"]);
  });

  it("names the partners by their full account names, and the span of the session", () => {
    expect(partnersLabel({ people, photos: [photo("ana", 1), photo("ken", 2), photo("ana", 3)] })).toBe("@Ana Sato & @伊藤 健");
    expect(partnersLabel({ people, photos: [] })).toBe("--");
    expect(personName({ people }, "gone")).toBe("Someone");
    expect(formatSpan(42 * 60000)).toBe("42m");
    expect(formatSpan(135 * 60000)).toBe("2h 15m");
  });

  it("shows critique tags in the reader's language", () => {
    expect(critiqueTagLabel("#LowAngle")).toBe("#LowAngle");
  });
});
