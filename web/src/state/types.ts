// The shape of everything PhotoEYE saves. It mirrors the old app's `state`
// object field for field, so the logic ports 1:1.

import type { ColorName } from "@/lib/color";
import type { Exif } from "@/lib/exif";
import type { ApertureBucket, FocalBucket } from "@/lib/util";

export type GoalPeriod = "week" | "month" | "year";
export type WalkMode = "casual" | "guided";

export type OverlayType = "none" | "thirds" | "golden" | "golden-triangles" | "spiral-section" | "golden-spiral";

export interface Overlay {
  type: OverlayType;
  /** Mirrors the triangle guide (Golden into Harmonious Triangles). */
  flip: boolean;
  /** Quarter-turns applied to the spiral guides, 0 to 3. */
  rotation: number;
}

/** An hour target for one specific theme. */
export interface ThemeGoal {
  id: string;
  themeId: string;
  hours: number;
  period: GoalPeriod;
}

export interface Profile {
  streak: number;
  longestStreak: number;
  /** Date.toDateString() of the last finished walk. */
  lastWalkDate: string | null;
  walksCompleted: number;
  photosAnalyzed: number;
  /** Hour target per period, all shown at once. */
  goals: Record<GoalPeriod, number>;
  /** Which goal the editable Home goal bar is currently showing. */
  goalPeriod: GoalPeriod;
  themeGoals: ThemeGoal[];
  guidedDurationMin: number;
  milestonesSeen: string[];
  displayName: string;
}

export type AspectLabel = "Landscape" | "Portrait" | "Square";
export type BrightnessLabel = "Bright" | "Dark" | "Balanced";

/** A saved reference photo. Labels are stored in English (filters match on them). */
export interface AlbumItem {
  id: string;
  imageId: string;
  width: number;
  height: number;
  aspectLabel: AspectLabel;
  brightnessLabel: BrightnessLabel;
  colorName: ColorName;
  /** Up to five hex colors, dominant first. */
  colors: string[];
  tags: string[];
  overlay: Overlay | null;
  themeId: string | null;
  exif: Exif | null;
  focalLabel: FocalBucket | null;
  apertureLabel: ApertureBucket | null;
  hasLocation: boolean;
  savedAt: number;
  /** Set on the bundled starter photos, so they can be removed as a set. */
  seeded?: boolean;
  seedName?: string;
  /** Study-checklist answers. */
  notes?: { q: string; a: string }[] | null;
}

export interface RoomComment {
  name: string;
  text: string;
  ts: number;
}

export interface RoomPhoto {
  id: string;
  imageId: string;
  name: string;
  note: string;
  ts: number;
  comments: RoomComment[];
  exif: Exif | null;
  themeId: string | null;
}

export interface CritiqueNote {
  name: string;
  text: string;
  /** The critique chips the note was filed under, space separated. */
  spec: string;
  ts: number;
}

export interface Room {
  code: string;
  theme: string;
  createdAt: number;
  photos: RoomPhoto[];
  critique?: CritiqueNote[];
}

/** A GPS reading. */
export interface Fix {
  lat: number;
  lon: number;
  accuracy: number;
  at: number;
}

export type NudgeId = "half" | "wrap" | "end";

export interface Nudge {
  id: NudgeId;
  /** Epoch ms when it is due. */
  at: number;
  fired: boolean;
}

/** One photo logged during a walk from the Live Walk screen. */
export interface Frame {
  id: string;
  imageId: string;
  index: number;
  at: number;
  label: string;
  /** Display line such as "f/2.8 · 1/250s · ISO 400". */
  exposure: string;
  exif: Exif | null;
  fix: Fix | null;
}

export interface ActiveWalk {
  mode: WalkMode;
  themeId: string;
  /** Null while the walk is still on its brief, before shooting starts. */
  startedAt: number | null;
  /** Guided walks only. */
  durationMin: number | null;
  challengesChecked: boolean[];
  nudges: Nudge[];
  pausedAt: number | null;
  frames?: Frame[];
}

export interface WalkRecord {
  id: string;
  themeId: string;
  mode: WalkMode;
  durationMin: number | null;
  hours: number;
  challengesDone: number;
  challengeCount: number;
  endedAt: number;
  tipDismissed?: boolean;
}

/** A treat priced in shooting hours, counted from when it was created. */
export interface Reward {
  id: string;
  title: string;
  targetHours: number;
  /** Lifetime hours when the reward was set; only hours after this count. */
  baselineHours: number;
  createdAt: number;
  claimedAt: number | null;
  notified: boolean;
}

export interface CustomTheme {
  id: string;
  title: string;
  brief: string;
  concepts: string[];
  challenges: string[];
}

export interface Reminder {
  enabled: boolean;
  /** "HH:MM", local time. */
  time: string;
  /** 0 = Sunday. */
  days: number[];
}

export interface AppData {
  profile: Profile;
  album: AlbumItem[];
  rooms: Record<string, Room>;
  currentRoom: string | null;
  activeWalk: ActiveWalk | null;
  /** The most recent finished walk; the Analysis tab pins its theme tips for a day. */
  lastWalk: WalkRecord | null;
  /** Newest first, capped at WALK_HISTORY_LIMIT. */
  walkHistory: WalkRecord[];
  /** Hours shooting, keyed by local date "YYYY-MM-DD". */
  activityLog: Record<string, number>;
  /** Frames logged on the Live Walk screen, keyed by local date. */
  frameLog: Record<string, number>;
  rewards: Reward[];
  customThemes: CustomTheme[];
  /** Set only by the demo fixture. Its presence keeps demo mode on across reloads. */
  demoMode: { seed: number; seededAt: number } | null;
  /** Set once when a new profile is given its starting history. */
  seededHistory: { seed: number; days: number; seededAt: number } | null;
  /** Set once when a new profile is handed the bundled starter album. */
  seededAlbum: { count: number; seededAt: number } | null;
  reminder: Reminder;
}
