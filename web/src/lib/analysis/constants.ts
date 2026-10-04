import type { OverlayType } from "@/state/types";

// Histogram and palette always read a fixed 640px sample, so their numbers are
// cheap and stable no matter how large the display canvas gets.
export const MAX_DIM = 640;
// The visible canvas is bigger so zooming in shows real detail...
export const DISPLAY_MAX_DIM = 1280;
// ...and a reference you'll study later deserves more still; IndexedDB has room.
export const ALBUM_MAX_DIM = 1600;

export const ZOOM_MAX = 3;

export const OVERLAY_TYPES: readonly OverlayType[] = ["none", "thirds", "golden", "golden-triangles", "spiral-section", "golden-spiral"];
// Golden Triangles mirrored = Harmonious Triangles, so one guide plus Flip covers both.
export const FLIPPABLE_OVERLAYS: readonly OverlayType[] = ["golden-triangles"];
// The spirals can start in any corner; Rotate steps through the four.
export const ROTATABLE_OVERLAYS: readonly OverlayType[] = ["spiral-section", "golden-spiral"];

/** The bundled frame the Analysis tab opens with, so every tool is live on a first visit. */
export const DEFAULT_PHOTO_URL = "/photos/a_33.jpg";
