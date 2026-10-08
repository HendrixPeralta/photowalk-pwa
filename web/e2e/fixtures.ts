// Every spec imports test and expect from here. The app requires sign-in, so
// each test starts with a pretend person signed in: the server's /api/auth
// is answered here, never by a real server, and never by Google.
//
//   test.use({ signedInAs: null })   starts on the sign-in screen
//   auth.signedInAs = null           ends the session, as the server would
//
// Starting sign-in "signs in" straight away and sends the browser back to
// where it started, as the Google round trip would.
//
// Walk Partners rooms are answered by FakeRooms (e2e/rooms.ts): the real
// rooms handlers on an in-memory database, one per worker, emptied before
// each test. openAs(person) opens a second browser as someone else, in the
// same rooms.

import { test as base, type Browser, type Page, type Route } from "@playwright/test";
import { FakeRooms } from "./rooms";

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

/** Someone else, for two-person tests. */
export const PARTNER: FakeUser = { id: "e2e-partner", name: "Ken Ito", email: "ken@example.com", image: null };

async function openPerson(browser: Browser, rooms: FakeRooms, person: FakeUser, baseURL: string | undefined, contextOptions: object) {
  const context = await browser.newContext({ ...contextOptions, baseURL });
  const auth = new FakeAuth(person);
  await context.route("**/api/auth/**", (route) => auth.handle(route));
  await rooms.attach(context, () => auth.signedInAs);
  return { context, page: await context.newPage(), auth };
}

export const test = base.extend<
  { signedInAs: FakeUser | null; auth: FakeAuth; openAs: (person: FakeUser) => Promise<Page> },
  { rooms: FakeRooms }
>({
  rooms: [
    async ({}, use) => {
      const rooms = new FakeRooms();
      await rooms.start();
      await use(rooms);
      await rooms.close();
    },
    { scope: "worker" },
  ],
  signedInAs: [TEST_USER, { option: true }],
  auth: [
    async ({ context, signedInAs, rooms }, use) => {
      const auth = new FakeAuth(signedInAs);
      await context.route("**/api/auth/**", (route) => auth.handle(route));
      await rooms.reset();
      await rooms.attach(context, () => auth.signedInAs);
      await use(auth);
    },
    { auto: true },
  ],
  // Named provide, not use: ESLint's React hook rule misreads `use` here.
  openAs: async ({ browser, rooms, baseURL, contextOptions }, provide) => {
    const opened: { close: () => Promise<void> }[] = [];
    await provide(async (person) => {
      const { context, page } = await openPerson(browser, rooms, person, baseURL, contextOptions);
      opened.push(context);
      return page;
    });
    for (const context of opened) await context.close();
  },
});
