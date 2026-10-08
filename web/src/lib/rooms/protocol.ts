// What the app and the server agree on about Walk Partners rooms: room codes,
// the critique tags, the limits, the shape of a room as the server sends it,
// and the error codes. Shared by both sides, so it imports nothing from
// either: no server modules, no browser APIs at import time.

import type { Exif } from "@/lib/exif";

/* ---------- Room codes ---------- */

/** Thirty-two characters, without the look-alikes (0/O, 1/I) people misread off a screen. */
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LENGTH = 6;
const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;

/**
 * A new code from the platform's secure random source. 256 is a multiple of
 * 32, so taking the low five bits of each random byte favours no character.
 */
export function newRoomCode(random: (bytes: Uint8Array) => Uint8Array = (b) => crypto.getRandomValues(b)): string {
  const bytes = random(new Uint8Array(ROOM_CODE_LENGTH));
  let code = "";
  for (const byte of bytes) code += ROOM_CODE_ALPHABET[byte & 31];
  return code;
}

/**
 * A room code from whatever someone typed or pasted: any case, spaces or
 * dashes, or a whole invite link. Null when it can't be a room code.
 */
export function normalizeRoomCode(raw: string): string | null {
  let text = raw.trim();
  try {
    const fromLink = new URL(text).searchParams.get("room");
    if (fromLink) text = fromLink;
  } catch {
    // Not a link: the code itself.
  }
  const code = text.replace(/[\s-]+/g, "").toUpperCase();
  return ROOM_CODE_PATTERN.test(code) ? code : null;
}

/* ---------- Critique tags ---------- */

/**
 * The vocabulary of a technical critique: process, not praise. Notes store
 * these keys, and each person reads them in their own language.
 */
export const CRITIQUE_TAGS = [
  "#RuleOfThirds", "#LeadingLines", "#LowAngle", "#RimLight",
  "#AvailableLight", "#Backlit", "#NegativeSpace", "#Geometry",
] as const;
export type CritiqueTag = (typeof CRITIQUE_TAGS)[number];

export const isCritiqueTag = (tag: unknown): tag is CritiqueTag =>
  typeof tag === "string" && (CRITIQUE_TAGS as readonly string[]).includes(tag);

/* ---------- Limits ---------- */

export const LIMITS = {
  noteText: 400,
  commentText: 200,
  photoNote: 200,
  roomName: 40,
  theme: 80,
  themeId: 64,
  tagsPerNote: CRITIQUE_TAGS.length,
  membersPerRoom: 20,
  photosPerRoom: 200,
  photosPerUserPerDay: 60,
  commentsPerPhoto: 100,
  notesPerRoom: 300,
  hostedRooms: 5,
  /** A 900px JPEG is far below this; it bounds what a client can make the server store. */
  photoBytes: 1_500_000,
  photoSide: 1000,
} as const;

/** A room closes this long after its last photo, note or comment. */
export const ROOM_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

/* ---------- A room, as the server sends it ---------- */

export interface RoomPerson {
  id: string;
  name: string;
  image: string | null;
}

export interface RoomComment {
  id: string;
  userId: string;
  text: string;
  ts: number;
}

export interface RoomPhoto {
  id: string;
  userId: string;
  note: string;
  ts: number;
  width: number;
  height: number;
  exif: Exif | null;
  themeId: string | null;
  comments: RoomComment[];
}

export interface RoomNote {
  id: string;
  userId: string;
  text: string;
  tags: CritiqueTag[];
  ts: number;
}

export interface RoomSnapshot {
  code: string;
  /** What the host called the room. Empty when unnamed: the code stands in. */
  name: string;
  theme: string;
  hostId: string;
  /** Goes up with every change, so asking "anything new since N?" is cheap. */
  version: number;
  createdAt: number;
  lastActivityAt: number;
  expiresAt: number;
  /** Who is in the room now, host first. */
  members: string[];
  /** Everyone who is in the room or has posted in it. People who left keep their posts. */
  people: Record<string, RoomPerson>;
  /** Oldest first. */
  photos: RoomPhoto[];
  /** Oldest first. */
  notes: RoomNote[];
}

/** One line per room in "Your rooms". */
export interface RoomSummary {
  code: string;
  name: string;
  theme: string;
  isHost: boolean;
  photoCount: number;
  memberCount: number;
  lastActivityAt: number;
  expiresAt: number;
}

/** The fields a photo upload carries besides the picture. */
export interface PhotoMeta {
  note: string;
  width: number;
  height: number;
  exif: Exif | null;
  themeId: string | null;
}

/* ---------- Errors ---------- */

export const ROOM_ERRORS = [
  "signed_out", "not_configured", "invalid", "invalid_code", "room_not_found", "not_member",
  "removed", "host_only", "host_cannot_leave", "room_full", "too_many_rooms", "too_many_photos",
  "too_many_posts", "photo_too_large", "upload_budget", "busy", "not_found", "forbidden",
] as const;
export type RoomError = (typeof ROOM_ERRORS)[number];

export const isRoomError = (code: unknown): code is RoomError =>
  typeof code === "string" && (ROOM_ERRORS as readonly string[]).includes(code);
