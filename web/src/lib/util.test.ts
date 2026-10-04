import { describe, expect, it } from "vitest";
import { legacy } from "@/test/legacy";
import { apertureBucket, clamp, focalBucket, formatCoords, formatHours, localDateKey, roomCode } from "./util";

describe("formatHours", () => {
  it.each([
    [0, "0h"], [null, "0h"], [0.25, "15m"], [0.999, "1h"], [0.004, "1m"],
    [1, "1h"], [2.5, "2.5h"], [2.04, "2h"], [12.36, "12.4h"], [-3, "0h"],
  ])("formatHours(%s) is %s", (input, expected) => {
    expect(formatHours(input as number | null)).toBe(expected);
  });

  it("matches the old app for a sweep of values", async () => {
    const old = await legacy("util.js");
    for (let h = 0; h < 30; h += 0.137) expect(formatHours(h)).toBe(old.formatHours(h));
  });
});

describe("small helpers", () => {
  it("localDateKey uses the local calendar day", () => {
    expect(localDateKey(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });

  it("clamp", () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
  });

  it("buckets focal lengths and apertures like the old app", async () => {
    const old = await legacy("util.js");
    for (const mm of [0, 12, 34.9, 35, 50, 70, 71, 200, NaN]) expect(focalBucket(mm)).toBe(old.focalBucket(mm));
    for (const f of [0, 1.4, 2.8, 2.9, 8, 8.1, 16, NaN]) expect(apertureBucket(f)).toBe(old.apertureBucket(f));
  });

  it("formats coordinates with hemispheres", () => {
    expect(formatCoords(35.6762, -139.6503)).toBe("35.67620° N, 139.65030° W");
  });

  it("room codes avoid look-alike characters", () => {
    for (let i = 0; i < 200; i++) expect(roomCode()).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  });
});
