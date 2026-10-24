// The Theme Market from the app's side: which of my themes are published,
// and the actions behind Publish, Unpublish, Add and Report. Each action
// tells the person how it went with a toast and returns whether it worked.

import { create } from "zustand";
import { t } from "@/lib/i18n/core";
import { themesApi, type ThemesFailure } from "@/lib/themesApi";
import type { SharedTheme } from "@/lib/themes/protocol";
import { uid } from "@/lib/util";
import { getData, update } from "@/state/appStore";
import type { CustomTheme } from "@/state/types";
import { showToast } from "@/state/ui";

/** My published themes by the id of the theme on this phone they came from. Null until loaded. */
export const usePublished = create<{ bySource: Record<string, SharedTheme> | null }>(() => ({ bySource: null }));

function remember(theme: SharedTheme): void {
  if (!theme.sourceId) return;
  usePublished.setState((s) => ({ bySource: { ...s.bySource, [theme.sourceId!]: theme } }));
}

function forget(id: string): void {
  usePublished.setState((s) => {
    if (!s.bySource) return s;
    return { bySource: Object.fromEntries(Object.entries(s.bySource).filter(([, th]) => th.id !== id)) };
  });
}

/** How many people added a theme, in words. */
export function addedLabel(n: number): string {
  if (n === 0) return t("Not added yet");
  return n === 1 ? t("Added once") : t("Added {n} times", { n });
}

export function challengeCountLabel(n: number): string {
  return n === 1 ? t("{n} challenge", { n }) : t("{n} challenges", { n });
}

export function themeErrorMessage(error: ThemesFailure): string {
  switch (error) {
    case "too_many_themes": return t("You've published 20 themes. Unpublish one first.");
    case "not_found": return t("That theme isn't on the Market anymore.");
    case "own_theme": return t("That's your own theme.");
    case "signed_out": return t("Your session ended. Sign in again.");
    case "not_configured": return t("The Theme Market isn't set up on this server yet.");
    case "offline": return t("You're offline. Connect to use the Theme Market.");
    case "invalid":
    case "forbidden":
    case "server":
      return t("Couldn't reach the server. Try again.");
  }
}

/** Fetches which of my themes are published. Quietly keeps what it had if that fails. */
export async function refreshPublished(): Promise<void> {
  const res = await themesApi.mine();
  if (!res.ok) return;
  const bySource: Record<string, SharedTheme> = {};
  for (const theme of res.data.themes) if (theme.sourceId) bySource[theme.sourceId] = theme;
  usePublished.setState({ bySource });
}

/** Publishes one of my themes, or sends the Market its latest version. */
export async function publishOwnTheme(theme: CustomTheme): Promise<boolean> {
  const wasPublished = Boolean(usePublished.getState().bySource?.[theme.id]);
  const res = await themesApi.publish({
    sourceId: theme.id,
    title: theme.title,
    brief: theme.brief,
    concepts: theme.concepts,
    challenges: theme.challenges,
  });
  if (!res.ok) { showToast(themeErrorMessage(res.error)); return false; }
  remember(res.data.theme);
  showToast(wasPublished ? t("Market copy updated.") : t("Published to the Theme Market."));
  return true;
}

export async function unpublishShared(id: string): Promise<boolean> {
  const res = await themesApi.unpublish(id);
  if (!res.ok && res.error !== "not_found") { showToast(themeErrorMessage(res.error)); return false; }
  forget(id);
  showToast(t("Taken off the Theme Market."));
  return true;
}

/** My copy of a Market theme, if I have one. */
export function localCopyOf(marketId: string): CustomTheme | undefined {
  return getData().customThemes.find((th) => th.market?.id === marketId);
}

/** Saves my own copy of someone's theme into My Themes. */
export async function addFromMarket(shared: SharedTheme): Promise<boolean> {
  if (localCopyOf(shared.id)) return true;
  const res = await themesApi.add(shared.id);
  if (!res.ok) { showToast(themeErrorMessage(res.error)); return false; }
  const theme = res.data.theme;
  update((d) => {
    d.customThemes.push({
      id: uid(),
      title: theme.title,
      brief: theme.brief,
      concepts: [...theme.concepts],
      challenges: [...theme.challenges],
      market: { id: theme.id, author: theme.author.name },
    });
  });
  showToast(t("Added to My Themes."));
  return true;
}

export async function reportShared(id: string): Promise<boolean> {
  const res = await themesApi.report(id);
  if (!res.ok && res.error !== "not_found") { showToast(themeErrorMessage(res.error)); return false; }
  showToast(t("Thanks for the report. You won't see this theme again."));
  return true;
}
