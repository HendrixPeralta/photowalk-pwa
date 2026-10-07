// The group review's readings. Measured from the room, never asserted:
// "duration" is the span between the first and last shot shared, "photos" is
// how many were shared, "partners" is who shared them.

import { t } from "@/lib/i18n/core";
import type { CritiqueTag, RoomPhoto, RoomSnapshot } from "@/lib/rooms/protocol";
import { exportStudySheet } from "@/lib/sheet";
import { formatTime } from "@/lib/util";
import { showToast } from "@/state/ui";
import { ensureRoomImage } from "./roomImages";

/** A critique tag in this person's language. Notes store the canonical key. */
export function critiqueTagLabel(tag: CritiqueTag): string {
  const labels: Record<CritiqueTag, string> = {
    "#RuleOfThirds": t("#RuleOfThirds"),
    "#LeadingLines": t("#LeadingLines"),
    "#LowAngle": t("#LowAngle"),
    "#RimLight": t("#RimLight"),
    "#AvailableLight": t("#AvailableLight"),
    "#Backlit": t("#Backlit"),
    "#NegativeSpace": t("#NegativeSpace"),
    "#Geometry": t("#Geometry"),
  };
  return labels[tag] ?? tag;
}

/** Someone's name in the room, or a stand-in if the server didn't say. */
export function personName(room: Pick<RoomSnapshot, "people">, userId: string): string {
  return room.people[userId]?.name || t("Someone");
}

/**
 * The two shots to compare: the newest from each of the two most recent
 * people to post, or the two newest overall when only one person has.
 */
export function pickPair(photos: readonly RoomPhoto[]): RoomPhoto[] {
  const byPerson = new Map<string, RoomPhoto>();
  for (let i = photos.length - 1; i >= 0; i--) {
    const p = photos[i];
    if (!byPerson.has(p.userId)) byPerson.set(p.userId, p);
    if (byPerson.size === 2) break;
  }
  if (byPerson.size === 2) return [...byPerson.values()].reverse();
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

/** "@Ana Sato & @Ken Ito", or "--" before anyone has posted. Full names: Japanese ones put the family name first. */
export function partnersLabel(room: Pick<RoomSnapshot, "people" | "photos">): string {
  const ids = [...new Set(room.photos.map((p) => p.userId))];
  return ids.length ? ids.map((id) => "@" + personName(room, id)).join(" & ") : "--";
}

/** Downloads the two shots side by side with their settings, and the feedback notes. */
export async function exportRoomSheet(room: RoomSnapshot): Promise<void> {
  const pair = pickPair(room.photos);
  if (pair.length < 2) { showToast(t("Share at least two shots before exporting a study sheet.")); return; }
  const panes = await Promise.all(pair.map(async (p) => ({
    who: "@" + personName(room, p.userId),
    exposure: exposureOf(p),
    detail: detailOf(p) || formatTime(p.ts),
    src: (await ensureRoomImage(p.id)) ?? "",
  })));
  await exportStudySheet({
    title: room.theme || t("Room {code}", { code: room.code }),
    subtitle: t("{n} shots shared · {partners}", { n: room.photos.length, partners: partnersLabel(room) }),
    panes,
    notes: room.notes.map((n) => {
      const tags = n.tags.map(critiqueTagLabel).join(" ");
      return { author: personName(room, n.userId), when: formatTime(n.ts), text: tags ? `${tags} · ${n.text}` : n.text };
    }),
  });
}
