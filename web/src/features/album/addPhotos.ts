import { albumRecord, measureForAlbum } from "@/lib/analysis/album";
import { ALBUM_MAX_DIM } from "@/lib/analysis/constants";
import { putImage } from "@/lib/db";
import { isHeif, readExif } from "@/lib/exif";
import { t } from "@/lib/i18n/core";
import { canvasToBlob, drawToCanvas, loadImage, readFileAsDataUrl } from "@/lib/image";
import { uid } from "@/lib/util";
import { update, warnIfStorageTight } from "@/state/appStore";
import type { AlbumItem } from "@/state/types";
import { showToast } from "@/state/ui";

/** Measures one picked photo and stores it at album size. Null if it can't be opened. */
async function photoRecord(file: File): Promise<AlbumItem | null> {
  const exifPromise = readExif(file);
  let image: HTMLImageElement;
  try {
    image = await loadImage(await readFileAsDataUrl(file));
  } catch {
    return null;
  }
  const full = drawToCanvas(image, ALBUM_MAX_DIM);
  const imageId = uid();
  await putImage(imageId, await canvasToBlob(full, "image/jpeg", 0.85));
  const { avgLum, palette } = measureForAlbum(image);
  return albumRecord({ imageId, width: full.width, height: full.height, avgLum, palette, exif: await exifPromise });
}

/**
 * Saves the picked photos straight into the Reference Album, newest pick
 * first, with no stop in Analysis. One at a time, so a big pick doesn't hold
 * many full-size decodes in memory on a phone. A photo that can't be opened
 * is skipped and the rest still go in.
 */
export async function addPhotosToAlbum(files: File[]): Promise<void> {
  const records: AlbumItem[] = [];
  let heif = false;
  let failed = 0;
  try {
    for (const file of files) {
      const record = await photoRecord(file);
      if (record) records.push(record);
      else {
        failed += 1;
        heif ||= await isHeif(file);
      }
    }
  } catch (err) {
    console.warn("PhotoEYE: could not add photos to the album.", err);
    if (!records.length) {
      showToast(t("Couldn't save this reference. Your device may be out of storage."));
      return;
    }
  }

  if (records.length) {
    update((d) => { d.album.unshift(...records.reverse()); });
    showToast(failed
      ? t("Added {n} photos to your Reference Album. {skipped} couldn't be opened.", { n: records.length, skipped: failed })
      : records.length === 1
        ? t("Saved to your Reference Album.")
        : t("Added {n} photos to your Reference Album.", { n: records.length }));
    void warnIfStorageTight();
  } else if (failed) {
    showToast(heif
      ? t("This browser can't open HEIC photos. Save the photo as a JPEG and try again.")
      : t("That file could not be opened as an image."));
  }
}
