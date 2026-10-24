// The Theme Market: themes people have published for everyone signed in to
// browse, who added each one (counted once per person), and who reported it.
// Adding copies a theme onto the person's phone, so nothing here points back
// from those copies; unpublishing deletes the theme with its adds and reports.

import { sql } from "drizzle-orm";
import { boolean, index, integer, pgTable, primaryKey, text, timestamp, unique } from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

export const sharedThemes = pgTable("shared_themes", {
  id: text("id").primaryKey(),
  authorId: text("author_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  /** The author's own theme id, so publishing it again updates this entry. */
  sourceId: text("source_id").notNull(),
  title: text("title").notNull(),
  brief: text("brief").notNull().default(""),
  concepts: text("concepts").array().notNull().default(sql`'{}'::text[]`),
  challenges: text("challenges").array().notNull().default(sql`'{}'::text[]`),
  addCount: integer("add_count").notNull().default(0),
  /** Set once enough people report it. Cleared by hand after a review. */
  hidden: boolean("hidden").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("shared_themes_author_source_unique").on(table.authorId, table.sourceId),
  index("shared_themes_popular_idx").on(table.hidden, table.addCount),
  index("shared_themes_new_idx").on(table.hidden, table.createdAt),
]);

export const themeAdds = pgTable("theme_adds", {
  themeId: text("theme_id").notNull().references(() => sharedThemes.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.themeId, table.userId] }),
  index("theme_adds_user_idx").on(table.userId),
]);

export const themeReports = pgTable("theme_reports", {
  themeId: text("theme_id").notNull().references(() => sharedThemes.id, { onDelete: "cascade" }),
  reporterId: text("reporter_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.themeId, table.reporterId] }),
  index("theme_reports_reporter_idx").on(table.reporterId),
]);
