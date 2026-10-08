import { describe, expect, it } from "vitest";
import { CRITIQUE_TAGS, isCritiqueTag, isRoomError, newRoomCode, normalizeRoomCode, ROOM_CODE_ALPHABET } from "./protocol";

describe("room codes", () => {
  it("are six characters people won't misread", () => {
    for (let i = 0; i < 200; i++) expect(newRoomCode()).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  });

  it("use every character of the alphabet evenly, from the low five bits of each byte", () => {
    const bytes = [0, 31, 32, 63, 255, 7];
    const code = newRoomCode((b) => { b.set(bytes); return b; });
    expect(code).toBe([0, 31, 0, 31, 31, 7].map((i) => ROOM_CODE_ALPHABET[i]).join(""));
  });

  it("are read from anything someone types or pastes", () => {
    expect(normalizeRoomCode("abc234")).toBe("ABC234");
    expect(normalizeRoomCode("  ab c-234 ")).toBe("ABC234");
    expect(normalizeRoomCode("https://photoeye-wine.vercel.app/partners/?room=abc234")).toBe("ABC234");
  });

  it("refuse what can't be a code", () => {
    for (const bad of ["", "ABC23", "ABC2345", "ABC0O1", "https://example.com/partners/"]) {
      expect(normalizeRoomCode(bad)).toBeNull();
    }
  });
});

describe("guards", () => {
  it("know the critique tags and error codes", () => {
    expect(CRITIQUE_TAGS.every(isCritiqueTag)).toBe(true);
    expect(isCritiqueTag("#ローアングル")).toBe(false);
    expect(isRoomError("room_not_found")).toBe(true);
    expect(isRoomError("nope")).toBe(false);
  });
});
