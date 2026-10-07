// The database connection: Neon Postgres over a normal TCP pool (node-postgres),
// which is what Neon recommends on Vercel's Fluid compute. The pool is made on
// first use and then shared by every request the same function instance
// serves; attachDatabasePool lets Vercel close idle connections before it
// suspends the instance.

import { attachDatabasePool } from "@vercel/functions";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { requireEnv } from "../env";
import * as schema from "./schema";

/**
 * Any Drizzle Postgres database with our schema: the real one here, an
 * in-memory PGlite one in tests.
 */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

let db: Db | null = null;

export function getDb(): Db {
  if (db) return db;
  const { DATABASE_URL } = requireEnv("DATABASE_URL");
  const pool = new Pool({ connectionString: DATABASE_URL });
  attachDatabasePool(pool);
  db = drizzle({ client: pool, schema });
  return db;
}
