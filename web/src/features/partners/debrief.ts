// The group review's readings. Measured from the room, never asserted:
// "duration" is the span between the first and last shot shared, "photos" is
// how many were shared, "partners" is who shared them.

import { imageUrl } from "@/lib/db";
import { t } from "@/lib/i18n/core";
import { exportStudySheet } from "@/lib/sheet";
import { formatTime } from "@/lib/util";
import type { Room, RoomPhoto } from "@/state/types";
import { showToast } from "@/state/ui";

/** The vocabulary of a technical critique: process, not praise. Stored as shown. */
export const critiqueTags = (): string[] => [
  t("#RuleOfThirds"), t("#LeadingLines"), t("#LowAngle"), t("#RimLight"),
  t("#AvailableLight"), t("#Backlit"), t("#NegativeSpace"), t("#Geometry"),
];

/**
 * The two shots to compare: the newest from each of the two most recent
 * people to post, or the two newest overall when only one person has.
 */
export function pickPair(photos: readonly RoomPhoto[]): RoomPhoto[] {
  const byName = new Map<string, RoomPhoto>();
  for (let i = photos.length - 1; i >= 0; i--) {
    const p = photos[i];
    if (!byName.has(p.name)) byName.set(p.name, p);
    if (byName.size === 2) break;
  }
  if (byName.size === 2) return [...byName.values()].reverse();
  return photos.slice(-2);
}

/** Lens and aperture, e.g. "35mm · ƒ/2". */
export function exposureOf(photo: RoomPhoto): string {
  const e = photo.exif;
  const line = [e?.focalLength, e?.aperture?.replace("f/", "ƒ/")].filter(Boolean).join(" · ");
  return line || t("no camera data");
}

/** ISO and shutter, or "" when the file had neither. */
export function detailOf(photo: RoomPhoto): string {
  const e = photo.exif;
  return [e?.iso, e?.shutter].filter(Boolean).join(" · ");
}

export const shutterOf = (photo: RoomPhoto): string => photo.exif?.shutter || "--";

export function formatSpan(ms: number): string {
  const mins = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(mins / 60);
  return h ? t("{h}h {m}m", { h, m: mins % 60 }) : t("{m}m", { m: mins });
}

/** "@Ana & @Ken", or "--" before anyone has posted. */
export function partnersLabel(photos: readonly RoomPhoto[]): string {
  const names = [...new Set(photos.map((p) => p.name).filter(Boolean))];
  return names.length ? names.map((n) => "@" + n).join(" & ") : "--";
}

/** Downloads the two shots side by side with their settings, and the feedback notes. */
export async function exportRoomSheet(room: Room): Promise<void> {
  const pair = pickPair(room.photos);
  if (pair.length < 2) { showToast(t("Share at least two shots before exporting a study sheet.")); return; }
  const panes = await Promise.all(pair.map(async (p) => ({
    who: "@" + p.name,
    exposure: exposureOf(p),
    detail: detailOf(p) || formatTime(p.ts),
    src: (await imageUrl(p.imageId)) ?? "",
  })));
  await exportStudySheet({
    title: room.theme || t("Room {code}", { code: room.code }),
    subtitle: t("{n} shots shared · {partners}", { n: room.photos.length, partners: partnersLabel(room.photos) }),
    panes,
    notes: (room.critique ?? []).map((n) => ({
      author: n.name,
      when: formatTime(n.ts),
      text: n.spec ? `${n.spec} · ${n.text}` : n.text,
    })),
  });
}
