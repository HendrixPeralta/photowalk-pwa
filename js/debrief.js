/**
 * Partner debrief — the post-walk half of the sharing room.
 *
 * The room itself (create, join, upload, QR invite) still lives in share.js.
 * This module adds what the debrief is actually for: putting two partners'
 * frames side by side with their EXIF aligned, and holding the technical
 * conversation about them.
 *
 * Session figures are measured from the room, never asserted: "duration" is the
 * span between the first and last shot shared, "exposures" is how many were
 * shared, "partners" is who shared them.
 */

import { state, broadcast } from './store.js';
import { imageUrl } from './db.js';
import { showToast } from './toast.js';
import { escapeHtml, formatTime, navigateTo } from './util.js';
import { THEMES } from './concepts.js';
import { exportStudySheet } from './sheet.js';

// The vocabulary of a technical critique: process, not praise.
const CRITIQUE_TAGS = [
  '#RuleOfThirds', '#LeadingLines', '#LowAngle', '#RimLight',
  '#AvailableLight', '#Backlit', '#NegativeSpace', '#Geometry'
];

let els = {};
let splitMode = 'dual';
let selectedTags = new Set();

export function initDebrief() {
  els = {
    archive: document.getElementById('debriefArchive'),
    duration: document.getElementById('debriefDuration'),
    exposures: document.getElementById('debriefExposures'),
    partners: document.getElementById('debriefPartners'),
    promptCard: document.getElementById('debriefPromptCard'),
    promptTitle: document.getElementById('debriefPromptTitle'),
    promptText: document.getElementById('debriefPromptText'),
    modeDual: document.getElementById('splitModeDual'),
    modeWipe: document.getElementById('splitModeWipe'),
    splitEmpty: document.getElementById('splitEmpty'),
    splitDual: document.getElementById('splitDual'),
    wipeBlock: document.getElementById('splitWipeBlock'),
    wipeFrame: document.getElementById('wipeFrame'),
    wipeTop: document.getElementById('wipeTopImg'),
    wipeBottom: document.getElementById('wipeBottomImg'),
    wipeHandle: document.getElementById('wipeHandle'),
    wipeLeft: document.getElementById('wipeLeftLabel'),
    wipeRight: document.getElementById('wipeRightLabel'),
    tags: document.getElementById('critiqueTags'),
    list: document.getElementById('critiqueList'),
    empty: document.getElementById('critiqueEmpty'),
    input: document.getElementById('critiqueInput'),
    send: document.getElementById('critiqueSendBtn'),
    momentum: document.getElementById('momentumText'),
    momentumBadge: document.getElementById('momentumBadge'),
    exportBtn: document.getElementById('exportStudySheetBtn'),
    scheduleBtn: document.getElementById('scheduleNextWalkBtn')
  };

  els.modeDual.addEventListener('click', () => setSplitMode('dual'));
  els.modeWipe.addEventListener('click', () => setSplitMode('wipe'));
  els.send.addEventListener('click', postNote);
  els.input.addEventListener('keydown', (e) => { if (e.key === 'Enter') postNote(); });
  els.exportBtn.addEventListener('click', exportSheet);
  els.scheduleBtn.addEventListener('click', () => {
    navigateTo('settings');
    showToast('Set a reminder here and your next walk is on the calendar.');
  });

  els.tags.innerHTML = CRITIQUE_TAGS
    .map((t) => `<button type="button" class="critique-tag" data-tag="${t}">${t}</button>`).join('');
  els.tags.addEventListener('click', (e) => {
    const btn = e.target.closest('.critique-tag');
    if (!btn) return;
    const tag = btn.dataset.tag;
    if (selectedTags.has(tag)) selectedTags.delete(tag); else selectedTags.add(tag);
    btn.classList.toggle('active', selectedTags.has(tag));
  });

  initWipeDrag();
}

function currentRoom() {
  return state.currentRoom ? state.rooms[state.currentRoom] : null;
}

