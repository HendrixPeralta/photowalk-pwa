// The Theme Market server for e2e: the app's real themes handlers
// (src/server/themes/handlers.ts) on the same in-memory Postgres as
// FakeRooms, answering the browser's /api/themes requests through Playwright
// routing. Two browser contexts attached to it see the same Market.

import type { BrowserContext } from "@playwright/test";
import type { Db } from "../src/server/db";
import { user } from "../src/server/db/auth-schema";
import { sharedThemes } from "../src/server/db/themes-schema";
import { HttpError, withServer } from "../src/server/http";
import { handleThemesRequest } from "../src/server/themes/handlers";
import type { RoomsPerson } from "./rooms";

/** Empties the Market, so each test starts fresh on the same database. */
export async function resetThemes(db: Db): Promise<void> {
  await db.delete(sharedThemes);
}

/** Answers this context's /api/themes requests as whoever `who()` says is signed in. */
export async function attachThemes(context: BrowserContext, database: () => Promise<Db>, who: () => RoomsPerson | null): Promise<void> {
  await context.route("**/api/themes/**", async (route) => {
    const db = await database();
    const sent = route.request();
    const method = sent.method();
    const body = method === "GET" || method === "HEAD" ? null : sent.postDataBuffer();
    const request = new Request(sent.url(), { method, headers: sent.headers(), body: body ? new Uint8Array(body) : undefined });
    const res = await withServer(() => handleThemesRequest(request, async () => {
      const me = who();
      if (!me) throw new HttpError(401, "signed_out");
      await db.insert(user).values(me).onConflictDoNothing();
      return { db, user: { id: me.id, name: me.name, image: me.image }, now: new Date() };
    }));
    await route.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: Buffer.from(await res.arrayBuffer()) });
  });
}
