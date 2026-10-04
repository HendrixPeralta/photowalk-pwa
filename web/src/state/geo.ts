// The last known position, as a store, so everything showing it (golden-hour
// badge, launch button) updates the moment a new fix arrives.

import { create } from "zustand";
import { cachedFix, requestFix } from "@/lib/geo";
import type { Fix } from "./types";

export const useFix = create<{ fix: Fix | null }>(() => ({ fix: null }));

/** Reads the cached fix (call once at boot; it lives in localStorage). */
export function loadFix(): void {
  useFix.setState({ fix: cachedFix() });
}

/** Asks the browser for a position. Only call from a tap. Rejects with a showable reason. */
export async function locate(): Promise<Fix> {
  const fix = await requestFix();
  useFix.setState({ fix });
  return fix;
}
