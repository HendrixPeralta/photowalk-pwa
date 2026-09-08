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
 * SunCalc implements): mean anomaly -> ecliptic longitude -> equatorial
 * coordinates -> hour angle.
 */

const RAD = Math.PI / 180;
const DAY_MS = 86400000;
const J1970 = 2440588;
const J2000 = 2451545;
const OBLIQUITY = RAD * 23.4397; // Earth's axial tilt

/* ---------- Julian date helpers ---------- */

const toJulian = (date) => date.valueOf() / DAY_MS - 0.5 + J1970;
const fromJulian = (j) => new Date((j + 0.5 - J1970) * DAY_MS);
const toDays = (date) => toJulian(date) - J2000;

/* ---------- Sun's position on the celestial sphere ---------- */

const solarMeanAnomaly = (d) => RAD * (357.5291 + 0.98560028 * d);

function eclipticLongitude(M) {
  // Equation of the centre plus the longitude of perihelion.
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const P = RAD * 102.9372;
  return M + C + P + Math.PI;
}

const declination = (l) => Math.asin(Math.sin(OBLIQUITY) * Math.sin(l));
const rightAscension = (l) => Math.atan2(Math.sin(l) * Math.cos(OBLIQUITY), Math.cos(l));

function sunCoords(d) {
  const M = solarMeanAnomaly(d);
  const L = eclipticLongitude(M);
  return { dec: declination(L), ra: rightAscension(L), M, L };
}

const siderealTime = (d, lw) => RAD * (280.16 + 360.9856235 * d) - lw;

const altitudeOf = (H, phi, dec) =>
  Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));

/** Azimuth measured clockwise from true north, in radians. */
const azimuthOf = (H, phi, dec) =>
  Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi)) + Math.PI;

/**
 * Where the sun is right now, as seen from lat/lon.
 * Returns altitude and azimuth in degrees; altitude is negative after sunset.
 */
export function sunPosition(date, lat, lon) {
  const lw = RAD * -lon;
  const phi = RAD * lat;
  const d = toDays(date);
  const c = sunCoords(d);
  const H = siderealTime(d, lw) - c.ra;
  return {
    altitude: altitudeOf(H, phi, c.dec) / RAD,
    azimuth: ((azimuthOf(H, phi, c.dec) / RAD) % 360 + 360) % 360
  };
}

/* ---------- Rise/set solver ---------- */

const J0 = 0.0009;
const julianCycle = (d, lw) => Math.round(d - J0 - lw / (2 * Math.PI));
const approxTransit = (Ht, lw, n) => J0 + (Ht + lw) / (2 * Math.PI) + n;
const solarTransitJ = (ds, M, L) => J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);

/** Hour angle at which the sun sits at altitude h. NaN inside a polar day/night. */
function hourAngle(h, phi, dec) {
  const cosH = (Math.sin(h) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));
  if (cosH > 1 || cosH < -1) return NaN;
  return Math.acos(cosH);
}

// Standard altitudes. -0.833° accounts for refraction and the solar disc.
const SUNRISE_ALT = -0.833;
const GOLDEN_ALT = 6;

/**
 * Golden-hour and daylight boundaries for the calendar day `date` falls in.
 * Any field can be null at high latitudes, where the sun may never cross that
 * altitude — callers must handle that rather than assume a sunset exists.
 */
