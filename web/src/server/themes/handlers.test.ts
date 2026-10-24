// @vitest-environment node

import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../db";
import { user } from "../db/auth-schema";
import { createTestDb } from "../db/testDb";
import { withServer } from "../http";
import { handleThemesRequest } from "./handlers";
import type { ThemeDeps } from "./service";

const BASE = "http://localhost:3000";
let db: Db;
let client: PGlite;

function call(who: string, path: string, init: RequestInit = {}) {
  const deps = async (): Promise<ThemeDeps> => ({ db, user: { id: who, name: who, image: null }, now: new Date() });
  return withServer(() => handleThemesRequest(new Request(BASE + path, init), deps));
}
const json = (body: unknown, headers: Record<string, string> = {}): RequestInit =>
  ({ method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

beforeAll(async () => {
  ({ db, client } = await createTestDb());
  await db.insert(user).values([{ id: "ana", name: "Ana", email: "ana@example.com" }, { id: "ken", name: "Ken", email: "ken@example.com" }]);
});
afterAll(() => client.close());

describe("themes API", () => {
  it("publishes, lists, adds, reports and unpublishes", async () => {
    const published = await call("ana", "/api/themes/publish/", json({ sourceId: "t1", title: "Puddles", brief: "", concepts: [], challenges: ["Find one"] }));
    expect(published.status).toBe(200);
    const { theme } = await published.json();

    const list = await (await call("ken", "/api/themes/?sort=new")).json();
    expect(list).toMatchObject({ more: false, themes: [{ id: theme.id, title: "Puddles", author: { name: "Ana" } }] });
    expect((await (await call("ana", "/api/themes/mine/")).json()).themes).toHaveLength(1);

    expect((await (await call("ken", "/api/themes/add/", json({ id: theme.id }))).json()).theme.addCount).toBe(1);
    expect((await call("ken", "/api/themes/report/", json({ id: theme.id }))).status).toBe(204);
    expect((await call("ken", "/api/themes/unpublish/", json({ id: theme.id }))).status).toBe(403);
    expect((await call("ana", "/api/themes/unpublish/", json({ id: theme.id }))).status).toBe(204);
  });

  it("turns away bad requests", async () => {
    expect((await call("ana", "/api/themes/?offset=-1")).status).toBe(400);
    expect((await call("ana", "/api/themes/add/", json({ id: 7 }))).status).toBe(400);
    expect((await call("ana", "/api/themes/publish/", { method: "POST", body: "not json" })).status).toBe(400);
    const crossSite = await call("ana", "/api/themes/add/", json({ id: "x" }, { "sec-fetch-site": "cross-site" }));
    expect([crossSite.status, await crossSite.json()]).toEqual([403, { error: "forbidden" }]);
    expect((await call("ana", "/api/themes/nope/")).status).toBe(404);
  });
});
