/**
 * Field HUD — the screen you actually look at while you're out walking.
 *
 * Everything on it is measured, not simulated. Elapsed and target come from the
 * walk timer, the directive is the theme and its mini-challenges, frames are
 * the ones you logged yourself (with whatever EXIF the file carried), and the
 * track is a real GPS polyline you opt into with a tap.
 *
 * Deliberately absent: a viewfinder simulation with live aperture and shutter.
 * A web app cannot read those off your camera, and inventing them on a screen
 * you're holding next to the real thing would be theatre.
 */

import { state, save } from './store.js';
import { putImage, imageUrl } from './db.js';
import { readExif } from './exif.js';
import { showToast } from './toast.js';
import { openModal, closeModal } from './modal.js';
import { escapeHtml, uid, navigateTo, drawToCanvas, canvasToBlob, localDateKey } from './util.js';
import { watchPosition, stopWatching, isWatching, distanceMeters, cachedFix, fixIsFresh } from './geo.js';
import { sunPosition, shadowIndex, compassPoint } from './sun.js';
import { logFrame } from './walkscreen.js';
import { drawTrack } from './trackmap.js';

let els = {};
let tickHandle = null;
let hooks = { pause: null, resume: null, finish: null, themeOf: null };

/** Wires the HUD. `api` hands over the walk-clock controls that live in walks.js. */
export function initHud(api = {}) {
  hooks = Object.assign(hooks, api);

  els = {
    idle: document.getElementById('hudIdle'),
    active: document.getElementById('hudActive'),
    goToWalks: document.getElementById('hudGoToWalksBtn'),
    elapsed: document.getElementById('hudElapsed'),
    target: document.getElementById('hudTarget'),
    frames: document.getElementById('hudFrames'),
    track: document.getElementById('hudTrack'),
    missionNo: document.getElementById('hudMissionNo'),
    missionMode: document.getElementById('hudMissionMode'),
    missionTitle: document.getElementById('hudMissionTitle'),
    missionHint: document.getElementById('hudMissionHint'),
    pips: document.getElementById('hudMissionPips'),
    progress: document.getElementById('hudMissionProgress'),
    synced: document.getElementById('hudMissionSynced'),
    challenges: document.getElementById('hudChallengesList'),
    strip: document.getElementById('hudCaptureStrip'),
    logLast: document.getElementById('hudLogLast'),
    logBtn: document.getElementById('hudLogFrameBtn'),
    logLabel: document.getElementById('hudLogFrameLabel'),
    frameInput: document.getElementById('hudFrameInput'),
    noteBtn: document.getElementById('hudNoteBtn'),
    pinBtn: document.getElementById('hudPinBtn'),
    mapPlace: document.getElementById('hudMapPlace'),
    mapCanvas: document.getElementById('hudMapCanvas'),
    sunBadge: document.getElementById('hudSunBadge'),
    distBadge: document.getElementById('hudDistBadge'),
    shadowBadge: document.getElementById('hudShadowBadge'),
    trackToggle: document.getElementById('hudTrackToggleBtn'),
    pauseBtn: document.getElementById('hudPauseBtn'),
    completeBtn: document.getElementById('hudCompleteBtn'),
    liveDot: document.getElementById('hudLiveDot')
  };

  els.goToWalks.addEventListener('click', () => navigateTo('walks'));
  els.logBtn.addEventListener('click', () => els.frameInput.click());
  els.frameInput.addEventListener('change', onFramePicked);
  els.noteBtn.addEventListener('click', openFieldNote);
  els.pinBtn.addEventListener('click', pinLocation);
  els.trackToggle.addEventListener('click', toggleTracking);
  els.pauseBtn.addEventListener('click', togglePause);
  els.completeBtn.addEventListener('click', () => hooks.finish && hooks.finish());
  els.strip.addEventListener('click', (e) => {
    const chip = e.target.closest('.capture-chip');
    if (chip) openFrameSheet(chip.dataset.frameId);
  });

  window.addEventListener('photowalk:walk-changed', () => { syncLiveDot(); renderHud(); });
  syncLiveDot();
}

/* ---------- Rendering ---------- */

