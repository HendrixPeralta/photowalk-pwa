"use client";

import { useEffect, useState } from "react";
import { imageUrl } from "@/lib/db";

/** An object URL for a photo stored in IndexedDB, or null until it loads (or if it is gone). */
export function useImageUrl(imageId: string | null | undefined): string | null {
  const [loaded, setLoaded] = useState<{ id: string; url: string | null } | null>(null);

  useEffect(() => {
    if (!imageId) return;
    let live = true;
    imageUrl(imageId).then((url) => { if (live) setLoaded({ id: imageId, url }); });
    return () => { live = false; };
  }, [imageId]);

  return loaded && loaded.id === imageId ? loaded.url : null;
}
