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
    expect(rows.map((r) => r.table_name)).toEqual([
      "account", "blob_trash", "blob_usage", "room_comments", "room_members", "room_notes",
      "room_photos", "rooms", "session", "user", "verification",
    ]);
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

  it("removes everything in a room with the room", async () => {
    await client.exec(`
      insert into "user" (id, name, email) values ('host', 'Ana', 'ana@example.com'), ('ken', 'Ken', 'ken@example.com');
      insert into rooms (id, code, host_id) values ('r1', 'ABC234', 'host');
      insert into room_members (room_id, user_id) values ('r1', 'host'), ('r1', 'ken');
      insert into room_photos (id, room_id, user_id, blob_pathname, width, height, bytes) values ('p1', 'r1', 'ken', 'rooms/r1/p1.jpg', 900, 600, 1000);
      insert into room_comments (id, photo_id, user_id, text) values ('c1', 'p1', 'host', 'Nice light');
      insert into room_notes (id, room_id, user_id, text, tags) values ('n1', 'r1', 'ken', 'Low angle', '{"#LowAngle"}');
      delete from rooms where id = 'r1';
    `);
    const { rows } = await client.query<{ n: number }>(`
      select (select count(*) from room_members)::int + (select count(*) from room_photos)::int
        + (select count(*) from room_comments)::int + (select count(*) from room_notes)::int as n
    `);
    expect(rows[0].n).toBe(0);
  });
});
