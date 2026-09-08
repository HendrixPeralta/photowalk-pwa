/**
 * The instrument panel at the top of the Walks screen: the seven-day
 * film-canister strip, its golden-hour badge, and the two cadence tiles.
 *
 * Everything here is derived from data PhotoWalk already has — the activity
 * log, the frame log, and (only if the user has granted it) a cached GPS fix.
 * Nothing is fetched, and nothing is invented: with no location the badge says
 * so and offers a tap to fix it, rather than showing a plausible-looking
 * sunset for a city the user isn't in.
 */

import { state, save, hoursInPeriod } from './store.js';
import { localDateKey } from './util.js';
import { cachedFix, fixIsFresh, requestFix, geolocationSupported, formatLat } from './geo.js';
import { lightWindow, solarTimes } from './sun.js';
import { showToast } from './toast.js';

let els = {};
let goldenHandle = null;

export function initWalkScreen() {
  els = {
    golden: document.getElementById('goldenBadge'),
    goldenText: document.getElementById('goldenText'),
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

  // The badge is the affordance for granting location — it says as much when
  // there is no fix.
  els.golden.addEventListener('click', async () => {
    if (fixIsFresh()) return;
    if (!geolocationSupported()) { showToast('This browser has no location support.'); return; }
    els.goldenText.textContent = 'Getting a fix…';
    try {
      await requestFix();
      renderGolden();
      renderLaunchMeta();
    } catch (err) {
      els.goldenText.textContent = err.message;
      showToast(err.message);
    }
  });

  // A new fix changes both the sun readout and the launch button's coordinates.
  window.addEventListener('photowalk:fix-changed', () => { renderGolden(); renderLaunchMeta(); });

  // The countdown only needs minute resolution.
  clearInterval(goldenHandle);
  goldenHandle = setInterval(renderGolden, 30000);
}

export function renderWalkScreen() {
  renderGolden();
  renderFilmStrip();
  renderCadence();
  renderLaunchMeta();
}

/* ---------- Golden-hour badge ---------- */

function hhmm(date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

/**
 * One short line of golden-hour timing: minutes left if we are inside the
 * window, otherwise the clock time the next one opens. After sunset that means
 * reaching into tomorrow morning rather than pointing at a window that closed.
 */
function goldenReading(now, fix) {
  const light = lightWindow(now, fix.lat, fix.lon);
  const t = light.times;

  if (light.phase === 'golden') {
    return { text: `${light.minutesTo}m of golden left`, state: 'now', title: light.label };
  }
  if (light.phase === 'blue' && t.sunrise) {
    return { text: `Golden ${hhmm(t.sunrise)}`, state: 'next', title: 'Morning golden hour starts at sunrise' };
  }
  if (light.phase === 'day') {
    const target = t.goldenEveningStart || t.sunset;
    if (target) return { text: `Golden ${hhmm(target)}`, state: 'next', title: light.label };
  }
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const next = solarTimes(tomorrow, fix.lat, fix.lon);
  if (next.sunrise) {
    return { text: `Golden ${hhmm(next.sunrise)}`, state: 'next', title: 'Tomorrow morning golden hour' };
  }
  return { text: light.label, state: 'next', title: light.label };
}

function renderGolden() {
  if (!els.goldenText) return;

  const fix = cachedFix();
  if (!fixIsFresh(fix)) {
    const supported = geolocationSupported();
    els.goldenText.textContent = supported ? 'Add location' : 'No location support';
    els.golden.dataset.state = 'nofix';
    els.golden.title = supported
      ? 'Tap to add your location for golden-hour timings.'
      : 'Golden-hour timings need location support.';
    return;
  }

  const reading = goldenReading(new Date(), fix);
  els.goldenText.textContent = reading.text;
  els.golden.dataset.state = reading.state;
  els.golden.title = reading.title;
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
