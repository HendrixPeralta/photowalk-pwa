// Proves the test toolchain runs (esbuild transform, jsdom, fake IndexedDB).
// Phase 1 replaces this with real tests for the ported lib modules.
import { describe, expect, it } from "vitest";

describe("toolchain", () => {
  it("runs TypeScript tests in jsdom", () => {
    const el = document.createElement("p");
    el.textContent = "PhotoEYE";
    expect(el).toHaveTextContent("PhotoEYE");
  });

  it("has an IndexedDB implementation", () => {
    expect(typeof indexedDB.open).toBe("function");
  });
});
