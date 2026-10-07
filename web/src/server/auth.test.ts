// @vitest-environment node

import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuth, withoutTrailingSlash, type Auth } from "./auth";
import { createTestDb } from "./db/testDb";
import { requireUser } from "./session";

const BASE = "http://localhost:3000";

describe("auth", () => {
  let client: PGlite;
  let auth: Auth;
  const call = async (path: string, init?: RequestInit) =>
    auth.handler(await withoutTrailingSlash(new Request(BASE + path, init)));

  beforeAll(async () => {
    const test = await createTestDb();
    client = test.client;
    auth = createAuth(test.db, {
      baseURL: BASE,
      secret: "test-secret-that-is-long-enough-for-better-auth",
      google: { clientId: "google-id", clientSecret: "google-secret" },
    });
  });
  afterAll(() => client.close());

  it("answers the app's slashed URLs", async () => {
    const res = await call("/api/auth/get-session/");
    expect(res.status).toBe(200);
    expect(await res.json()).toBeNull();
  });

  it("starts Google sign-in with a callback to this app", async () => {
    const res = await call("/api/auth/sign-in/social/", {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE },
      body: JSON.stringify({ provider: "google", callbackURL: "/settings/" }),
    });
    expect(res.status).toBe(200);
    const { url } = (await res.json()) as { url: string };
    const google = new URL(url);
    expect(google.hostname).toBe("accounts.google.com");
    expect(google.searchParams.get("client_id")).toBe("google-id");
    expect(google.searchParams.get("redirect_uri")).toBe(`${BASE}/api/auth/callback/google`);
    expect(google.searchParams.get("prompt")).toBe("select_account");
    expect(res.headers.get("set-cookie")).toContain("state");
  });

  it("refuses sign-in started from another site", async () => {
    const res = await call("/api/auth/sign-in/social/", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://evil.example" },
      body: JSON.stringify({ provider: "google", callbackURL: "https://evil.example/" }),
    });
    expect(res.status).toBe(403);
  });

  it("refuses API requests from someone who isn't signed in", async () => {
    await expect(requireUser(new Request(`${BASE}/api/rooms/`), auth)).rejects.toMatchObject({ status: 401, code: "signed_out" });
  });

  it("leaves URLs without a slash alone", async () => {
    const req = new Request(`${BASE}/api/auth/get-session`);
    expect(await withoutTrailingSlash(req)).toBe(req);
  });
});