export function renderDebrief() {
  const room = currentRoom();
  if (!els.duration || !room) return;

  const photos = room.photos || [];
  els.archive.textContent = `Debrief Vault · Archive #${room.code}`;
  els.exposures.textContent = photos.length
    ? `${photos.length} shutter trip${photos.length === 1 ? '' : 's'}`
    : 'none yet';

  if (photos.length >= 2) {
    const span = photos[photos.length - 1].ts - photos[0].ts;
    els.duration.textContent = formatSpan(span);
    els.duration.title = 'Span between the first and last shot shared here';
  } else {
    els.duration.textContent = '—';
    els.duration.title = '';
  }

  const names = [...new Set(photos.map((p) => p.name).filter(Boolean))];
  els.partners.textContent = names.length ? names.map((n) => '@' + n).join(' & ') : '—';

  renderPrompt(room);
  renderSplit(room);
  renderNotes(room);
  renderMomentum(room);
}

function formatSpan(ms) {
  const mins = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(mins / 60);
  return h ? `${h}h ${mins % 60}m` : `${mins}m`;
}

/* ---------- Challenge prompt ---------- */

function renderPrompt(room) {
  // The theme the room was created under, or the theme of the walk that just
  // finished — whichever the room can actually vouch for.
  const themed = room.theme
    || (state.lastWalk && themeTitle(state.lastWalk.themeId))
    || '';
  if (!themed) { els.promptCard.hidden = true; return; }
  els.promptCard.hidden = false;
  els.promptTitle.textContent = themed;
  const walk = state.lastWalk;
  els.promptText.textContent = walk && walk.challengeCount
    ? `${walk.challengesDone} of ${walk.challengeCount} mini-challenges cleared on the walk this debrief follows.`
    : 'Compare what each of you did with the same brief.';
}

function themeTitle(themeId) {
  const found = THEMES.find((t) => t.id === themeId)
    || state.customThemes.find((t) => t.id === themeId);
  return found ? found.title : '';
}

/* ---------- Side-by-side ---------- */

function setSplitMode(mode) {
  splitMode = mode;
  els.modeDual.classList.toggle('active', mode === 'dual');
  els.modeWipe.classList.toggle('active', mode === 'wipe');
  const room = currentRoom();
  if (room) renderSplit(room);
}

/**
 * The two frames to compare: the newest shot from each of the two most recent
 * uploaders, falling back to the two most recent shots overall when only one
 * person has posted.
 */
function pickPair(photos) {
  const byName = new Map();
  for (let i = photos.length - 1; i >= 0; i--) {
    const p = photos[i];
    if (!byName.has(p.name)) byName.set(p.name, p);
    if (byName.size === 2) break;
  }
  if (byName.size === 2) return [...byName.values()].reverse();
  return photos.slice(-2);
}

function exposureOf(photo) {
  const e = photo.exif;
  if (!e) return 'no EXIF';
  return [e.focalLength, e.aperture && e.aperture.replace('f/', 'ƒ/')].filter(Boolean).join(' · ') || 'no EXIF';
}

function detailOf(photo) {
  const e = photo.exif;
  if (!e) return '';
  return [e.iso, e.shutter].filter(Boolean).join(' · ');
}

function renderSplit(room) {
  const photos = room.photos || [];
  const pair = pickPair(photos);
  const enough = pair.length === 2;

  els.splitEmpty.classList.toggle('hidden', enough);
  els.splitDual.classList.toggle('hidden', !enough || splitMode !== 'dual');
  els.wipeBlock.classList.toggle('hidden', !enough || splitMode !== 'wipe');
  if (!enough) { els.splitDual.innerHTML = ''; return; }

  if (splitMode === 'dual') {
    els.splitDual.innerHTML = pair.map((p) => `
      <div class="split-pane">
        <div class="split-pane-photo">
          <img data-pane-img="${escapeHtml(p.imageId)}" alt="Shared by ${escapeHtml(p.name)}">
          <span class="split-pane-who">@${escapeHtml(p.name)}</span>
        </div>
        <div class="split-pane-exif">
          <span class="split-pane-exif-row"><span>${escapeHtml(exposureOf(p))}</span><b>${escapeHtml(shutterOf(p))}</b></span>
          <span class="split-pane-exif-row"><span>${escapeHtml(detailOf(p) || formatTime(p.ts))}</span></span>
        </div>
      </div>`).join('');
    els.splitDual.querySelectorAll('[data-pane-img]').forEach((img) => {
      imageUrl(img.dataset.paneImg).then((url) => { if (url) img.src = url; });
    });
    return;
  }

  els.wipeLeft.textContent = `← @${pair[0].name}`;
  els.wipeRight.textContent = `@${pair[1].name} →`;
  imageUrl(pair[1].imageId).then((url) => { if (url) els.wipeBottom.src = url; });
  imageUrl(pair[0].imageId).then((url) => { if (url) els.wipeTop.src = url; });
  setWipe(0.5);
}

