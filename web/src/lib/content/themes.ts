import { getLang, t } from "../i18n/core";
import { RAW_CONCEPTS, RAW_THEMES } from "./catalog";

/** A walk theme. Custom themes share this shape (and are stored already in the user's words). */
export interface Theme {
  id: string;
  title: string;
  brief: string;
  concepts: string[];
  challenges: string[];
}

export interface Concept { title: string; tip: string }

// Translated once per language; the language is fixed for a page's life, so
// in practice this is built once.
let cache: { lang: string; themes: Theme[] } | null = null;

/** The built-in themes, translated. Same order as the old app. */
export function themes(): Theme[] {
  const lang = getLang();
  if (cache?.lang !== lang) {
    cache = {
      lang,
      themes: RAW_THEMES.map((th) => ({
        id: th.id,
        title: t(th.title),
        brief: t(th.brief),
        concepts: [...th.concepts],
        challenges: th.challenges.map((c) => t(c)),
      })),
    };
  }
  return cache.themes;
}

export function themeById(id: string | null | undefined, custom: readonly Theme[] = []): Theme | undefined {
  if (!id) return undefined;
  return themes().find((th) => th.id === id) ?? custom.find((th) => th.id === id);
}

/** A composition concept's translated title and tip, or undefined for an unknown key. */
export function concept(key: string): Concept | undefined {
  const raw = RAW_CONCEPTS[key];
  return raw && { title: t(raw.title), tip: t(raw.tip) };
}

/** Every built-in mini-challenge, deduped, for the custom theme builder's picklist. */
export function allChallenges(): string[] {
  const seen = new Set<string>();
  const list: string[] = [];
  for (const th of themes()) {
    for (const c of th.challenges) {
      if (!seen.has(c)) { seen.add(c); list.push(c); }
    }
  }
  return list;
}

// Themes that live or die on low, warm sun: worth steering toward in the late
// afternoon, and frustrating to hand someone after dark.
const LOW_SUN_THEMES = ["golden-hour", "shadows-silhouettes"];

// Themes that only work after dark: pointless to suggest in daylight.
const NIGHT_THEMES = ["night-lights"];

type DayBucket = "golden" | "dark" | "day";

function timeOfDayBucket(now: Date): DayBucket {
  const h = now.getHours();
  if (h >= 16 && h < 20) return "golden";
  if (h >= 20 || h < 6) return "dark";
  return "day";
}

// Golden hour nudges toward low-sun themes by knocking this many walks off
// their practice count, rather than locking the pool to only them: a theme
// you've truly never walked can still win, so New Theme keeps some variety.
const GOLDEN_HOUR_DISCOUNT = 2;

/**
 * Picks the next theme with a reason the user can see: dark hours drop themes
 * that need light entirely, golden hour biases toward low-sun themes without
 * excluding the rest, and the least-practiced theme in what remains wins, so
 * the generator spreads practice instead of repeating.
 *
 * @param excludeId theme to avoid (usually the one on screen)
 * @param counts walks completed per theme id
 * @param random injectable for tests; picks among equally practiced themes
 */
export function suggestTheme(
  excludeId: string | null | undefined,
  counts: Record<string, number> = {},
  now: Date = new Date(),
  random: () => number = Math.random,
): { theme: Theme; reason: string } {
  const bucket = timeOfDayBucket(now);
  let pool = themes().filter((th) => th.id !== excludeId);
  if (bucket !== "dark") {
    const daylight = pool.filter((th) => !NIGHT_THEMES.includes(th.id));
    if (daylight.length) pool = daylight;
  }

  let candidates = pool;
  if (bucket === "dark") {
    const afterDark = pool.filter((th) => !LOW_SUN_THEMES.includes(th.id));
    if (afterDark.length) candidates = afterDark;
  }

  const effectiveCount = (th: Theme) => {
    const base = counts[th.id] || 0;
    return bucket === "golden" && LOW_SUN_THEMES.includes(th.id) ? Math.max(0, base - GOLDEN_HOUR_DISCOUNT) : base;
  };

  const fewest = Math.min(...candidates.map(effectiveCount));
  const leastPracticed = candidates.filter((th) => effectiveCount(th) === fewest);
  const theme = leastPracticed[Math.floor(random() * leastPracticed.length)];

  let reason: string;
  if (bucket === "golden" && LOW_SUN_THEMES.includes(theme.id)) {
    reason = t("The sun is getting low, perfect timing for this one.");
  } else if (NIGHT_THEMES.includes(theme.id)) {
    reason = t("It's dark out, perfect timing for this one.");
  } else {
    reason = (counts[theme.id] || 0) === 0
      ? t("You haven't walked this theme yet.")
      : t("One of your least-practiced themes.");
  }
  return { theme, reason };
}
