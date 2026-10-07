import { getDateLocale, t } from "./i18n/core";

export function uid(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function formatDate(isoOrMs: string | number | Date): string {
  return new Date(isoOrMs).toLocaleDateString(getDateLocale(), { month: "short", day: "numeric", year: "numeric" });
}

export function formatTime(isoOrMs: string | number | Date): string {
  return new Date(isoOrMs).toLocaleTimeString(getDateLocale(), { hour: "numeric", minute: "2-digit" });
}

/** Hours are the app's unit of progress, so they read the same everywhere: 2h, 2.5h, 45m. */
export function formatHours(hours: number | null | undefined): string {
  const h = Math.max(0, hours || 0);
  if (h > 0 && h < 1) {
    // Guard the boundary: 0.999h rounds to 60 minutes, which should read "1h".
    const mins = Math.round(h * 60);
    if (mins < 60) return t("{n}m", { n: Math.max(1, mins) });
  }
  const rounded = Math.round(h * 10) / 10;
  return t("{n}h", { n: Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1) });
}

/** Local (not UTC) YYYY-MM-DD key, so a day boundary matches the user's own clock. */
export function localDateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export type FocalBucket = "Wide" | "Normal" | "Tele";
export type ApertureBucket = "Fast" | "Mid" | "Deep";

/** Buckets a focal length into the categories the album filters by. */
export function focalBucket(mm: number | null | undefined): FocalBucket | null {
  if (!mm || !Number.isFinite(mm)) return null;
  if (mm < 35) return "Wide";
  if (mm <= 70) return "Normal";
  return "Tele";
}

/** Buckets an f-number by how much of the frame stays sharp. */
export function apertureBucket(fNumber: number | null | undefined): ApertureBucket | null {
  if (!fNumber || !Number.isFinite(fNumber)) return null;
  if (fNumber <= 2.8) return "Fast";
  if (fNumber <= 8) return "Mid";
  return "Deep";
}

export function formatCoords(lat: number, lon: number): string {
  const fmt = (v: number, pos: string, neg: string) => `${Math.abs(v).toFixed(5)}° ${v >= 0 ? pos : neg}`;
  return `${fmt(lat, "N", "S")}, ${fmt(lon, "E", "W")}`;
}
