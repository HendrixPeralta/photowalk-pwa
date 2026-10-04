"use client";

import { useEffect, useState } from "react";
import { imageUrl } from "@/lib/db";

/**
 * An object URL for a photo stored in IndexedDB: undefined while it loads,
 * null if it isn't in storage.
 */
export function useImageUrl(imageId: string | null | undefined): string | null | undefined {
  const [loaded, setLoaded] = useState<{ id: string; url: string | null } | null>(null);

  useEffect(() => {
    if (!imageId) return;
    let live = true;
    imageUrl(imageId).then((url) => { if (live) setLoaded({ id: imageId, url }); });
    return () => { live = false; };
  }, [imageId]);

  if (!imageId) return null;
  return loaded && loaded.id === imageId ? loaded.url : undefined;
}
