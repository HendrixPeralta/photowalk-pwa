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

import { t, dateLocale, lang } from './i18n.js';
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
    launchMode: document.getElementById('launchModeLabel')
  };

  // The badge is the affordance for granting location — it says as much when
  // there is no fix.
  els.golden.addEventListener('click', async () => {
    if (fixIsFresh()) return;
    if (!geolocationSupported()) { showToast(t('This browser has no location support.')); return; }
    els.goldenText.textContent = t('Finding your location…');
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
  return date.toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit', hour12: false });
}

/**
 * One short line of golden-hour timing: minutes left if we are inside the
 * window, otherwise the clock time the next one opens. After sunset that means
 * reaching into tomorrow morning rather than pointing at a window that closed.
 */
function goldenReading(now, fix) {
  const light = lightWindow(now, fix.lat, fix.lon);
  const times = light.times;

  if (light.phase === 'golden') {
    return { text: t('{n} min of golden hour left', { n: light.minutesTo }), state: 'now', title: light.label };
  }
  if (light.phase === 'blue' && times.sunrise) {
    return { text: t('Golden {time}', { time: hhmm(times.sunrise) }), state: 'next', title: t('Morning golden hour starts at sunrise') };
  }
  if (light.phase === 'day') {
    const target = times.goldenEveningStart || times.sunset;
    if (target) return { text: t('Golden {time}', { time: hhmm(target) }), state: 'next', title: light.label };
  }
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const next = solarTimes(tomorrow, fix.lat, fix.lon);
  if (next.sunrise) {
    return { text: t('Golden {time}', { time: hhmm(next.sunrise) }), state: 'next', title: t('Tomorrow morning golden hour') };
  }
  return { text: light.label, state: 'next', title: light.label };
}

function renderGolden() {
  if (!els.goldenText) return;

  const fix = cachedFix();
  if (!fixIsFresh(fix)) {
    const supported = geolocationSupported();
    els.goldenText.textContent = supported ? t('Add location') : t('No location support');
    els.golden.dataset.state = 'nofix';
    els.golden.title = supported
      ? t('Tap to add your location for golden-hour timings.')
      : t('Golden-hour timings need location support.');
    return;
  }

  const reading = goldenReading(new Date(), fix);
  els.goldenText.textContent = reading.text;
  els.golden.dataset.state = reading.state;
  els.golden.title = reading.title;
}

/* ---------- Seven-day film strip ---------- */

const DAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
// Japanese reads the locale's own one-character weekday (日 月 火…).
const dayInitial = (d) => (lang === 'ja' ? d.toLocaleDateString(dateLocale, { weekday: 'narrow' }) : DAY_INITIALS[d.getDay()]);

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

    const value = frames ? String(frames) : (hours > 0 ? t('{n}h', { n: hours.toFixed(1) }) : '–');
    cells.push(`
      <div class="film-cell${today ? ' film-cell-today' : ''}" data-shot="${shot ? 1 : 0}"
           title="${t(frames === 1 ? '{date}: {hours}h, {n} photo' : '{date}: {hours}h, {n} photos', { date: key, hours: hours.toFixed(2), n: frames })}">
        <span class="film-cell-day">${today ? t('Today') : dayInitial(d)}</span>
        <span class="film-cell-can">
          <svg viewBox="0 0 24 24" aria-hidden="true"><use href="#${shot ? 'i-film' : 'i-camera'}"/></svg>
        </span>
        <span class="film-cell-val">${today && !shot ? t('Ready') : value}</span>
      </div>`);
  }
  els.strip.innerHTML = cells.join('');
}

/* ---------- Cadence tiles ---------- */

function renderCadence() {
  if (!els.walks) return;

  const goal = Number(state.profile.goals.week) || 3;
  const done = hoursInPeriod('week');
  els.walks.textContent = t('{done} of {goal}', { done: done.toFixed(1), goal });
  els.walksBar.style.width = `${Math.min(100, (done / goal) * 100)}%`;

  const thisWeek = framesBetween(6, 0);
  const lastWeek = framesBetween(13, 7);
  els.frames.textContent = String(thisWeek);
  if (!lastWeek && !thisWeek) {
    els.framesNote.textContent = t('Log photos from the Live Walk tab');
  } else if (!lastWeek) {
    els.framesNote.textContent = t('First week on record');
  } else {
    const delta = Math.round(((thisWeek - lastWeek) / lastWeek) * 100);
    els.framesNote.textContent = t('{delta}% vs last week', { delta: `${delta >= 0 ? '+' : ''}${delta}` });
  }
}

/* ---------- Launch button chrome ---------- */

export function renderLaunchMeta(mode = null) {
  if (!els.launchMode) return;
  const active = mode || (document.getElementById('modeGuidedBtn').classList.contains('active') ? 'guided' : 'casual');
  const minutes = Number(state.profile.guidedDurationMin) || 30;
  els.launchMode.textContent = active === 'guided' ? t('Guided · {n} min', { n: minutes }) : t('Casual Mode');

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
