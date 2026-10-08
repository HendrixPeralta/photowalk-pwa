// Room photos on this device. Pictures come from the server once and are kept
// in IndexedDB under "room:{photoId}", next to the album's, so a room opens
// offline and Analysis and the study sheet read them like any other photo.

import { useEffect, useState } from "react";
import { allImageIds, deleteImage, getImage, imageUrl, putImage } from "@/lib/db";
import { roomsApi } from "@/lib/roomsApi";

const PREFIX = "room:";
export const roomImageId = (photoId: string) => PREFIX + photoId;

const pending = new Map<string, Promise<string | null>>();
const queue: (() => void)[] = [];
let running = 0;
const MAX_DOWNLOADS = 4;

/** At most four downloads at a time, so a full room doesn't flood the connection. */
function limited<T>(work: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const start = () => {
      running++;
      work().then(resolve, reject).finally(() => {
        running--;
        queue.shift()?.();
      });
    };
    if (running < MAX_DOWNLOADS) start();
    else queue.push(start);
  });
}

/** The photo's picture as an object URL, downloading it first if needed. Null when it can't be had. */
export function ensureRoomImage(photoId: string): Promise<string | null> {
  const id = roomImageId(photoId);
  let found = pending.get(id);
  if (!found) {
    found = (async () => {
      if (await getImage(id).catch(() => undefined)) return imageUrl(id);
      const res = await limited(() => roomsApi.photo(photoId));
      if (!res.ok) return null;
      await putImage(id, res.data);
      return imageUrl(id);
    })().finally(() => pending.delete(id));
    pending.set(id, found);
  }
  return found;
}

/** Keeps the picture this device just posted, so it never downloads its own photo. */
export function keepPostedImage(photoId: string, jpeg: Blob): Promise<unknown> {
  return putImage(roomImageId(photoId), jpeg);
}

/** Undefined while loading, null when the picture isn't available (e.g. offline and never seen). */
export function useRoomPhotoUrl(photoId: string | undefined): string | null | undefined {
  const [url, setUrl] = useState<{ id: string; url: string | null } | null>(null);
  useEffect(() => {
    if (!photoId) return;
    let live = true;
    void ensureRoomImage(photoId).then((u) => { if (live) setUrl({ id: photoId, url: u }); });
    return () => { live = false; };
  }, [photoId]);
  if (!photoId) return null;
  return url?.id === photoId ? url.url : undefined;
}

/** Deletes room pictures that aren't in `keep` (photos taken down, rooms left or closed). */
export async function pruneRoomImages(keep: ReadonlySet<string> = new Set()): Promise<void> {
  const ids = await allImageIds().catch(() => [] as string[]);
  await Promise.all(ids.filter((id) => id.startsWith(PREFIX) && !keep.has(id.slice(PREFIX.length))).map((id) => deleteImage(id)));
}
