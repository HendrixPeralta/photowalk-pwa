// The three sign-in calls the app makes to the server's /api/auth (Better
// Auth): who is signed in, start Google sign-in, sign out. Plain fetches on
// the app's slashed URLs, rather than Better Auth's client, which would add
// weight for three requests. The session itself is an http-only cookie the
// browser sends along; nothing here stores a token.

export interface AccountUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

export type SessionCheck =
  | { kind: "user"; user: AccountUser }
  | { kind: "none" }
  /** Offline, timed out, or the server is down or not set up. */
  | { kind: "unreachable" };

/**
 * Accounts need the server. The static export (the future phone app) has
 * none yet, so it keeps working on the device alone until it gets its own
 * way to sign in.
 */
export function accountsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_STATIC_EXPORT !== "1";
}

export async function fetchSession(timeoutMs = 8000): Promise<SessionCheck> {
  try {
    const res = await fetch("/api/auth/get-session/", {
      credentials: "same-origin",
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return { kind: "unreachable" };
    const body = (await res.json()) as { user?: Partial<AccountUser> } | null;
    const user = body?.user;
    if (!user?.id) return { kind: "none" };
    return {
      kind: "user",
      user: { id: user.id, name: user.name ?? "", email: user.email ?? "", image: user.image ?? null },
    };
  } catch {
    return { kind: "unreachable" };
  }
}

/**
 * Sends the browser to Google. Once Google is done the server signs the
 * person in and brings them back to returnTo (with ?error=... appended if it
 * failed). Rejects when sign-in couldn't start, e.g. offline.
 */
export async function startGoogleSignIn(returnTo: string): Promise<void> {
  const res = await fetch("/api/auth/sign-in/social/", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ provider: "google", callbackURL: returnTo, errorCallbackURL: returnTo }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Sign-in did not start (${res.status})`);
  const { url } = (await res.json()) as { url?: string };
  if (!url) throw new Error("Sign-in did not start (no URL)");
  window.location.assign(url);
}

/** Ends the session on the server. False when that didn't happen. */
export async function endSession(): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/sign-out/", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
