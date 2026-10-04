import { afterEach, describe, expect, it } from "vitest";
import { cachedFix, FIX_KEY, fixIsFresh, formatLat } from "./geo";

afterEach(() => localStorage.clear());

describe("geo", () => {
  it("reads a cached fix and ignores junk", () => {
    expect(cachedFix()).toBeNull();
    localStorage.setItem(FIX_KEY, JSON.stringify({ lat: 35.7, lon: 139.7, accuracy: 20, at: 1000 }));
    expect(cachedFix()).toMatchObject({ lat: 35.7 });
    localStorage.setItem(FIX_KEY, "{not json");
    expect(cachedFix()).toBeNull();
  });

  it("a fix stays fresh for 12 hours", () => {
    const fix = { lat: 1, lon: 2, accuracy: 5, at: 0 };
    expect(fixIsFresh(fix, 11 * 3600_000)).toBe(true);
    expect(fixIsFresh(fix, 13 * 3600_000)).toBe(false);
    expect(fixIsFresh(null)).toBe(false);
  });

  it("formats latitude for the launch button", () => {
    expect(formatLat(-33.86882)).toBe("33.8688° S");
  });
});
