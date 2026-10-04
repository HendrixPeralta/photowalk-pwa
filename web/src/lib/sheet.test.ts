import { describe, expect, it } from "vitest";
import { wrapTokens } from "./sheet";

describe("sheet line wrapping", () => {
  it("breaks English between words and Japanese between characters", () => {
    expect(wrapTokens("Golden hour, again")).toEqual(["Golden", " ", "hour,", " ", "again"]);
    expect(wrapTokens("撮影の記録")).toEqual(["撮", "影", "の", "記", "録"]);
    expect(wrapTokens("ISO 400の写真")).toEqual(["ISO", " ", "400", "の", "写", "真"]);
  });
});
