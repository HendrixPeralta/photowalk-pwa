import { afterEach, describe, expect, it, vi } from "vitest";
import { configureI18n } from "../i18n/core";
import ja from "../i18n/ja";
import { RAW_CONCEPTS, RAW_THEMES } from "./catalog";
import { allChallenges, concept, suggestTheme, themes } from "./themes";

afterEach(() => vi.restoreAllMocks());

describe("theme catalog", () => {
  it("has 24 themes with a brief, and challenges pooled without repeats", () => {
    expect(themes()).toHaveLength(24);
    for (const th of themes()) expect(th.title && th.brief).toBeTruthy();
    const pool = allChallenges();
    expect(new Set(pool).size).toBe(pool.length);
    expect(pool).toEqual(expect.arrayContaining(themes()[0].challenges));
  });

  it("keeps every concept the themes refer to", () => {
    for (const key of Object.keys(RAW_CONCEPTS)) expect(concept(key)?.title).toBeTruthy();
    const referenced = new Set(RAW_THEMES.flatMap((th) => th.concepts));
    for (const key of referenced) expect(RAW_CONCEPTS[key], key).toBeDefined();
  });

  it("has a Japanese translation for every theme string", () => {
    const strings = [
      ...RAW_THEMES.flatMap((th) => [th.title, th.brief, ...th.challenges]),
      ...Object.values(RAW_CONCEPTS).flatMap((c) => [c.title, c.tip]),
    ];
    expect(strings.filter((s) => !(s in ja))).toEqual([]);
  });

  it("translates when Japanese is on", () => {
    configureI18n("ja", ja);
    expect(themes()[0].title).toBe(ja[RAW_THEMES[0].title]);
  });
});

describe("suggestTheme", () => {
  it.each([
    ["morning", new Date(2026, 5, 1, 9, 0)],
    ["golden hour", new Date(2026, 5, 1, 17, 30)],
    ["night", new Date(2026, 5, 1, 22, 0)],
  // What the old app picked for each roll when ported; the snapshot keeps it so.
  ])("picks the same in the %s", (_label, now) => {
    const counts = { "golden-hour": 3, "leading-lines": 1, "night-lights": 0, reflections: 2 };
    const picks = [];
    for (let i = 0; i < 20; i++) {
      const roll = (i + 0.5) / 20;
      const { theme, reason } = suggestTheme("reflections", counts, now, () => roll);
      picks.push(`${theme.id}: ${reason}`);
    }
    expect(picks).toMatchSnapshot();
  });

  it("never suggests night themes in daylight or the excluded theme", () => {
    for (let i = 0; i < 50; i++) {
      const { theme } = suggestTheme("leading-lines", {}, new Date(2026, 5, 1, 11, 0));
      expect(theme.id).not.toBe("night-lights");
      expect(theme.id).not.toBe("leading-lines");
    }
  });
});