function shutterOf(photo) {
  return (photo.exif && photo.exif.shutter) || '—';
}

function setWipe(fraction) {
  const pct = Math.max(0, Math.min(1, fraction)) * 100;
  els.wipeTop.style.clipPath = `inset(0 ${100 - pct}% 0 0)`;
  els.wipeHandle.style.left = `${pct}%`;
}

function initWipeDrag() {
  let dragging = false;
  const move = (clientX) => {
    const rect = els.wipeFrame.getBoundingClientRect();
    setWipe((clientX - rect.left) / rect.width);
  };
  els.wipeFrame.addEventListener('pointerdown', (e) => {
    dragging = true;
    els.wipeFrame.setPointerCapture(e.pointerId);
    move(e.clientX);
  });
  els.wipeFrame.addEventListener('pointermove', (e) => { if (dragging) move(e.clientX); });
  const end = (e) => {
    dragging = false;
    try { els.wipeFrame.releasePointerCapture(e.pointerId); } catch (err) { /* already released */ }
  };
  els.wipeFrame.addEventListener('pointerup', end);
  els.wipeFrame.addEventListener('pointercancel', end);
}

/* ---------- Critique thread ---------- */

function renderNotes(room) {
  const notes = room.critique || [];
  els.empty.classList.toggle('hidden', notes.length > 0);
  els.list.innerHTML = notes.map((n) => {
    const mine = n.name === state.profile.displayName;
    return `
      <div class="critique-note${mine ? ' critique-note-mine' : ''}">
        <div class="critique-note-head">
          <span class="critique-note-who">${escapeHtml(n.name)} · note at ${escapeHtml(formatTime(n.ts))}</span>
          ${n.spec ? `<span class="critique-note-spec">${escapeHtml(n.spec)}</span>` : ''}
        </div>
        <p>${escapeHtml(n.text)}</p>
      </div>`;
  }).join('');
}

function postNote() {
  const room = currentRoom();
  if (!room) return;
  const text = els.input.value.trim();
  if (!text) return;

  room.critique = room.critique || [];
  room.critique.push({
    name: state.profile.displayName || 'Anonymous',
    text,
    // The chips the note was filed under double as its spec line.
    spec: [...selectedTags].join(' '),
    ts: Date.now()
  });
  els.input.value = '';
  selectedTags.clear();
  els.tags.querySelectorAll('.critique-tag').forEach((b) => b.classList.remove('active'));
  broadcast('critique-added', { code: room.code });
  renderNotes(room);
}

/* ---------- Momentum ---------- */

function renderMomentum(room) {
  const { streak, lastWalkDate } = state.profile;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const alive = lastWalkDate === new Date().toDateString() || lastWalkDate === yesterday.toDateString();
  const live = alive ? streak : 0;
  els.momentum.textContent = `${live}-Day Cadence Streak`;

  const notes = (room.critique || []).length;
  els.momentumBadge.innerHTML = notes ? `+${notes}<br>NOTES` : '+0<br>NOTES';
}

/* ---------- Export ---------- */

async function exportSheet() {
  const room = currentRoom();
  if (!room) return;
  const pair = pickPair(room.photos || []);
  if (pair.length < 2) { showToast('Share at least two shots before exporting a study sheet.'); return; }

  els.exportBtn.disabled = true;
  try {
    const panes = await Promise.all(pair.map(async (p) => ({
      who: '@' + p.name,
      exposure: exposureOf(p),
      detail: detailOf(p) || formatTime(p.ts),
      src: await imageUrl(p.imageId)
    })));

    await exportStudySheet({
      title: room.theme || `Room ${room.code}`,
      subtitle: `${(room.photos || []).length} shots shared · ${els.partners.textContent}`,
      panes,
      notes: (room.critique || []).map((n) => ({
        author: n.name,
        when: formatTime(n.ts),
        text: n.spec ? `${n.spec} — ${n.text}` : n.text
      }))
    });
  } finally {
    els.exportBtn.disabled = false;
  }
}
