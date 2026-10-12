// The group review's readings. Measured from the room, never asserted:
// "duration" is the span between the first and last shot shared, "photos" is
// how many were shared, "partners" is who shared them.

import { t } from "@/lib/i18n/core";
import type { CritiqueTag, RoomPhoto, RoomSnapshot } from "@/lib/rooms/protocol";

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

/** Lens, aperture and shutter speed, e.g. "35mm · ƒ/2 · 1/500s", or "" when the file had none. */
export function settingsOf(photo: RoomPhoto): string {
  const e = photo.exif;
  return [e?.focalLength, e?.aperture?.replace("f/", "ƒ/"), e?.shutter].filter(Boolean).join(" · ");
}

