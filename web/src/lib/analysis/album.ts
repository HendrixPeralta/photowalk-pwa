import { nearestColorName, rgbToHex } from "../color";
import type { Exif } from "../exif";
import { t } from "../i18n/core";
import { drawToCanvas, type DrawableImage } from "../image";
import type { Rgb } from "../scopes/compute";
import { apertureBucket, focalBucket, formatCoords, uid } from "../util";
import type { AlbumItem, Overlay } from "@/state/types";
import { MAX_DIM } from "./constants";
import { computeHistogram } from "./histogram";
import { computePalette } from "./palette";

/**
 * Measures a decoded image the way the Analysis screen does, for callers that
 * need album metadata without loading the photo into that screen (the bundled
 * starter photos). Browser-only.
 */
export function measureForAlbum(img: DrawableImage): { avgLum: number; palette: Rgb[] } {
  const sample = drawToCanvas(img, MAX_DIM);
  const data = sample.getContext("2d")!.getImageData(0, 0, sample.width, sample.height);
  return { avgLum: computeHistogram(data).avgLum, palette: computePalette(data) };
}

export interface AlbumRecordInput {
  imageId: string;
  width: number;
  height: number;
  avgLum: number;
  palette?: Rgb[];
  exif?: Exif | null;
  tags?: string[];
  overlay?: Overlay | null;
  themeId?: string | null;
  savedAt?: number;
}

/**
 * The album item shape, in one place. Every dropdown in the Album tab filters
 * on one of these derived labels, so a seeded reference has to be built from
 * the same thresholds a saved one is or the two sort differently.
 */
export function albumRecord({
  imageId, width, height, avgLum, palette = [],
  exif = null, tags = [], overlay = null, themeId = null, savedAt = Date.now(),
}: AlbumRecordInput): AlbumItem {
  const aspect = width / height;
  const top = palette[0];
  return {
    id: uid(),
    imageId,
    width,
    height,
    aspectLabel: aspect > 1.15 ? "Landscape" : aspect < 0.87 ? "Portrait" : "Square",
    brightnessLabel: avgLum > 170 ? "Bright" : avgLum < 85 ? "Dark" : "Balanced",
    colorName: top ? nearestColorName(top.r, top.g, top.b) : "Neutral",
    colors: palette.slice(0, 5).map((c) => rgbToHex(c.r, c.g, c.b)),
    tags,
    overlay,
    themeId,
    exif,
    focalLabel: focalBucket(exif?.focalMm),
    apertureLabel: apertureBucket(exif?.fNumber),
    hasLocation: !!(exif && exif.lat != null && exif.lon != null),
    savedAt,
  };
}

/** The EXIF fields, keyed by their English label (which `skip` matches on). */
export type ExifField = "Camera" | "Aperture" | "Shutter" | "ISO" | "Focal length" | "Date taken" | "Location";

export interface ExifRow {
  field: ExifField;
  /** Translated for display. */
  label: string;
  value: string;
  /** Set on the location row: a map link. */
  href?: string;
}

function fieldLabel(field: ExifField): string {
  switch (field) {
    case "Camera": return t("Camera");
    case "Aperture": return t("Aperture");
    case "Shutter": return t("Shutter");
    case "ISO": return t("ISO");
    case "Focal length": return t("Focal length");
    case "Date taken": return t("Date taken");
    case "Location": return t("Location");
  }
}

/**
 * The readable EXIF fields in display order. `skip` omits fields already
 * shown elsewhere: the analysis pane puts the exposure settings under the
 * frame, but the album sheet has no preview strip and wants the full table.
 */
export function exifRows(exif: Exif | null | undefined, { skip = [] as ExifField[] } = {}): ExifRow[] {
  if (!exif) return [];
  const raw: [ExifField, string | undefined][] = [
    ["Camera", [exif.make, exif.model].filter(Boolean).join(" ")],
    ["Aperture", exif.aperture],
    ["Shutter", exif.shutter],
    ["ISO", exif.iso],
    ["Focal length", exif.focalLength],
    ["Date taken", exif.dateTaken],
  ];
  const rows: ExifRow[] = raw
    .filter((pair): pair is [ExifField, string] => !!pair[1] && !skip.includes(pair[0]))
    .map(([field, value]) => ({ field, label: fieldLabel(field), value }));

  if (exif.lat != null && exif.lon != null && !skip.includes("Location")) {
    rows.push({
      field: "Location",
      label: fieldLabel("Location"),
      value: formatCoords(exif.lat, exif.lon),
      href: `https://www.openstreetmap.org/?mlat=${exif.lat}&mlon=${exif.lon}#map=15/${exif.lat}/${exif.lon}`,
    });
  }
  return rows;
}
