// A fetch for the app's own API that never throws: it settles to the data, or
// to an error code the server explained, "offline" when the request didn't
// get through, or "server" for anything else. The session cookie rides along.

export type ApiResult<T, E extends string> = { ok: true; data: T } | { ok: false; error: E | "offline" | "server" };

export async function apiCall<T, E extends string>(
  path: string,
  isError: (code: unknown) => code is E,
  init: RequestInit = {},
  timeoutMs = 10_000,
): Promise<ApiResult<T, E>> {
  let res: Response;
  try {
    res = await fetch(path, { credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(timeoutMs), ...init });
  } catch {
    return { ok: false, error: "offline" };
  }
  if (res.status === 204) return { ok: true, data: undefined as T };
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // An empty or non-JSON answer: only fine for a success without a body.
  }
  if (res.ok) return { ok: true, data: body as T };
  const code = (body as { error?: unknown } | null)?.error;
  return { ok: false, error: isError(code) ? code : "server" };
}

/** A JSON POST. */
export const postJson = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});
