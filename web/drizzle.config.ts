// drizzle-kit settings. `npm run db:generate` writes a migration into
// drizzle/ from the schema; `npm run db:migrate` applies pending migrations
// to the database in DATABASE_URL_UNPOOLED (falling back to DATABASE_URL).
// Migrations are applied by hand, never during a Vercel build: a preview
// build must not change the production database.

import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

// The same .env files Next.js reads, e.g. .env.local from `vercel env pull`.
loadEnvConfig(process.cwd());

export default defineConfig({
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || "",
  },
});
