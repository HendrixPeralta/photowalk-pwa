// UI language. The English text itself is the lookup key: t('Walk resumed.')
// returns the Japanese string when Japanese is on, and the English text when
// it is off or a translation is missing, so an untranslated string degrades
// to English instead of to a raw key.
//
// The language is fixed for the life of the page. Switching saves the choice
// and reloads, so module-level data (themes, help text) and everything already
// rendered come back in the new language without per-view re-render plumbing.
import JA from './i18n-ja.js';

const STORAGE_KEY = 'photoeye-lang';

export const LANGS = [
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' }
];

function deviceLang() {
  const device = (navigator.languages && navigator.languages[0]) || navigator.language || '';
  return device.toLowerCase().startsWith('ja') ? 'ja' : 'en';
}

function savedLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return LANGS.some((l) => l.code === saved) ? saved : null;
  } catch (err) { return null; /* storage blocked: follow the device */ }
}

// 'auto' until the user picks a language in Settings; then that pick sticks.
export const langChoice = savedLang() || 'auto';
export const lang = langChoice === 'auto' ? deviceLang() : langChoice;
// Tracks picks made without a reload (e.g. Device when the device is English
// and English is showing), so a later tap compares against the latest pick.
let currentChoice = langChoice;

// For toLocale*String(): Japanese pins ja-JP; English keeps the browser's own
// locale, as the app always has, so dates still read the way the user expects.
export const dateLocale = lang === 'ja' ? 'ja-JP' : undefined;

const DICT = lang === 'ja' ? JA : {};

/**
 * Translates `text`, then fills {name} placeholders from `params`.
 * t('{n} photos logged.', { n: 3 })
 */
export function t(text, params) {
  let out = Object.prototype.hasOwnProperty.call(DICT, text) ? DICT[text] : text;
  if (params) out = out.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m));
  return out;
}

/** 'en' / 'ja' pins a language; 'auto' goes back to following the device. */
export function setLang(code) {
  if (code === currentChoice) return;
  if (code !== 'auto' && !LANGS.some((l) => l.code === code)) return;
  try {
    if (code === 'auto') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, code);
  } catch (err) { return; }
  currentChoice = code;
  // Only reload if the visible language actually changes.
  const next = code === 'auto' ? deviceLang() : code;
  if (next === lang) {
    document.querySelectorAll('#langRow [data-lang]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.lang === code);
    });
    return;
  }
  window.location.reload();
}

const ATTRS = ['placeholder', 'aria-label', 'title', 'alt'];
const collapse = (s) => s.replace(/\s+/g, ' ').trim();

/**
 * Translates the static markup in index.html once at boot. Plain text nodes
 * and the ATTRS above are matched by their (whitespace-collapsed) English
 * text. Elements whose sentence wraps inline markup carry data-i18n-html and
 * are matched on their collapsed innerHTML, so the translation can move the
 * <strong>/<span> to wherever Japanese word order needs it.
 */
export function translateDom(root = document.body) {
  document.documentElement.lang = lang;
  if (lang === 'en') return;

  root.querySelectorAll('[data-i18n-html]').forEach((el) => {
    const key = collapse(el.innerHTML);
    if (Object.prototype.hasOwnProperty.call(DICT, key)) el.innerHTML = DICT[key];
  });

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const parent = node.parentElement;
      if (!parent || parent.closest('script, style, [data-i18n-html], [data-no-i18n]')) return NodeFilter.FILTER_REJECT;
      return node.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    }
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach((node) => {
    const key = collapse(node.nodeValue);
    if (!Object.prototype.hasOwnProperty.call(DICT, key)) return;
    const lead = node.nodeValue.match(/^\s*/)[0];
    const trail = node.nodeValue.match(/\s*$/)[0];
    node.nodeValue = lead + DICT[key] + trail;
  });

  ATTRS.forEach((attr) => {
    root.querySelectorAll(`[${attr}]`).forEach((el) => {
      const key = collapse(el.getAttribute(attr));
      if (Object.prototype.hasOwnProperty.call(DICT, key)) el.setAttribute(attr, DICT[key]);
    });
  });
}
