// The rooms server for e2e: the app's real rooms handlers
// (src/server/rooms/handlers.ts) on an in-memory Postgres (PGlite, with the
// real migrations) and an in-memory Blob store, answering the browser's
// /api/rooms requests through Playwright routing. Two browser contexts
// attached to the same FakeRooms are two people in the same rooms.

import type { BrowserContext } from "@playwright/test";
import { memoryBlobStore, type BlobStore } from "../src/server/blob";
import type { Db } from "../src/server/db";
import { user } from "../src/server/db/auth-schema";
import { blobTrash, blobUsage, rooms } from "../src/server/db/rooms-schema";
import { createTestDb } from "../src/server/db/testDb";
import { HttpError, withServer } from "../src/server/http";
import { handleRoomsRequest } from "../src/server/rooms/handlers";

export interface RoomsPerson {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

export class FakeRooms {
  private started: Promise<{ db: Db; blobs: BlobStore; close: () => Promise<void> }> | null = null;

  /** Sets up the database. Done when the worker starts, so no test pays for it mid-step. */
  start() {
    this.started ??= createTestDb().then(({ db, client }) => ({ db, blobs: memoryBlobStore(), close: () => client.close() }));
    return this.started;
  }

  /** Empties every room, so each test starts fresh on the same database. */
  async reset(): Promise<void> {
    if (!this.started) return;
    const { db } = await this.started;
    await db.delete(rooms);
    await db.delete(blobTrash);
    await db.delete(blobUsage);
  }

  async close(): Promise<void> {
    if (this.started) await (await this.started).close();
  }

  /** Answers this context's /api/rooms requests as whoever `who()` says is signed in. */
  async attach(context: BrowserContext, who: () => RoomsPerson | null): Promise<void> {
    await context.route("**/api/rooms/**", async (route) => {
      const { db, blobs } = await this.start();
      const sent = route.request();
      const method = sent.method();
      const body = method === "GET" || method === "HEAD" ? null : sent.postDataBuffer();
      const request = new Request(sent.url(), {
        method,
        headers: sent.headers(),
        body: body ? new Uint8Array(body) : undefined,
      });
      const res = await withServer(() => handleRoomsRequest(request, async () => {
        const me = who();
        if (!me) throw new HttpError(401, "signed_out");
        await db.insert(user).values(me).onConflictDoNothing();
        return { db, blobs: () => blobs, user: { id: me.id, name: me.name, image: me.image }, now: new Date(), later: (work) => { void work(); } };
      }));
      await route.fulfill({
        status: res.status,
        headers: Object.fromEntries(res.headers),
        body: Buffer.from(await res.arrayBuffer()),
      });
    });
  }
}