export function renderHud() {
  if (!els.active) return;
  const w = state.activeWalk;

  els.idle.classList.toggle('hidden', Boolean(w));
  els.active.classList.toggle('hidden', !w);
  stopTicking();
  if (!w) return;

  const theme = hooks.themeOf ? hooks.themeOf() : null;
  const guided = w.mode === 'guided';

  els.missionNo.textContent = `Mission #${String(state.profile.walksCompleted + 1).padStart(2, '0')} · Directive`;
  els.missionMode.textContent = guided ? `${w.durationMin}m Sprint` : 'Casual';
  els.missionTitle.textContent = theme ? theme.title : 'Walk in progress';
  els.missionHint.textContent = theme ? theme.brief : 'Pick a subject and work it until it gives.';

  renderChallenges(theme);
  renderCaptureStrip();
  renderMap();
  els.pauseBtn.querySelector('[data-label]').textContent = w.pausedAt ? 'Resume Walk' : 'Pause Walk';

  tickHud();
  tickHandle = setInterval(tickHud, 1000);
}

function stopTicking() {
  clearInterval(tickHandle);
  tickHandle = null;
}

/** Called by app.js when the HUD tab is left, so the interval doesn't idle on. */
export function pauseHudRendering() {
  stopTicking();
}

function clockText(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const mm = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function tickHud() {
  const w = state.activeWalk;
  if (!w) { stopTicking(); return; }

  // While paused the clock is frozen at the moment the pause began.
  const now = w.pausedAt || Date.now();
  const elapsed = w.startedAt ? now - w.startedAt : 0;
  els.elapsed.textContent = w.startedAt ? clockText(elapsed) : '--:--';

  if (w.mode === 'guided') {
    els.target.textContent = clockText(Math.max(0, w.durationMin * 60000 - elapsed));
  } else {
    els.target.textContent = 'Open';
  }

  const frames = w.frames || [];
  const done = (w.challengesChecked || []).filter(Boolean).length;
  const total = (w.challengesChecked || []).length;
  els.frames.textContent = String(frames.length);

  const metres = trackDistance(w);
  els.track.innerHTML = metres >= 1000
    ? `${(metres / 1000).toFixed(1)}<small>km</small>`
    : `${Math.round(metres)}<small>m</small>`;

  const pct = total ? Math.round((done / total) * 100) : 0;
  els.progress.textContent = `Progress: ${pct}%`;
  els.pips.innerHTML = Array.from({ length: total }, (_, i) =>
    `<span class="mission-pip${i < done ? ' done' : ''}"></span>`).join('');
  els.synced.textContent = `${frames.length} capture${frames.length === 1 ? '' : 's'}`;
  els.logLabel.textContent = `Log Frame #${frames.length + 1}`;
  const last = frames[frames.length - 1];
  els.logLast.textContent = last
    ? `Last: #${frames.length} at ${new Date(last.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : 'No frames yet';
}

function renderChallenges(theme) {
  const w = state.activeWalk;
  if (!theme || !theme.challenges.length) { els.challenges.innerHTML = ''; return; }
  // Same markup and class as the Walks tab, so walks.js's delegated change
  // handler keeps both copies of the checklist in step.
  els.challenges.innerHTML = theme.challenges.map((c, i) => `
    <li>
      <label class="challenge-item">
        <input type="checkbox" data-idx="${i}" class="challenge-check"${w.challengesChecked[i] ? ' checked' : ''}>
        <span>${escapeHtml(c)}</span>
      </label>
    </li>`).join('');
}

function renderCaptureStrip() {
  const frames = (state.activeWalk && state.activeWalk.frames) || [];
  // Newest three, matching the design's three-chip preview row.
  const recent = frames.slice(-3);
  els.strip.innerHTML = recent.map((f) => `
    <button type="button" class="capture-chip" data-frame-id="${f.id}">
      <img data-frame-img="${f.imageId}" alt="">
      <span class="capture-chip-meta">
        <strong>#${f.index} ${escapeHtml(f.label || '')}</strong>
        <span>${escapeHtml(f.exposure || 'no EXIF')}</span>
      </span>
    </button>`).join('');

  els.strip.querySelectorAll('[data-frame-img]').forEach((img) => {
    imageUrl(img.dataset.frameImg).then((url) => { if (url) img.src = url; });
  });
}

function syncLiveDot() {
  if (els.liveDot) els.liveDot.classList.toggle('hidden', !state.activeWalk);
}

/* ---------- Frame log ---------- */

/** Condenses EXIF into the one line a capture chip has room for. */
function exposureLine(exif) {
  if (!exif) return '';
  const bits = [];
  if (exif.aperture) bits.push(exif.aperture.replace('f/', 'ƒ/'));
  if (exif.shutter) bits.push(exif.shutter);
  if (exif.iso) bits.push(exif.iso);
  return bits.join(' · ');
}

async function onFramePicked(e) {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const w = state.activeWalk;
  if (!w) return;

  try {
    const exif = await readExif(file);
    const bitmap = await createImageBitmap(file);
    // Field frames are a log, not the library: a 640px thumbnail is plenty and
    // keeps a long walk from eating the storage quota.
    const canvas = drawToCanvas(bitmap, 640);
    const blob = await canvasToBlob(canvas, 'image/jpeg', 0.8);
    const imageId = uid();
    await putImage(imageId, blob);

    w.frames = w.frames || [];
    const frame = {
      id: uid(),
      imageId,
      index: w.frames.length + 1,
      at: Date.now(),
      label: '',
      exposure: exposureLine(exif),
      exif: exif || null,
      fix: fixIsFresh() ? cachedFix() : null
    };
    w.frames.push(frame);
    save();
    logFrame(localDateKey(new Date(frame.at)));

    renderCaptureStrip();
    tickHud();
    showToast(`Frame #${frame.index} logged${frame.exposure ? ' · ' + frame.exposure : ''}.`);
    window.dispatchEvent(new CustomEvent('photowalk:stats-changed'));
  } catch (err) {
    console.warn('PhotoWalk: could not log that frame.', err);
    showToast('Could not read that photo — try another file.');
  }
}

