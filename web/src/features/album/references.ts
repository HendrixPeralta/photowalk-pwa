// Album references: removing one, and the sample set of bundled photos.
//
// A new account starts with an empty Album. The sample photos are added on
// request, from the Demo data switch in Settings (or ?photos=seed), to try
// the filters and analysis with. Once added they are ordinary references:
// they can be analyzed, tagged and deleted, and a deleted one stays deleted.

import { albumRecord, measureForAlbum } from "@/lib/analysis/album";
import { deleteImage, putImage, revokeImageUrl } from "@/lib/db";
import { readExif } from "@/lib/exif";
import { t } from "@/lib/i18n/core";
import { loadImage } from "@/lib/image";
import { uid } from "@/lib/util";
import { getData, update } from "@/state/appStore";
import type { AlbumItem } from "@/state/types";
import { showToast } from "@/state/ui";

/** Newest first. Picked so every filter has something in it on first open. */
export const STARTER_PHOTOS = ["a_1.jpg", "dr-3474.jpg", "a_49.jpg", "a.jpg", "a_31.jpg", "a_25.jpg"];

async function forget(items: readonly AlbumItem[]): Promise<void> {
  for (const item of items) {
    if (!item.imageId) continue;
    revokeImageUrl(item.imageId);
    await deleteImage(item.imageId).catch(() => {});
  }
}

/** Deletes a reference and its stored photo. */
export async function deleteReference(id: string): Promise<void> {
  const item = getData().album.find((i) => i.id === id);
  if (!item) return;
  update((d) => { d.album = d.album.filter((i) => i.id !== id); });
  showToast(t("Removed from Reference Album."));
  await forget([item]);
}

/**
 * Fetches one bundled photo, measures it and stores it. Null if that one
 * photo couldn't be read: a missing file costs its own thumbnail, nothing more.
 */
async function starterRecord(name: string): Promise<AlbumItem | null> {
  const url = `/photos/${name}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const [image, exif] = await Promise.all([loadImage(url), readExif(blob)]);
    // The bundled files are already album-sized, so they're stored as they are.
    const imageId = uid();
    await putImage(imageId, blob);
    const { avgLum, palette } = measureForAlbum(image);
    return {
      ...albumRecord({ imageId, width: image.naturalWidth, height: image.naturalHeight, avgLum, palette, exif }),
      // Marks it as ours, so the set can be taken back out without touching
      // the user's own references.
      seeded: true,
      seedName: name,
    };
  } catch (err) {
    console.warn(`PhotoEYE: could not add ${name} to the starter album.`, err);
    return null;
  }
}

/**
 * Adds the starter set to the front of the album. One photo at a time: six
 * 1600px decodes at once spike memory on a phone while the app is starting.
 */
export async function seedStarterAlbum(now = Date.now()): Promise<number> {
  const records: AlbumItem[] = [];
  for (const name of STARTER_PHOTOS) {
    const record = await starterRecord(name);
    if (record) records.push(record);
  }
  if (!records.length) return 0;
  update((d) => {
    d.album.unshift(...records);
    d.seededAlbum = { count: records.length, seededAt: now };
  });
  return records.length;
}

let seeding: Promise<number> | null = null;

/** Seeds a profile that has never had the starter set. Safe to call more than once. */
export function maybeSeedStarterAlbum(): Promise<number> {
  if (getData().seededAlbum) return Promise.resolve(0);
  seeding ??= seedStarterAlbum().finally(() => { seeding = null; });
  return seeding;
}

/** Takes the sample photos back out, photos included, so they can be added fresh. */
export async function clearStarterAlbum(): Promise<number> {
  const seeded = getData().album.filter((item) => item.seeded);
  update((d) => {
    d.album = d.album.filter((item) => !item.seeded);
    d.seededAlbum = null;
  });
  await forget(seeded);
  return seeded.length;
}

/** At start-up: the ?photos switch, if there was one. */
export async function starterAlbumOnStart(param: string | null): Promise<void> {
  try {
    if (param === "clear") await clearStarterAlbum();
    else if (param === "seed") await seedStarterAlbum();
  } catch (err) {
    console.warn("PhotoEYE: could not set up the starter album.", err);
  }
}
