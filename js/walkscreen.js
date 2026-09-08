/**
 * The instrument panel at the top of the Walks screen: the solar meter, the
 * seven-day film-canister strip, and the two cadence tiles.
 *
 * Everything here is derived from data PhotoWalk already has — the activity
 * log, the frame log, and (only if the user has granted it) a cached GPS fix.
 * Nothing is fetched, and nothing is invented: with no location the solar card
 * says so and offers a tap to fix it, rather than showing a plausible-looking
 * sunset for a city the user isn't in.
 */

import { state, save, hoursInPeriod } from './store.js';
import { localDateKey } from './util.js';
import { cachedFix, fixIsFresh, requestFix, geolocationSupported, formatLat } from './geo.js';
import { lightWindow, compassPoint } from './sun.js';
import { showToast } from './toast.js';

let els = {};
let solarHandle = null;

export function initWalkScreen() {
  els = {
    dot: document.getElementById('solarDot'),
    readout: document.getElementById('solarReadout'),
    greeting: document.getElementById('solarGreeting'),
    line: document.getElementById('solarLine'),
    clock: document.getElementById('solarClock'),
    clockLabel: document.getElementById('solarClockLabel'),
    chain: document.getElementById('cadenceChain'),
    strip: document.getElementById('filmStrip'),
    walks: document.getElementById('cadenceWalks'),
    walksBar: document.getElementById('cadenceWalksBar'),
    frames: document.getElementById('cadenceFrames'),
    framesNote: document.getElementById('cadenceFramesNote'),
    launchFix: document.getElementById('launchFix'),
    launchFixText: document.getElementById('launchFixText'),
    launchMode: document.getElementById('launchModeLabel'),
    guidedBadge: document.getElementById('guidedPacingBadge')
  };

  // The whole solar card is the affordance for granting location — the line
  // inside it says as much when there is no fix.
  els.line.parentElement.addEventListener('click', async () => {
    if (fixIsFresh()) return;
    if (!geolocationSupported()) { showToast('This browser has no location support.'); return; }
    els.line.textContent = 'Getting a fix…';
    try {
      await requestFix();
      renderSolar();
      renderLaunchMeta();
    } catch (err) {
      els.line.textContent = err.message;
    }
  });

  // A new fix changes both the sun readout and the launch button's coordinates.
  window.addEventListener('photowalk:fix-changed', () => { renderSolar(); renderLaunchMeta(); });

  // The countdown only needs minute resolution.
  clearInterval(solarHandle);
  solarHandle = setInterval(renderSolar, 30000);
}

export function renderWalkScreen() {
  renderSolar();
  renderFilmStrip();
  renderCadence();
  renderLaunchMeta();
}

/* ---------- Solar meter ---------- */

