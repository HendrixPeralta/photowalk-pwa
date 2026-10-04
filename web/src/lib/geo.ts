/**
 * Location, kept deliberately quiet.
 *
 * PhotoEYE never asks for GPS on boot: a permission prompt before the user has
 * done anything is the fastest way to get denied forever. Features that want a
 * position (golden-hour timings, the maps hand-off) read the last cached fix,
 * and only call requestFix() from an explicit tap.
 *
 * The fix lives in its own localStorage key rather than the saved state, so it
 * never rides along in the demo fixture. Browser-only.
 */

import { t } from "./i18n/core";
import type { Fix } from "@/state/types";

export const FIX_KEY = "photowalk:fix";
const FIX_MAX_AGE_MS = 12 * 3600 * 1000; // a day-old city-level fix is still fine for sun math

/** The last position we were given, or null. */
export function cachedFix(): Fix | null {
  try {
    const raw = localStorage.getItem(FIX_KEY);
    if (!raw) return null;
    const fix = JSON.parse(raw) as Fix;
    if (!Number.isFinite(fix.lat) || !Number.isFinite(fix.lon)) return null;
    return fix;
  } catch {
    return null;
  }
}

/** True when the fix is recent enough to quote sun timings from. */
export function fixIsFresh(fix: Fix | null = cachedFix(), now = Date.now()): boolean {
  return Boolean(fix) && now - (fix!.at || 0) < FIX_MAX_AGE_MS;
}

function storeFix(position: GeolocationPosition): Fix {
  const fix: Fix = {
    lat: position.coords.latitude,
    lon: position.coords.longitude,
    accuracy: position.coords.accuracy,
    at: Date.now(),
  };
  try { localStorage.setItem(FIX_KEY, JSON.stringify(fix)); } catch { /* private mode */ }
  return fix;
}

export function geolocationSupported(): boolean {
  return typeof navigator !== "undefined" && "geolocation" in navigator;
}

/**
 * Asks the browser for one position and caches it. Resolves with the fix or
 * rejects with a short, user-showable reason. Only call this from a user gesture.
 */
export function requestFix({ highAccuracy = false, timeout = 12000 } = {}): Promise<Fix> {
  return new Promise((resolve, reject) => {
    if (!geolocationSupported()) { reject(new Error(t("This browser has no location support."))); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(storeFix(pos)),
      (err) => reject(new Error(describe(err))),
      { enableHighAccuracy: highAccuracy, timeout, maximumAge: 60000 },
    );
  });
}

function describe(err: GeolocationPositionError | null): string {
  if (err?.code === 1) return t("Location permission denied.");
  if (err?.code === 2) return t("Couldn't find your location.");
  if (err?.code === 3) return t("Location request timed out.");
  return t("Location is unavailable.");
}

/** "37.7749° N": the readout format the launch button uses. */
export function formatLat(lat: number): string {
  return `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? "N" : "S"}`;
}
