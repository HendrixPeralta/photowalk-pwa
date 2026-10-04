import { describe, expect, it } from "vitest";
import { configureI18n } from "@/lib/i18n/core";
import ja from "@/lib/i18n/ja";
import { TOOL_KEYS, toolHelp } from "./content";

describe("tool help", () => {
  it("covers every tool, each with what, how, good, bad and references", () => {
    expect(TOOL_KEYS).toEqual(["composition", "gamut", "histogram", "tonalkey", "waveform", "parade", "vectorscope", "cie", "tonecurve"]);
    for (const key of TOOL_KEYS) {
      const help = toolHelp(key);
      for (const text of [help.title, help.what, help.read, help.good, help.bad]) expect(text, key).toBeTruthy();
      expect(help.refs.length, key).toBeGreaterThan(0);
    }
  });

  it("switches to Japanese text and Japanese Wikipedia where one exists", () => {
    configureI18n("ja", ja);
    const help = toolHelp("composition");
    expect(help.title).toBe(ja["Composition Guides"]);
    expect(help.refs.some((r) => r.url?.startsWith("https://ja.wikipedia.org/"))).toBe(true);
    for (const key of TOOL_KEYS) {
      const h = toolHelp(key);
      for (const text of [h.title, h.what, h.read, h.good, h.bad]) expect(text in ja || Object.values(ja).includes(text)).toBe(true);
    }
  });
});