function openFrameSheet(frameId) {
  const w = state.activeWalk;
  const frame = w && (w.frames || []).find((f) => f.id === frameId);
  if (!frame) return;

  const rows = frame.exif
    ? Object.entries({
        Camera: [frame.exif.make, frame.exif.model].filter(Boolean).join(' '),
        Focal: frame.exif.focalLength,
        Aperture: frame.exif.aperture,
        Shutter: frame.exif.shutter,
        ISO: frame.exif.iso
      }).filter(([, v]) => v).map(([k, v]) => `<dt>${k}</dt><dd>${escapeHtml(String(v))}</dd>`).join('')
    : '';

  openModal(`
    <h3>Frame #${frame.index}</h3>
    <img id="frameSheetImg" class="detail-image" alt="">
    <div class="field-row">
      <label for="frameLabelInput">Label</label>
      <input type="text" id="frameLabelInput" class="text-input" maxlength="24"
        value="${escapeHtml(frame.label || '')}" placeholder="Rim, Portal, Vector…">
    </div>
    ${rows ? `<dl class="exif-list">${rows}</dl>` : '<p class="muted">No EXIF in this file.</p>'}
    <div class="theme-actions">
      <button type="button" id="frameSaveBtn" class="btn btn-accent btn-block">Save label</button>
      <button type="button" id="frameDeleteBtn" class="btn btn-danger">Remove frame</button>
    </div>
  `);

  imageUrl(frame.imageId).then((url) => {
    const img = document.getElementById('frameSheetImg');
    if (img && url) img.src = url;
  });

  document.getElementById('frameSaveBtn').addEventListener('click', () => {
    frame.label = document.getElementById('frameLabelInput').value.trim();
    save();
    closeModal();
    renderCaptureStrip();
  });
  document.getElementById('frameDeleteBtn').addEventListener('click', () => {
    w.frames = w.frames.filter((f) => f.id !== frame.id);
    w.frames.forEach((f, i) => { f.index = i + 1; });
    save();
    closeModal();
    renderCaptureStrip();
    tickHud();
  });
}

/* ---------- Field notes and pins ---------- */