export function solarTimes(date, lat, lon) {
  const lw = RAD * -lon;
  const phi = RAD * lat;
  const d = toDays(date);
  const n = julianCycle(d, lw);
  const ds = approxTransit(0, lw, n);
  const M = solarMeanAnomaly(ds);
  const L = eclipticLongitude(M);
  const dec = declination(L);
  const noonJ = solarTransitJ(ds, M, L);

  const pair = (altDeg) => {
    const w = hourAngle(RAD * altDeg, phi, dec);
    if (Number.isNaN(w)) return [null, null];
    const setJ = solarTransitJ(approxTransit(w, lw, n), M, L);
    // Sunrise is the transit reflected about solar noon.
    return [fromJulian(noonJ - (setJ - noonJ)), fromJulian(setJ)];
  };

  const [sunrise, sunset] = pair(SUNRISE_ALT);
  const [goldenMorningEnd, goldenEveningStart] = pair(GOLDEN_ALT);

  return {
    solarNoon: fromJulian(noonJ),
    sunrise,
    sunset,
    goldenMorningEnd,   // morning golden hour runs sunrise -> here
    goldenEveningStart  // evening golden hour runs here -> sunset
  };
}

/**
 * How long shadows are relative to the object casting them: cot(altitude).
 * A high number means raking, graphic light; near 1 means the classic 45°
 * "shadow index 1" that landscape shooters use as a rule of thumb.
 * Null when the sun is below the horizon and there is no cast shadow.
 */
export function shadowIndex(altitudeDeg) {
  if (altitudeDeg <= 0.5) return null;
  return 1 / Math.tan(RAD * altitudeDeg);
}

/** Compass point for an azimuth in degrees: 248 -> "WSW". */
export function compassPoint(azimuthDeg) {
  const points = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
    'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return points[Math.round((((azimuthDeg % 360) + 360) % 360) / 22.5) % 16];
}

/**
 * The one thing the Walks screen actually wants: which phase of the light we
 * are in, and how long until it changes. Phases are ordered by what a
 * photographer would do next, not by clock time.
 *
 * Returns { phase, label, nextAt, minutesTo, altitude, azimuth, times }.
 * `phase` is one of: golden, blue, day, night.
 */
export function lightWindow(date, lat, lon) {
  const times = solarTimes(date, lat, lon);
  const pos = sunPosition(date, lat, lon);
  const now = date.getTime();
  const at = (t) => (t ? t.getTime() : null);

  const sunrise = at(times.sunrise);
  const sunset = at(times.sunset);
  const gmEnd = at(times.goldenMorningEnd);
  const geStart = at(times.goldenEveningStart);

  // Polar edge cases: no crossing today, so fall back to the sun's altitude.
  if (sunrise === null || sunset === null) {
    const up = pos.altitude > 0;
    return {
      phase: up ? 'day' : 'night',
      label: up ? 'Sun up all day' : 'Sun down all day',
      nextAt: null, minutesTo: null,
      altitude: pos.altitude, azimuth: pos.azimuth, times
    };
  }

  const mins = (t) => Math.max(0, Math.round((t - now) / 60000));

  if (gmEnd !== null && now >= sunrise && now < gmEnd) {
    return { phase: 'golden', label: 'Morning golden hour', nextAt: times.goldenMorningEnd, minutesTo: mins(gmEnd), altitude: pos.altitude, azimuth: pos.azimuth, times };
  }
  if (geStart !== null && now >= geStart && now < sunset) {
    return { phase: 'golden', label: 'Evening golden hour', nextAt: times.sunset, minutesTo: mins(sunset), altitude: pos.altitude, azimuth: pos.azimuth, times };
  }
  if (now < sunrise) {
    return { phase: 'blue', label: 'Blue hour before sunrise', nextAt: times.sunrise, minutesTo: mins(sunrise), altitude: pos.altitude, azimuth: pos.azimuth, times };
  }
  if (now >= sunset) {
    return { phase: 'night', label: 'After sunset', nextAt: null, minutesTo: null, altitude: pos.altitude, azimuth: pos.azimuth, times };
  }
  // Broad daylight: the next thing worth waiting for is evening golden hour.
  const target = geStart !== null ? geStart : sunset;
  return {
    phase: 'day',
    label: 'Golden hour approaching',
    nextAt: geStart !== null ? times.goldenEveningStart : times.sunset,
    minutesTo: mins(target),
    altitude: pos.altitude, azimuth: pos.azimuth, times
  };
}