function greetingFor(hour) {
  if (hour < 5) return 'Still dark out';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function hhmm(date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

function renderSolar() {
  if (!els.greeting) return;
  const now = new Date();
  const name = (state.profile.displayName || '').trim();
  els.greeting.textContent = `${greetingFor(now.getHours())}${name ? ', ' + name : ''}.`;

  const fix = cachedFix();
  if (!fixIsFresh(fix)) {
    els.dot.dataset.state = 'night';
    els.readout.textContent = 'NO FIX';
    els.line.textContent = geolocationSupported()
      ? 'Tap to add your location for golden-hour timings.'
      : 'Golden-hour timings need location support.';
    els.clock.textContent = hhmm(now);
    els.clockLabel.textContent = 'Local time';
    return;
  }

  const light = lightWindow(now, fix.lat, fix.lon);
  els.dot.dataset.state = light.phase === 'night' ? 'night' : 'sun';
  els.readout.textContent =
    `ALT ${light.altitude.toFixed(1)}° · ${Math.round(light.azimuth)}° ${compassPoint(light.azimuth)}`;

  if (light.minutesTo === null) {
    els.line.textContent = light.label;
  } else if (light.phase === 'golden') {
    els.line.innerHTML = `${light.label} &mdash; <strong>${light.minutesTo}m left</strong>`;
  } else {
    els.line.innerHTML = `${light.label} <strong>(${formatCountdown(light.minutesTo)})</strong>`;
  }

  // Solar noon is the honest "peak" reading; after it has passed, sunset is
  // the number a photographer is actually watching.
  const past = light.times.solarNoon.getTime() < now.getTime();
  const target = past && light.times.sunset ? light.times.sunset : light.times.solarNoon;
  els.clock.textContent = hhmm(target);
  els.clockLabel.textContent = past && light.times.sunset ? 'Sunset' : 'Solar peak';
}

function formatCountdown(minutes) {
  if (minutes < 60) return `${minutes}m remaining`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m remaining` : `${h}h remaining`;
}

/* ---------- Seven-day film strip ---------- */

const DAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** Frames logged on a given day: HUD captures plus references saved. */
export function framesOnDay(key) {
  return (state.frameLog && state.frameLog[key]) || 0;
}

function framesBetween(startDaysAgo, endDaysAgo) {
  let total = 0;
  for (let i = startDaysAgo; i >= endDaysAgo; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    total += framesOnDay(localDateKey(d));
  }
  return total;
}

function renderFilmStrip() {
  if (!els.strip) return;
  const cells = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = localDateKey(d);
    const hours = state.activityLog[key] || 0;
    const frames = framesOnDay(key);
    const shot = hours > 0 || frames > 0;
    const today = i === 0;

    const value = frames ? String(frames) : (hours > 0 ? `${hours.toFixed(1)}h` : '–');
    cells.push(`
      <div class="film-cell${today ? ' film-cell-today' : ''}" data-shot="${shot ? 1 : 0}"
           title="${key}: ${hours.toFixed(2)}h, ${frames} frame${frames === 1 ? '' : 's'}">
        <span class="film-cell-day">${today ? 'Today' : DAY_INITIALS[d.getDay()]}</span>
        <span class="film-cell-can">
          <svg viewBox="0 0 24 24" aria-hidden="true"><use href="#${shot ? 'i-film' : 'i-camera'}"/></svg>
        </span>
        <span class="film-cell-val">${today && !shot ? 'Ready' : value}</span>
      </div>`);
  }
  els.strip.innerHTML = cells.join('');
}

/* ---------- Cadence tiles ---------- */

function renderCadence() {
  if (!els.walks) return;

  const streak = liveStreak();
  els.chain.textContent = `${streak}-Day Chain`;

  const goal = Number(state.profile.goals.week) || 3;
  const done = hoursInPeriod('week');
  els.walks.textContent = `${done.toFixed(1)} of ${goal}`;
  els.walksBar.style.width = `${Math.min(100, (done / goal) * 100)}%`;

  const thisWeek = framesBetween(6, 0);
  const lastWeek = framesBetween(13, 7);
  els.frames.textContent = String(thisWeek);
  if (!lastWeek && !thisWeek) {
    els.framesNote.textContent = 'Log frames from the Field HUD';
  } else if (!lastWeek) {
    els.framesNote.textContent = 'First week on record';
  } else {
    const delta = Math.round(((thisWeek - lastWeek) / lastWeek) * 100);
    els.framesNote.textContent = `${delta >= 0 ? '+' : ''}${delta}% vs last week`;
  }
}

/** currentStreak() without the import cycle — same rule, read live. */
function liveStreak() {
  const { streak, lastWalkDate } = state.profile;
  if (!streak || !lastWalkDate) return 0;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const alive = lastWalkDate === new Date().toDateString() || lastWalkDate === yesterday.toDateString();
  return alive ? streak : 0;
}

/* ---------- Launch button chrome ---------- */

export function renderLaunchMeta(mode = null) {
  if (!els.launchMode) return;
  const active = mode || (document.getElementById('modeGuidedBtn').classList.contains('active') ? 'guided' : 'casual');
  const minutes = Number(state.profile.guidedDurationMin) || 30;
  els.launchMode.textContent = active === 'guided' ? `Guided · ${minutes}m Sprint` : 'Casual Mode';
  if (els.guidedBadge) els.guidedBadge.textContent = `${minutes}m Pacing`;

  const fix = cachedFix();
  if (fix && fixIsFresh(fix)) {
    els.launchFixText.textContent = formatLat(fix.lat);
    els.launchFix.classList.remove('hidden');
  } else {
    els.launchFix.classList.add('hidden');
  }
}

/* ---------- Frame log ---------- */

/**
 * Records one exposed frame against today. Called when a frame is logged in the
 * Field HUD and when a reference is saved to the album, so "frames exposed"
 * means the same thing wherever it is shown.
 */
export function logFrame(dateKey = localDateKey()) {
  if (!state.frameLog) state.frameLog = {};
  state.frameLog[dateKey] = (state.frameLog[dateKey] || 0) + 1;
  save();
}
