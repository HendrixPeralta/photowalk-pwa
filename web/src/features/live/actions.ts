// Live Walk: logging photos to the open walk, labelling or removing them.

import { deleteImage, putImage, revokeImageUrl } from "@/lib/db";
import { exposureLine, readExif } from "@/lib/exif";
import { fixIsFresh } from "@/lib/geo";
import { t } from "@/lib/i18n/core";
import { canvasToBlob, drawToCanvas } from "@/lib/image";
import { addFrame } from "@/lib/stats";
import { localDateKey, uid } from "@/lib/util";
import { getData, update } from "@/state/appStore";
import { useFix } from "@/state/geo";
import type { Frame } from "@/state/types";
import { showToast } from "@/state/ui";

// Walk photos are a log, not the library: this is plenty, and it keeps a long
// walk from eating the storage quota.
const FRAME_MAX_DIM = 640;

/** Shrinks a photo and stores it. Returns the stored image's id. */
async function storeFramePhoto(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const canvas = drawToCanvas(bitmap, FRAME_MAX_DIM);
  bitmap.close();
  const blob = await canvasToBlob(canvas, "image/jpeg", 0.8);
  const imageId = uid();
  await putImage(imageId, blob);
  return imageId;
}

/**
 * Logs photos to the open walk, with whatever EXIF each file carried and the
 * last known position. One at a time: each photo's number depends on how
 * many are already logged, so two decodes racing would hand out duplicates.
 */
export async function logFrames(files: readonly File[]): Promise<void> {
  if (!files.length || !getData().activeWalk) return;
  let logged = 0;
  let last: Frame | null = null;

  for (const file of files) {
    try {
      const exif = await readExif(file);
      const imageId = await storeFramePhoto(file);
      const walk = getData().activeWalk;
      if (!walk) {
        // The walk ended while the photo was being stored.
        await deleteImage(imageId);
        break;
      }
      const at = Date.now();
      const fix = useFix.getState().fix;
      const frame: Frame = {
        id: uid(),
        imageId,
        index: (walk.frames?.length ?? 0) + 1,
        at,
        label: "",
        exposure: exposureLine(exif),
        exif,
        fix: fix && fixIsFresh(fix, at) ? fix : null,
      };
      update((d) => {
        (d.activeWalk!.frames ??= []).push(frame);
        addFrame(d, localDateKey(new Date(at)));
      });
      last = frame;
      logged += 1;
    } catch (err) {
      console.warn("PhotoEYE: could not log that photo.", err);
    }
  }

  if (logged && logged === files.length) {
    if (logged > 1) showToast(t("{n} photos logged.", { n: logged }));
    else if (last!.exposure) showToast(t("Photo #{n} logged · {exposure}.", { n: last!.index, exposure: last!.exposure }));
    else showToast(t("Photo #{n} logged.", { n: last!.index }));
  } else if (logged) {
    showToast(t("{n} of {total} photos logged. The rest couldn't be read.", { n: logged, total: files.length }));
  } else if (getData().activeWalk) {
    showToast(t("Couldn't read those photos. Please try again."));
  }
}

export function setFrameLabel(frameId: string, label: string): void {
  update((d) => {
    const frame = d.activeWalk?.frames?.find((f) => f.id === frameId);
    if (frame) frame.label = label.trim();
  });
}

/** Takes a photo off the walk (and out of storage), renumbering the rest. */
export function removeFrame(frameId: string): void {
  const frame = getData().activeWalk?.frames?.find((f) => f.id === frameId);
  if (!frame) return;
  update((d) => {
    const w = d.activeWalk;
    if (!w?.frames) return;
    w.frames = w.frames.filter((f) => f.id !== frameId);
    w.frames.forEach((f, i) => { f.index = i + 1; });
  });
  revokeImageUrl(frame.imageId);
  void deleteImage(frame.imageId);
}
