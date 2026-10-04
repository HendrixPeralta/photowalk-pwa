/**
 * Solar position and golden-hour timings, computed entirely on-device.
 *
 * There is no weather or sunrise API behind this: given a date and a coarse
 * lat/long, the standard low-precision solar equations land rise/set times
 * within a couple of minutes (the rise/set solver takes a single pass rather
 * than iterating), which is far tighter than "golden hour starts in 42 minutes"
 * needs. That keeps the Walks screen working offline and the app backend-free.
 *
 * The algorithm is the usual astronomical almanac formulation (the same one
 * SunCalc implements): mean anomaly, then ecliptic longitude, then equatorial
 * coordinates, then hour angle.
 */

import { t } from "./i18n/core";

const RAD = Math.PI / 180;
const DAY_MS = 86400000;
const J1970 = 2440588;
const J2000 = 2451545;
const OBLIQUITY = RAD * 23.4397; // Earth's axial tilt

/* ---------- Julian date helpers ---------- */

const toJulian = (date: Date) => date.valueOf() / DAY_MS - 0.5 + J1970;
const fromJulian = (j: number) => new Date((j + 0.5 - J1970) * DAY_MS);
const toDays = (date: Date) => toJulian(date) - J2000;

/* ---------- Sun's position on the celestial sphere ---------- */

const solarMeanAnomaly = (d: number) => RAD * (357.5291 + 0.98560028 * d);

function eclipticLongitude(M: number): number {
  // Equation of the centre plus the longitude of perihelion.
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const P = RAD * 102.9372;
  return M + C + P + Math.PI;
}

const declination = (l: number) => Math.asin(Math.sin(OBLIQUITY) * Math.sin(l));
const rightAscension = (l: number) => Math.atan2(Math.sin(l) * Math.cos(OBLIQUITY), Math.cos(l));

function sunCoords(d: number) {
  const M = solarMeanAnomaly(d);
  const L = eclipticLongitude(M);
  return { dec: declination(L), ra: rightAscension(L), M, L };
}

const siderealTime = (d: number, lw: number) => RAD * (280.16 + 360.9856235 * d) - lw;

const altitudeOf = (H: number, phi: number, dec: number) =>
  Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));

/** Azimuth measured clockwise from true north, in radians. */
const azimuthOf = (H: number, phi: number, dec: number) =>
  Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi)) + Math.PI;

export interface SunPosition {
  /** Degrees above the horizon; negative after sunset. */
  altitude: number;
  /** Degrees clockwise from true north. */
  azimuth: number;
}

/** Where the sun is right now, as seen from lat/lon. */
export function sunPosition(date: Date, lat: number, lon: number): SunPosition {
  const lw = RAD * -lon;
  const phi = RAD * lat;
  const d = toDays(date);
  const c = sunCoords(d);
  const H = siderealTime(d, lw) - c.ra;
  return {
    altitude: altitudeOf(H, phi, c.dec) / RAD,
    azimuth: (((azimuthOf(H, phi, c.dec) / RAD) % 360) + 360) % 360,
  };
}

/* ---------- Rise/set solver ---------- */

const J0 = 0.0009;
const julianCycle = (d: number, lw: number) => Math.round(d - J0 - lw / (2 * Math.PI));
const approxTransit = (Ht: number, lw: number, n: number) => J0 + (Ht + lw) / (2 * Math.PI) + n;
const solarTransitJ = (ds: number, M: number, L: number) => J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);

/** Hour angle at which the sun sits at altitude h. NaN inside a polar day/night. */
function hourAngle(h: number, phi: number, dec: number): number {
  const cosH = (Math.sin(h) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));
  if (cosH > 1 || cosH < -1) return NaN;
  return Math.acos(cosH);
}

// Standard altitudes. -0.833° accounts for refraction and the solar disc.
const SUNRISE_ALT = -0.833;
const GOLDEN_ALT = 6;