function openFieldNote() {
  const w = state.activeWalk;
  if (!w) return;
  openModal(`
    <h3>Field note</h3>
    <p class="muted">Anything you want to remember when you review the walk — what you were metering
      for, a street to come back to, a light that only works at this hour.</p>
    <textarea id="fieldNoteInput" class="text-input" rows="4" maxlength="500"
      placeholder="Metered for the rim light, ignored the pavement…"></textarea>
    <div class="theme-actions">
      <button type="button" id="fieldNoteSaveBtn" class="btn btn-accent btn-block">Save note</button>
    </div>
  `);
  document.getElementById('fieldNoteSaveBtn').addEventListener('click', () => {
    const text = document.getElementById('fieldNoteInput').value.trim();
    if (!text) { closeModal(); return; }
    w.notes = w.notes || [];
    w.notes.push({ id: uid(), at: Date.now(), text });
    save();
    closeModal();
    showToast('Note saved to this walk.');
  });
}

async function pinLocation() {
  const w = state.activeWalk;
  if (!w) return;
  const fix = cachedFix();
  if (!fixIsFresh(fix)) {
    showToast('Start GPS tracking first so there is a position to pin.');
    return;
  }
  w.pins = w.pins || [];
  w.pins.push({ id: uid(), at: Date.now(), lat: fix.lat, lon: fix.lon });
  save();
  renderMap();
  showToast(`Pinned ${w.pins.length} waypoint${w.pins.length === 1 ? '' : 's'} on this walk.`);
}

/* ---------- Tracking and the map ---------- */

function trackDistance(w) {
  const pts = (w && w.track) || [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += distanceMeters(pts[i - 1], pts[i]);
  return total;
}

function toggleTracking() {
  const w = state.activeWalk;
  if (!w) return;

  if (isWatching()) {
    stopWatching();
    els.trackToggle.textContent = 'Start GPS tracking';
    els.mapPlace.textContent = 'Tracking paused';
    return;
  }

  els.trackToggle.textContent = 'Requesting position…';
  // watchPosition retries on its own and the first few callbacks often fail
  // while the receiver settles; only say so once, and never once it's working.
  let warned = false;
  watchPosition(
    (fix) => {
      warned = true;
      w.track = w.track || [];
      const last = w.track[w.track.length - 1];
      // Drop jitter: consumer GPS wanders several metres while standing still.
      if (!last || distanceMeters(last, fix) > 8) {
        w.track.push({ lat: fix.lat, lon: fix.lon, at: fix.at });
        save();
      }
      els.trackToggle.textContent = 'Stop GPS tracking';
      els.mapPlace.textContent = `±${Math.round(fix.accuracy)} m`;
      renderMap();
      tickHud();
    },
    (err) => {
      if (warned) return;
      warned = true;
      els.trackToggle.textContent = 'Start GPS tracking';
      els.mapPlace.textContent = 'Tracking off';
      showToast(err.message);
    }
  );
}

function renderMap() {
  const w = state.activeWalk;
  if (!w || !els.mapCanvas) return;
  const track = w.track || [];
  const pins = w.pins || [];
  drawTrack(els.mapCanvas, track, pins);

  const metres = trackDistance(w);
  els.distBadge.textContent = metres >= 1000
    ? `${(metres / 1000).toFixed(2)} km tracked`
    : `${Math.round(metres)} m tracked`;

  const fix = track[track.length - 1] || (fixIsFresh() ? cachedFix() : null);
  if (!fix) {
    els.sunBadge.textContent = 'no fix';
    els.shadowBadge.textContent = 'Shadow index —';
    return;
  }
  const pos = sunPosition(new Date(), fix.lat, fix.lon);
  els.sunBadge.textContent =
    `${Math.round(pos.azimuth)}° ${compassPoint(pos.azimuth)} · ${Math.round(pos.altitude)}° EL`;
  const idx = shadowIndex(pos.altitude);
  els.shadowBadge.textContent = idx === null
    ? 'No cast shadow'
    : `Shadow index ${idx.toFixed(1)}`;
}

/* ---------- Pause ---------- */

function togglePause() {
  const w = state.activeWalk;
  if (!w || !w.startedAt) return;
  if (w.pausedAt) {
    if (hooks.resume) hooks.resume();
  } else if (hooks.pause) {
    hooks.pause();
  }
  renderHud();
}
