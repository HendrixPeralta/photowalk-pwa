import type { Route } from "next";
import { t } from "@/lib/i18n/core";

/**
 * One URL per screen. The keys are the old app's view names, so ported calls
 * like navigateTo('share') map across one to one.
 */
export const ROUTES = {
  walks: "/",
  hud: "/live",
  analyze: "/analysis",
  album: "/album",
  share: "/partners",
  settings: "/settings",
  themes: "/themes",
  learn: "/learn",
} as const satisfies Record<string, Route>;

export type View = keyof typeof ROUTES;

/** The view a URL path belongs to, or null for anything else. */
export function viewForPath(pathname: string): View | null {
  // With trailingSlash on, the browser shows /live/ for the /live route.
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const entry = (Object.entries(ROUTES) as [View, string][]).find(([, route]) => route === path);
  return entry ? entry[0] : null;
}

/** The title shown under the wordmark in the top bar. */
export function screenTitle(view: View | null): string {
  switch (view) {
    case "walks": return t("Walks");
    case "hud": return t("Live Walk");
    case "analyze": return t("Analysis");
    case "album": return t("Album");
    case "share": return t("Partners");
    case "settings": return t("Settings");
    case "themes": return t("My Themes");
    case "learn": return t("Tutorials");
    default: return "PhotoEYE";
  }
}