export interface SolarTimes {
  solarNoon: Date;
  sunrise: Date | null;
  sunset: Date | null;
  /** Morning golden hour runs sunrise to here. */
  goldenMorningEnd: Date | null;
  /** Evening golden hour runs here to sunset. */
  goldenEveningStart: Date | null;
}

/**
 * Golden-hour and daylight boundaries for the calendar day `date` falls in.
 * Any field can be null at high latitudes, where the sun may never cross that
 * altitude: callers must handle that rather than assume a sunset exists.
 */
export function solarTimes(date: Date, lat: number, lon: number): SolarTimes {
  const lw = RAD * -lon;
  const phi = RAD * lat;
  const d = toDays(date);
  const n = julianCycle(d, lw);
  const ds = approxTransit(0, lw, n);
  const M = solarMeanAnomaly(ds);
  const L = eclipticLongitude(M);
  const dec = declination(L);
  const noonJ = solarTransitJ(ds, M, L);

  const pair = (altDeg: number): [Date | null, Date | null] => {
    const w = hourAngle(RAD * altDeg, phi, dec);
    if (Number.isNaN(w)) return [null, null];
    const setJ = solarTransitJ(approxTransit(w, lw, n), M, L);
    // Sunrise is the transit reflected about solar noon.
    return [fromJulian(noonJ - (setJ - noonJ)), fromJulian(setJ)];
  };

  const [sunrise, sunset] = pair(SUNRISE_ALT);
  const [goldenMorningEnd, goldenEveningStart] = pair(GOLDEN_ALT);

  return { solarNoon: fromJulian(noonJ), sunrise, sunset, goldenMorningEnd, goldenEveningStart };
}

export type LightPhase = "golden" | "blue" | "day" | "night";

export interface LightWindow extends SunPosition {
  phase: LightPhase;
  label: string;
  nextAt: Date | null;
  minutesTo: number | null;
  times: SolarTimes;
}

/**
 * The one thing the Walks screen actually wants: which phase of the light we
 * are in, and how long until it changes. Phases are ordered by what a
 * photographer would do next, not by clock time.
 */
export function lightWindow(date: Date, lat: number, lon: number): LightWindow {
  const times = solarTimes(date, lat, lon);
  const pos = sunPosition(date, lat, lon);
  const now = date.getTime();
  const at = (d: Date | null) => (d ? d.getTime() : null);
  const base = { altitude: pos.altitude, azimuth: pos.azimuth, times };

  const sunrise = at(times.sunrise);
  const sunset = at(times.sunset);
  const gmEnd = at(times.goldenMorningEnd);
  const geStart = at(times.goldenEveningStart);

  // Polar edge cases: no crossing today, so fall back to the sun's altitude.
  if (sunrise === null || sunset === null) {
    const up = pos.altitude > 0;
    return { ...base, phase: up ? "day" : "night", label: up ? t("Sun up all day") : t("Sun down all day"), nextAt: null, minutesTo: null };
  }

  const mins = (target: number) => Math.max(0, Math.round((target - now) / 60000));

  if (gmEnd !== null && now >= sunrise && now < gmEnd) {
    return { ...base, phase: "golden", label: t("Morning golden hour"), nextAt: times.goldenMorningEnd, minutesTo: mins(gmEnd) };
  }
  if (geStart !== null && now >= geStart && now < sunset) {
    return { ...base, phase: "golden", label: t("Evening golden hour"), nextAt: times.sunset, minutesTo: mins(sunset) };
  }
  if (now < sunrise) {
    return { ...base, phase: "blue", label: t("Blue hour before sunrise"), nextAt: times.sunrise, minutesTo: mins(sunrise) };
  }
  if (now >= sunset) {
    return { ...base, phase: "night", label: t("After sunset"), nextAt: null, minutesTo: null };
  }
  // Broad daylight: the next thing worth waiting for is evening golden hour.
  const target = geStart !== null ? geStart : sunset;
  return {
    ...base,
    phase: "day",
    label: t("Golden hour approaching"),
    nextAt: geStart !== null ? times.goldenEveningStart : times.sunset,
    minutesTo: mins(target),
  };
}
