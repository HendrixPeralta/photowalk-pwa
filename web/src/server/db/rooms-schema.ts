// Walk Partners rooms: who is in each room, the photos posted to it (the
// pictures themselves are in private Vercel Blob, under blob_pathname), and
// the comments and critique notes on them. A room is deleted 30 days after
// its last activity, or when its host closes it; everything in it goes with
// it (on delete cascade), and its pictures are queued in blob_trash.

import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import type { Exif } from "@/lib/exif";
import type { CritiqueTag } from "@/lib/rooms/protocol";
import { user } from "./auth-schema";

export const rooms = pgTable("rooms", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  hostId: text("host_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  /** What the host called the room. Empty when unnamed. */
  name: text("name").notNull().default(""),
  theme: text("theme").notNull().default(""),
  /** Goes up with every change, so a poll can ask "anything since N?" in one cheap query. */
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  /** The last photo, note or comment. The room closes 30 days after it. */
  lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("rooms_host_idx").on(table.hostId),
  index("rooms_last_activity_idx").on(table.lastActivityAt),
]);

export const roomMembers = pgTable("room_members", {
  roomId: text("room_id").notNull().references(() => rooms.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  /** Set when the host removes someone. They keep their posts and can't rejoin. */
  removedAt: timestamp("removed_at", { withTimezone: true }),
}, (table) => [
  primaryKey({ columns: [table.roomId, table.userId] }),
  index("room_members_user_idx").on(table.userId),
]);

export const roomPhotos = pgTable("room_photos", {
  id: text("id").primaryKey(),
  roomId: text("room_id").notNull().references(() => rooms.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  blobPathname: text("blob_pathname").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  bytes: integer("bytes").notNull(),
  note: text("note").notNull().default(""),
  exif: jsonb("exif").$type<Exif>(),
  themeId: text("theme_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("room_photos_room_idx").on(table.roomId, table.createdAt),
  index("room_photos_user_idx").on(table.userId, table.createdAt),
]);

export const roomComments = pgTable("room_comments", {
  id: text("id").primaryKey(),
  photoId: text("photo_id").notNull().references(() => roomPhotos.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("room_comments_photo_idx").on(table.photoId)]);

export const roomNotes = pgTable("room_notes", {
  id: text("id").primaryKey(),
  roomId: text("room_id").notNull().references(() => rooms.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  /** Canonical critique tags (#LowAngle), each person reads them in their own language. */
  tags: text("tags").array().$type<CritiqueTag[]>().notNull().default(sql`'{}'::text[]`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("room_notes_room_idx").on(table.roomId)]);

/**
 * Pictures waiting to be deleted from Blob. Deleting a room or a photo writes
 * its pathnames here in the same transaction, so a failed Blob call is retried
 * later (by the daily cleanup) instead of leaving a picture behind forever.
 */
export const blobTrash = pgTable("blob_trash", {
  pathname: text("pathname").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Uploads per calendar month ("2026-10"). Vercel's Hobby plan locks the Blob
 * store for 30 days if the month's upload allowance runs out, so uploads stop
 * a little short of it instead.
 */
export const blobUsage = pgTable("blob_usage", {
  month: text("month").primaryKey(),
  puts: integer("puts").notNull().default(0),
});
