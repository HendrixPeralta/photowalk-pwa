import { describe, expect, it } from "vitest";
import { fileStamp } from "./sheet";

describe("sheet file name", () => {
  it("stamps the local date and time to the second", () => {
    expect(fileStamp(new Date(2026, 9, 2, 7, 5, 9))).toBe("20261002_070509");
  });
});
