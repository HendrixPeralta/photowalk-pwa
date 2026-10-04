// The Album's filters. Kept for the page's life (not saved), so they survive
// a trip to another tab.

import { create } from "zustand";
import { t } from "@/lib/i18n/core";
import type { AlbumItem } from "@/state/types";

export interface AlbumFilters {
  brightness: string;
  aspect: string;
  color: string;
  focal: string;
  aperture: string;
  /** "all", "yes" or "no". */
  location: string;
  search: string;
}

export const NO_FILTERS: AlbumFilters = {
  brightness: "all", aspect: "all", color: "all", focal: "all", aperture: "all", location: "all", search: "",
};

export const useAlbumFilters = create<AlbumFilters>(() => NO_FILTERS);

/** True when `item` passes every filter. */
export function matchesFilters(item: AlbumItem, f: AlbumFilters): boolean {
  if (f.brightness !== "all" && item.brightnessLabel !== f.brightness) return false;
  if (f.aspect !== "all" && item.aspectLabel !== f.aspect) return false;
  if (f.color !== "all" && item.colorName !== f.color) return false;
  if (f.focal !== "all" && item.focalLabel !== f.focal) return false;
  if (f.aperture !== "all" && item.apertureLabel !== f.aperture) return false;
  if (f.location === "yes" && !item.hasLocation) return false;
  if (f.location === "no" && item.hasLocation) return false;

  const search = f.search.trim().toLowerCase();
  if (search) {
    const labels = [item.colorName, item.aspectLabel, item.brightnessLabel, item.focalLabel, item.apertureLabel]
      .filter((label): label is NonNullable<typeof label> => Boolean(label));
    const haystack = [
      ...item.tags,
      ...(item.notes ?? []).map((n) => n.a),
      item.exif?.make, item.exif?.model, item.exif?.focalLength, item.exif?.aperture,
      // Labels are stored in English (the filters match on them), so search
      // both the stored word and the one the chip shows.
      ...labels.flatMap((label) => [label, t(label)]),
    ].filter(Boolean).join(" ").toLowerCase();
    if (!haystack.includes(search)) return false;
  }
  return true;
}
