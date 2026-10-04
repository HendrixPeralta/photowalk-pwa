import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { REVIEW_STRINGS } from "./strings";

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

  it("keeps the answer keys the review sheet stores", () => {
    const old = readFileSync(resolve(process.cwd(), "..", "js", "review.js"), "utf8");
    const keys = (name: string) => JSON.parse(old.match(new RegExp(`const ${name} = (\\[[^\\]]*\\])`))![1].replace(/'/g, '"'));
    expect(Object.keys(REVIEW_STRINGS.en.levels)).toEqual(keys("LEVEL_KEYS"));
    expect(Object.keys(REVIEW_STRINGS.en.features)).toEqual(keys("FEATURE_KEYS"));
  });
});
