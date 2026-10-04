// UI language. The English text itself is the lookup key: t('Walk resumed.')
// returns the Japanese string when Japanese is on, and the English text when
// it is off or a translation is missing, so an untranslated string degrades
// to English instead of to a raw key.
//
// The language is fixed for the life of the page. Switching saves the choice
// and reloads, so data built from translated strings (themes, help text) and
// everything already rendered come back in the new language without
// re-render plumbing.
//
// Unlike the old module, nothing here touches the browser at import time:
// initI18n() runs once during boot, before any screen renders. In development
// and tests, calling t() before that throws, which catches strings translated
// at module top level (they would freeze in whatever language loaded first).

export type Lang = "en" | "ja";
export type LangChoice = Lang | "auto";
export type TParams = Record<string, string | number>;
type Dict = Record<string, string>;

export const LANG_STORAGE_KEY = "photoeye-lang";

export const LANGS: ReadonlyArray<{ code: Lang; label: string }> = [
  { code: "en", label: "English" },
  { code: "ja", label: "日本語" },
];

let lang: Lang = "en";
let choice: LangChoice = "auto";
let dict: Dict = {};
let ready = false;

const isLang = (code: unknown): code is Lang => LANGS.some((l) => l.code === code);

/** 'ja' when the device's first language is Japanese, otherwise 'en'. */
export function deviceLang(languages: readonly string[] = browserLanguages()): Lang {
  return (languages[0] ?? "").toLowerCase().startsWith("ja") ? "ja" : "en";
}

function browserLanguages(): readonly string[] {
  if (typeof navigator === "undefined") return [];
  return navigator.languages?.length ? navigator.languages : [navigator.language ?? ""];
}

function savedChoice(): Lang | null {
  try {
    const saved = localStorage.getItem(LANG_STORAGE_KEY);
    return isLang(saved) ? saved : null;
  } catch {
    return null; // storage blocked: follow the device
  }
}

/** Sets the language synchronously. Used by initI18n() and by tests. */
export function configureI18n(next: Lang, nextDict: Dict = {}, nextChoice: LangChoice = next): void {
  lang = next;
  choice = nextChoice;
  dict = next === "en" ? {} : nextDict;
  ready = true;
}

/**
 * Reads the saved pick (or follows the device), loads the Japanese dictionary
 * only when it is needed, and marks the page's language. Call once at boot.
 */
export async function initI18n(): Promise<Lang> {
  const saved = savedChoice();
  const next = saved ?? deviceLang();
  const nextDict = next === "ja" ? (await import("./ja")).default : {};
  configureI18n(next, nextDict, saved ?? "auto");
  if (typeof document !== "undefined") document.documentElement.lang = next;
  return next;
}

function assertReady(): void {
  if (!ready && process.env.NODE_ENV !== "production") {
    throw new Error("t() called before initI18n(). Translate inside a function or component, not at module top level.");
  }
}

/** Fills {name} placeholders from `params`. Unknown placeholders are left as is. */
export function interpolate(text: string, params?: TParams): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, key: string) => (key in params ? String(params[key]) : match));
}

/**
 * Translates `text`, then fills {name} placeholders from `params`.
 * t('{n} photos logged.', { n: 3 })
 */
export function t(text: string, params?: TParams): string {
  assertReady();
  const out = Object.prototype.hasOwnProperty.call(dict, text) ? dict[text] : text;
  return interpolate(out, params);
}

export const getLang = (): Lang => lang;
export const getLangChoice = (): LangChoice => choice;

/** For toLocale*String(): Japanese pins ja-JP; English keeps the browser's own locale. */
export const getDateLocale = (): string | undefined => (lang === "ja" ? "ja-JP" : undefined);

/**
 * 'en' / 'ja' pins a language; 'auto' goes back to following the device.
 * Returns true when the visible language changes, in which case the caller
 * reloads the page (the language is fixed per page load).
 */
export function setLang(code: LangChoice): boolean {
  if (code === choice) return false;
  if (code !== "auto" && !isLang(code)) return false;
  try {
    if (code === "auto") localStorage.removeItem(LANG_STORAGE_KEY);
    else localStorage.setItem(LANG_STORAGE_KEY, code);
  } catch {
    return false;
  }
  choice = code;
  const next = code === "auto" ? deviceLang() : code;
  return next !== lang;
}
