// Sign-in, with Better Auth. Google is the only way in; Better Auth keeps the
// people, sessions and linked Google accounts in our own database, and hands
// the browser an http-only session cookie.

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getDb, type Db } from "./db";
import * as authSchema from "./db/auth-schema";
import { requireEnv } from "./env";

export interface AuthSettings {
  /** Where the app is served, e.g. https://photoeye-wine.vercel.app */
  baseURL: string;
  secret: string;
  google: { clientId: string; clientSecret: string };
}

const DAY = 24 * 60 * 60;

export function createAuth(db: Db, settings: AuthSettings) {
  return betterAuth({
    baseURL: settings.baseURL,
    secret: settings.secret,
    database: drizzleAdapter(db, { provider: "pg", schema: authSchema }),
    socialProviders: {
      google: {
        ...settings.google,
        // Lets someone with several Google accounts pick one every time,
        // rather than being signed in to whichever one the browser has.
        prompt: "select_account",
      },
    },
    session: {
      // PhotoEYE goes out on walks with no signal, so a session lasts long
      // and is renewed (at most daily) whenever the app is used online.
      expiresIn: 60 * DAY,
      updateAge: DAY,
      // Saves a database read on most session checks.
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    // Better Auth skips its origin and callback URL checks when NODE_ENV is
    // "test"; pinning them on means the tests exercise what production runs.
    advanced: { disableOriginCheck: false },
  });
}

export type Auth = ReturnType<typeof createAuth>;

let auth: Auth | null = null;

/** The app's Better Auth instance, built on first use from the server's settings. */
export function getAuth(): Auth {
  if (auth) return auth;
  const env = requireEnv("BETTER_AUTH_URL", "BETTER_AUTH_SECRET", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET");
  auth = createAuth(getDb(), {
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET },
  });
  return auth;
}

/**
 * The app's URLs end in a slash (trailingSlash in next.config.ts), Better
 * Auth's don't. A request for /api/auth/get-session/ goes to Better Auth as
 * /api/auth/get-session. The body is read up front because a streamed body
 * can't be handed to a new Request without extra options.
 */
export async function withoutTrailingSlash(req: Request): Promise<Request> {
  const url = new URL(req.url);
  if (!url.pathname.endsWith("/")) return req;
  url.pathname = url.pathname.replace(/\/+$/, "");
  const body = req.method === "GET" || req.method === "HEAD" ? undefined : await req.arrayBuffer();
  return new Request(url, { method: req.method, headers: req.headers, body });
}
