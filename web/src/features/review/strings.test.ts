import { describe, expect, it } from "vitest";
import { FEATURE_KEYS, LEVEL_KEYS, REVIEW_STRINGS } from "./strings";

const shape = (o: object): string[] =>
  Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? shape(v).map((s) => `${k}.${s}`) : [k])).sort();

describe("review form strings", () => {
  it("English and Japanese define exactly the same keys", () => {
    expect(shape(REVIEW_STRINGS.ja)).toEqual(shape(REVIEW_STRINGS.en));
  });

  it("plural helpers produce the right text", () => {
    expect(REVIEW_STRINGS.en.star(1)).toBe("1 star");
    expect(REVIEW_STRINGS.en.star(3)).toBe("3 stars");
    expect(REVIEW_STRINGS.en.pendingMany(2)).toBe("2 reviews are waiting to send.");
    expect(REVIEW_STRINGS.ja.pendingMany(2)).toContain("2");
  });

  // The sheet already holds answers from the old app under these exact
  // values, so changing them would split its columns' data in two.
  it("keeps the answers the review sheet stores", () => {
    expect(LEVEL_KEYS).toEqual(["beginner", "hobbyist", "pro"]);
    expect(Object.keys(REVIEW_STRINGS.en.levels)).toEqual([...LEVEL_KEYS]);
    expect(Object.keys(REVIEW_STRINGS.en.features)).toEqual([...FEATURE_KEYS]);
    // Features are sent as their English names, whichever language filled the form.
    expect(FEATURE_KEYS.map((key) => REVIEW_STRINGS.en.features[key])).toEqual([
      "Walk guide", "Progress track", "Rewards", "Analysis tools", "Photo sharing with friends",
    ]);
  });
});
