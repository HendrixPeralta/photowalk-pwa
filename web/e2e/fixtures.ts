// Every spec imports test and expect from here. The app requires sign-in, so
// each test starts with a pretend person signed in: the server's /api/auth
// is answered here, never by a real server, and never by Google.
//
//   test.use({ signedInAs: null })   starts on the sign-in screen
//   auth.signedInAs = null           ends the session, as the server would
//
// Starting sign-in "signs in" straight away and sends the browser back to
// where it started, as the Google round trip would.

import { test as base, type Route } from "@playwright/test";

export { expect } from "@playwright/test";
export type { Locator, Page } from "@playwright/test";

export interface FakeUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

export const TEST_USER: FakeUser = { id: "e2e-user", name: "Aki Tanaka", email: "aki@example.com", image: null };

export class FakeAuth {
  signInStarts = 0;
  signOuts = 0;
  /** When set, get-session answers with this status instead (e.g. 503 for a server that isn't set up). */
  failWith: number | null = null;

  constructor(public signedInAs: FakeUser | null) {}

  async handle(route: Route): Promise<void> {
    const path = new URL(route.request().url()).pathname.replace(/\/$/, "");
    if (this.failWith) return route.fulfill({ status: this.failWith, json: { error: "not_configured" } });
    switch (path) {
      case "/api/auth/get-session":
        return route.fulfill({
          json: this.signedInAs ? { user: this.signedInAs, session: { userId: this.signedInAs.id } } : null,
        });
      case "/api/auth/sign-in/social": {
        this.signInStarts++;
        const { callbackURL } = route.request().postDataJSON() as { callbackURL: string };
        this.signedInAs = TEST_USER;
        return route.fulfill({ json: { url: callbackURL, redirect: true } });
      }
      case "/api/auth/sign-out":
        this.signOuts++;
        this.signedInAs = null;
        return route.fulfill({ json: { success: true } });
      default:
        return route.fulfill({ status: 404, json: null });
    }
  }
}

export const test = base.extend<{ signedInAs: FakeUser | null; auth: FakeAuth }>({
  signedInAs: [TEST_USER, { option: true }],
  auth: [
    async ({ context, signedInAs }, use) => {
      const auth = new FakeAuth(signedInAs);
      await context.route("**/api/auth/**", (route) => auth.handle(route));
      await use(auth);
    },
    { auto: true },
  ],
});
