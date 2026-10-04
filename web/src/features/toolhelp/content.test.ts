import { describe, expect, it } from "vitest";
import { configureI18n } from "@/lib/i18n/core";
import ja from "@/lib/i18n/ja";
import { legacy } from "@/test/legacy";
import { TOOL_KEYS, toolHelp } from "./content";

describe("tool help", () => {
  it("matches the old app's help text in English", async () => {
    const old = await legacy("toolhelp.js");
    expect(TOOL_KEYS).toEqual(Object.keys(old.TOOL_HELP));
    for (const key of TOOL_KEYS) {
      const fresh = toolHelp(key);
      const previous = old.TOOL_HELP[key];
      expect(JSON.parse(JSON.stringify(fresh))).toEqual(JSON.parse(JSON.stringify(previous)));
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
