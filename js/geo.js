/**
 * Location, kept deliberately quiet.
 *
 * PhotoWalk never asks for GPS on boot — a permission prompt before the user
 * has done anything is the fastest way to get denied forever. Features that
 * want a position (golden-hour timings, walk tracking) read the last cached
 * fix, and only call requestFix() from an explicit tap.
 *
 * The fix lives in its own localStorage key rather than the main state blob so
 * it never rides along in exports or the demo fixture.
 */

const FIX_KEY = 'photowalk:fix';
const FIX_MAX_AGE_MS = 12 * 3600 * 1000; // a day-old city-level fix is still fine for sun math

let watchId = null;

/** The last position we were given, or null. { lat, lon, accuracy, at } */
export function cachedFix() {
  try {
    const raw = localStorage.getItem(FIX_KEY);
    if (!raw) return null;
    const fix = JSON.parse(raw);
    if (!Number.isFinite(fix.lat) || !Number.isFinite(fix.lon)) return null;
    return fix;
  } catch (err) {
    return null;
  }
}

/** True when the cached fix is recent enough to quote sun timings from. */
export function fixIsFresh(fix = cachedFix()) {
  return Boolean(fix) && Date.now() - (fix.at || 0) < FIX_MAX_AGE_MS;
}

function storeFix(position) {
  const fix = {
    lat: position.coords.latitude,
    lon: position.coords.longitude,
    accuracy: position.coords.accuracy,
    at: Date.now()
  };
  try { localStorage.setItem(FIX_KEY, JSON.stringify(fix)); } catch (err) { /* private mode */ }
  window.dispatchEvent(new CustomEvent('photowalk:fix-changed', { detail: fix }));
  return fix;
}

export function geolocationSupported() {
  return 'geolocation' in navigator;
}

/**
 * Asks the browser for one position. Resolves with the fix or rejects with a
 * short, user-showable reason. Only call this from a user gesture.
 */
export function requestFix({ highAccuracy = false, timeout = 12000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!geolocationSupported()) { reject(new Error('This browser has no location support.')); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(storeFix(pos)),
      (err) => reject(new Error(describe(err))),
      { enableHighAccuracy: highAccuracy, timeout, maximumAge: 60000 }
    );
  });
}

/**
 * Follows the device during a walk. `onPoint` receives { lat, lon, accuracy, at }
 * for every update; the newest is also cached. Returns a stop function.
 */
export function watchPosition(onPoint, onError) {
  if (!geolocationSupported()) {
    if (onError) onError(new Error('This browser has no location support.'));
    return () => {};
  }
  stopWatching();
  watchId = navigator.geolocation.watchPosition(
    (pos) => onPoint(storeFix(pos)),
    (err) => { if (onError) onError(new Error(describe(err))); },
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 }
  );
  return stopWatching;
}

export function stopWatching() {
  if (watchId === null) return;
  navigator.geolocation.clearWatch(watchId);
  watchId = null;
}

export function isWatching() {
  return watchId !== null;
}

function describe(err) {
  if (err && err.code === 1) return 'Location permission denied.';
  if (err && err.code === 2) return 'Could not get a location fix.';
  if (err && err.code === 3) return 'Location request timed out.';
  return 'Location is unavailable.';
}

/** Great-circle distance between two fixes, in metres. */
export function distanceMeters(a, b) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** "37.7749° N" — the readout format the launch button uses. */
export function formatLat(lat) {
  return `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? 'N' : 'S'}`;
}
