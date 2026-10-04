import { describe, expect, it, vi } from "vitest";

describe("dev URL switches", () => {
  it("are read once and dropped from the address, leaving other parameters", async () => {
    window.history.replaceState(null, "", "/album/?demo=7&photos=seed&room=ABC234#top");
    vi.resetModules();
    const { takeDevParams } = await import("./devParams");
    expect(takeDevParams()).toEqual({ demo: "7", history: null, photos: "seed" });
    expect(window.location.pathname + window.location.search + window.location.hash).toBe("/album/?room=ABC234#top");
    // Asked again later in the same page, the answer is the same.
    expect(takeDevParams().photos).toBe("seed");
  });
});
