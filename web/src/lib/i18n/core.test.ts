import { afterEach, describe, expect, it, vi } from "vitest";
import { configureI18n, deviceLang, getDateLocale, getLang, interpolate, t } from "./core";
import ja from "./ja";

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("t()", () => {
  it("returns the English key when English is on", () => {
    expect(t("Walk resumed.")).toBe("Walk resumed.");
  });

  it("translates and fills placeholders in Japanese", () => {
    configureI18n("ja", ja);
    expect(t("{n}-day streak", { n: 4 })).toBe("4日連続");
    expect(getLang()).toBe("ja");
    expect(getDateLocale()).toBe("ja-JP");
  });

  it("falls back to English for a missing translation", () => {
    configureI18n("ja", ja);
    expect(t("Not in the dictionary {x}", { x: 1 })).toBe("Not in the dictionary 1");
  });

  it("leaves unknown placeholders alone", () => {
    expect(interpolate("{a} and {b}", { a: 1 })).toBe("1 and {b}");
  });
});

describe("t() before initialization", () => {
  afterEach(() => vi.resetModules());

  it("throws in development so top-level translations get caught", async () => {
    vi.resetModules();
    const fresh = await import("./core");
    expect(() => fresh.t("Walks")).toThrow(/initI18n/);
  });
});

describe("deviceLang()", () => {
  it("follows the first device language", () => {
    expect(deviceLang(["ja-JP", "en"])).toBe("ja");
    expect(deviceLang(["en-US", "ja"])).toBe("en");
    expect(deviceLang([])).toBe("en");
  });
});

describe("Japanese dictionary", () => {
  it("keeps every placeholder in every translation", () => {
    const broken = Object.entries(ja).filter(([k, v]) => placeholders(k).join() !== placeholders(v).join());
    expect(broken).toEqual([]);
  });

  it("has no HTML entities left in keys or values", () => {
    const withEntities = Object.entries(ja).filter(([k, v]) => /&[a-z]+;/.test(k + v));
    expect(withEntities).toEqual([]);
  });

  it("has no keys that depend on element ids", () => {
    expect(Object.keys(ja).filter((k) => / id=/.test(k))).toEqual([]);
  });
});
