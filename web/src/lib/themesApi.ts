// The app's side of the Theme Market API (src/server/themes/handlers.ts lists
// the endpoints). Every call settles to data or an error code, never a throw.

import { apiCall, postJson, type ApiResult } from "./apiCall";
import { accountsEnabled } from "./authApi";
import { isThemeError, type MarketSort, type PublishedFields, type SharedTheme, type ThemeError } from "./themes/protocol";

export type ThemesFailure = ThemeError | "offline" | "server";
export type ThemesResult<T> = ApiResult<T, ThemeError>;

/** The Market lives on the server, so it needs the same build that has accounts. */
export const marketEnabled = accountsEnabled;

const call = <T>(path: string, init: RequestInit = {}): Promise<ThemesResult<T>> => apiCall<T, ThemeError>(path, isThemeError, init);

export const themesApi = {
  list: (sort: MarketSort, q: string, offset: number) => {
    const params = new URLSearchParams({ sort, offset: String(offset) });
    if (q.trim()) params.set("q", q.trim());
    return call<{ themes: SharedTheme[]; more: boolean }>(`/api/themes/?${params}`);
  },
  mine: () => call<{ themes: SharedTheme[] }>("/api/themes/mine/"),
  publish: (fields: PublishedFields) => call<{ theme: SharedTheme }>("/api/themes/publish/", postJson(fields)),
  unpublish: (id: string) => call<undefined>("/api/themes/unpublish/", postJson({ id })),
  add: (id: string) => call<{ theme: SharedTheme }>("/api/themes/add/", postJson({ id })),
  report: (id: string) => call<undefined>("/api/themes/report/", postJson({ id })),
};
