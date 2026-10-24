// What the app and the server agree on about the Theme Market: the limits,
// the shape of a shared theme as the server sends it, and the error codes.
// Shared by both sides, so it imports nothing from either.

export const LIMITS = {
  title: 60,
  brief: 140,
  challenge: 140,
  challengesPerTheme: 30,
  concepts: 12,
  concept: 40,
  sourceId: 64,
  publishedPerUser: 20,
  pageSize: 30,
  search: 60,
  /** Reports from this many different people hide a theme until it's reviewed. */
  reportsToHide: 3,
} as const;

export type MarketSort = "popular" | "new";

/** A published theme, as the Market lists it. */
export interface SharedTheme {
  id: string;
  /** The author's own theme it was published from. Only sent to the author. */
  sourceId: string | null;
  title: string;
  brief: string;
  concepts: string[];
  challenges: string[];
  author: { name: string; image: string | null };
  addCount: number;
  createdAt: number;
  updatedAt: number;
  mine: boolean;
  /** I've added it to My Themes before. */
  added: boolean;
  /** Hidden by reports; only its author still sees it. */
  hidden: boolean;
}

/** What publishing sends: the theme as it is on the author's phone. */
export interface PublishedFields {
  sourceId: string;
  title: string;
  brief: string;
  concepts: string[];
  challenges: string[];
}

export const THEME_ERRORS = [
  "signed_out", "not_configured", "invalid", "not_found", "forbidden", "too_many_themes", "own_theme",
] as const;
export type ThemeError = (typeof THEME_ERRORS)[number];

export const isThemeError = (code: unknown): code is ThemeError =>
  typeof code === "string" && (THEME_ERRORS as readonly string[]).includes(code);
