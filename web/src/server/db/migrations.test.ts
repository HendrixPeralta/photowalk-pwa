// @vitest-environment node

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createTestDb } from "./testDb";

describe("migrations", () => {
  let client: PGlite;

  beforeAll(async () => {
    ({ client } = await createTestDb());
  });
  afterAll(() => client.close());

  it("create every table the schema declares", async () => {
    const { rows } = await client.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public' order by table_name",
    );
    expect(rows.map((r) => r.table_name)).toEqual(["account", "session", "user", "verification"]);
  });

  it("removes a person's sessions and linked accounts with them", async () => {
    await client.exec(`
      insert into "user" (id, name, email) values ('u1', 'Aki', 'aki@example.com');
      insert into session (id, expires_at, token, updated_at, user_id) values ('s1', now(), 't1', now(), 'u1');
      insert into account (id, account_id, provider_id, user_id, updated_at) values ('a1', 'g1', 'google', 'u1', now());
      delete from "user" where id = 'u1';
    `);
    const { rows } = await client.query<{ n: number }>(
      "select (select count(*) from session)::int + (select count(*) from account)::int as n",
    );
    expect(rows[0].n).toBe(0);
  });
});
