import { describe, expect, it } from "vitest";
import type { RoomPhoto, RoomSnapshot } from "@/lib/rooms/protocol";
import { critiqueTagLabel, personName, settingsOf } from "./debrief";

const photo = (userId: string, ts: number, exif: RoomPhoto["exif"] = null): RoomPhoto => ({
  id: `${userId}-${ts}`, userId, note: "", ts, width: 900, height: 600, comments: [], exif, themeId: null,
});
const people: RoomSnapshot["people"] = {
  ana: { id: "ana", name: "Ana Sato", image: null },
  ken: { id: "ken", name: "伊藤 健", image: null },
};

describe("group review", () => {
  it("reads the lens, aperture and shutter speed, and nothing when the file had none", () => {
    const shot = photo("ana", 1, { focalLength: "35mm", aperture: "f/2", iso: "ISO 200", shutter: "1/500s" });
    expect(settingsOf(shot)).toBe("35mm · ƒ/2 · 1/500s");
    expect(settingsOf(photo("ana", 2, { shutter: "1/60s" }))).toBe("1/60s");
    expect(settingsOf(photo("ken", 3))).toBe("");
  });

  it("names the partners by their full account names, and the span of the session", () => {
    expect(personName({ people }, "gone")).toBe("Someone");
  });

  it("shows critique tags in the reader's language", () => {
    expect(critiqueTagLabel("#LowAngle")).toBe("#LowAngle");
  });
});
