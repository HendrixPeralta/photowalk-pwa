// A real Postgres for server tests: PGlite runs in-process, in memory, and
// gets the same migrations as production, so the tests also prove that the
// migrations apply cleanly.

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Db } from "./index";
import * as schema from "./schema";

export async function createTestDb(): Promise<{ db: Db; client: PGlite }> {
  const client = new PGlite();
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return { db: db as unknown as Db, client };
}
