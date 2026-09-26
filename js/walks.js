import { state, save, addActivityHours, recordWalk, themeWalkCounts, totalActivityHours, totalFramesLogged } from './store.js';
import { THEMES, suggestTheme, allChallenges } from './concepts.js';
import { openModal, closeModal } from './modal.js';
import { showToast } from './toast.js';
import { escapeHtml, navigateTo, formatHours, uid } from './util.js';
import { renderLaunchMeta } from './walkscreen.js';
import { activeRewardProgress, claimRewardUnlocks } from './rewards.js';
import { claimNewMilestones } from './milestones.js';
import { hydrateImages } from './db.js';
import { analyzeStoredImage } from './analysis.js';

const DURATIONS = [
  { value: 2, label: '2 min (quick demo)' },
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 45, label: '45 min' },
  { value: 60, label: '60 min' }
];

const DEFAULT_GUIDED_MIN = 30;

// A casual walk has no timer, so cap what a forgotten one can log to the heatmap.
const CASUAL_MAX_HOURS = 8;
// Past this, a casual walk was probably left open rather than actually walked.
// Hours buy rewards now, so confirm the number instead of banking it silently.
const CASUAL_CONFIRM_HOURS = 2;

let els = {};
let mode = 'casual';
let theme = null;
let themeReason = '';
let timerHandle = null;
let notifyGranted = false;
let triggersScheduled = false;

export function initWalks() {
  els = {
    modeCasual: document.getElementById('modeCasualBtn'),
    modeGuided: document.getElementById('modeGuidedBtn'),
    savedThemesList: document.getElementById('savedThemesList'),
    savedThemesEmpty: document.getElementById('savedThemesEmpty'),
    savedThemesCount: document.getElementById('savedThemesCount'),
    startWalkBtn: document.getElementById('startWalkBtn'),
    finishWalkBtn: document.getElementById('finishWalkBtn'),
    modeHint: document.getElementById('modeHint'),
    quickStart: document.getElementById('quickStart'),
    homePanel: document.getElementById('homeWalkPanel'),
    homeTheme: document.getElementById('homeWalkTheme'),
    homeMode: document.getElementById('homeWalkMode'),
    homeTimer: document.getElementById('homeWalkTimer'),
    homeTimerLabel: document.getElementById('homeWalkTimerLabel'),
    homeTrack: document.getElementById('homeWalkTrack'),
    homeBar: document.getElementById('homeWalkBar'),
    homeStopBtn: document.getElementById('homeStopWalkBtn'),
    homeBriefBtn: document.getElementById('homeWalkBriefBtn')
  };

  els.modeCasual.addEventListener('click', () => setMode('casual'));
  els.modeGuided.addEventListener('click', () => setMode('guided'));
  const modeInfoBtn = document.getElementById('modeInfoBtn');
  if (modeInfoBtn) modeInfoBtn.addEventListener('click', openModeInfoModal);
  els.savedThemesList.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const { action, id } = btn.dataset;
    if (action === 'use') useSavedTheme(id);
    if (action === 'edit') editSavedTheme(id);
    if (action === 'remove') removeSavedTheme(id);
  });
  els.startWalkBtn.addEventListener('click', launchWalk);
  els.finishWalkBtn.addEventListener('click', () => finishWalk(false));
  els.homeStopBtn.addEventListener('click', () => finishWalk(false));
  els.homeBriefBtn.addEventListener('click', () => theme && openWalkBrief());

  // Delegated so the checkboxes work the same whether they are on the Walks tab
  // or in the walk pop-up, which is rendered on demand.
  document.addEventListener('change', (e) => {
    const box = e.target.closest && e.target.closest('.challenge-check');
    if (!box) return;
    toggleChallenge(Number(box.dataset.idx), box.checked);
    syncChallengeChecks();
  });
  if ('Notification' in window && Notification.permission === 'granted') {
    notifyGranted = true;
  }

  // Background tabs get their timers throttled to about once a minute, so catch
  // up the moment the walk comes back on screen rather than waiting for a tick.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') tick();
  });
  window.addEventListener('pageshow', tick);

  setMode('casual');
  restoreActiveWalk();
  renderSavedThemes();
}

/** The guided length lives only in the walk brief now; this just persists the pick. */
function setGuidedDuration(minutes) {
  const valid = DURATIONS.some((d) => d.value === minutes);
  state.profile.guidedDurationMin = valid ? minutes : DEFAULT_GUIDED_MIN;
  save();
}

function guidedDurationMin() {
  const stored = Number(state.profile.guidedDurationMin);
  return DURATIONS.some((d) => d.value === stored) ? stored : DEFAULT_GUIDED_MIN;
}

function setMode(next) {
  if (state.activeWalk) return; // finish the walk you're on before switching
  applyMode(next);
}

const MODE_INFO = {
  casual: {
    title: 'Casual Walk',
    desc: 'A relaxed walk with a theme to shoot. No timer, so finish whenever you like.'
  },
  guided: {
    title: 'Guided Walk',
    desc: 'The same themes, plus mini-challenges, a timer, and tips along the way.'
  }
};

function openModeInfoModal() {
  openModal(`
    <h3>Walk Modes</h3>
    <p class="muted card-text">Pick how you want to walk: relaxed with no timer, or timed with challenges to keep you going.</p>
    <h4 class="subsection-title">${MODE_INFO.casual.title}</h4>
    <p class="card-text">${MODE_INFO.casual.desc}</p>
    <h4 class="subsection-title">${MODE_INFO.guided.title}</h4>
    <p class="card-text">${MODE_INFO.guided.desc}</p>
  `);
}

/**
 * The hero Start Photowalk button. Picking a theme (or rerolling/building one)
 * now happens inside the walk-brief popup this always opens, rather than on
 * the tab itself — so a fresh theme is picked here if none is on hand yet.
 */
export function launchWalk() {
  if (state.activeWalk) return;
  if (!theme) pickTheme();
  startWalk();
}

/**
 * Button labels live in a [data-label] span now, because the launcher and the
 * HUD buttons wrap their text in markup that textContent would wipe out.
 */
function setBtnLabel(btn, text) {
  const slot = btn.querySelector('[data-label]');
  if (slot) slot.textContent = text;
  else btn.textContent = text;
}

function applyMode(next) {
  mode = next;
  els.modeCasual.classList.toggle('active', mode === 'casual');
  els.modeGuided.classList.toggle('active', mode === 'guided');
  setBtnLabel(els.startWalkBtn, 'Start Photowalk');
  setBtnLabel(els.finishWalkBtn, 'Stop Walk');
  renderLaunchMeta(mode);
}

function pickTheme() {
  const picked = suggestTheme(theme && theme.id, themeWalkCounts());
  useTheme(picked.theme, picked.reason);
}

/**
 * Puts a theme (random pick, custom build, or a saved one) on hand for the
 * walk brief. If a walk is already open on its brief (not yet shooting), the
 * record is kept in sync too, so rerolling or editing mid-brief sticks.
 */
function useTheme(t, reason = '') {
  theme = t;
  themeReason = reason;
  if (state.activeWalk && !state.activeWalk.startedAt) {
    state.activeWalk.themeId = t.id;
    state.activeWalk.challengesChecked = new Array(challengesFor().length).fill(false);
    save();
  }
}

/**
 * Mini-challenges belong to the Guided Sprint. Casual mode is the theme on its
 * own — nothing to tick off, stop whenever you're done. Read the mode off the
 * running walk when there is one, so a restored walk can't disagree with the
 * mode it was started in.
 */
function challengesFor(t = theme) {
  const walkMode = state.activeWalk ? state.activeWalk.mode : mode;
  return t && walkMode === 'guided' ? t.challenges : [];
}

function challengeListHtml(list) {
  return list.map((c, i) => `
    <li>
      <label class="challenge-item">
        <input type="checkbox" data-idx="${i}" class="challenge-check">
        <span>${escapeHtml(c)}</span>
      </label>
    </li>`).join('');
}

/** Keeps every rendered copy of the checklist (tab + pop-up) on the same state. */
function syncChallengeChecks() {
  if (!state.activeWalk) return;
  document.querySelectorAll('.challenge-check').forEach((box) => {
    box.checked = !!state.activeWalk.challengesChecked[Number(box.dataset.idx)];
  });
}

function toggleChallenge(idx, checked) {
  if (!state.activeWalk) return;
  state.activeWalk.challengesChecked[idx] = checked;
  save();
}

/* ---------- Custom themes ---------- */

/**
 * Lets a user assemble their own theme from the existing mini-challenge pool
 * (plus any of their own wording) instead of only ever getting a random pick.
 * Saved themes persist in state.customThemes and show up under "My Themes".
 *
 * Also doubles as the editor for an existing theme: pass the theme in and its
 * title/brief/challenges prefill the form. Editing an already-custom theme
 * updates it in place; editing a built-in theme always saves the result as a
 * new custom theme instead, since the built-in list is shared and can't be
 * rewritten per user.
 */
function openThemeEditorModal(existingTheme = null, { onSaved } = {}) {
  // Once shooting has actually started the theme is locked in; before that
  // (still on the brief, or no walk open at all) it's fair game.
  if (state.activeWalk && state.activeWalk.startedAt) {
    showToast('Finish your current walk before editing a theme.');
    return;
  }

  const editingCustomId = existingTheme && state.customThemes.some((t) => t.id === existingTheme.id)
    ? existingTheme.id
    : null;
  const isBuiltIn = Boolean(existingTheme) && !editingCustomId;
  const poolChallenges = allChallenges();
  const initialChallenges = existingTheme ? existingTheme.challenges : [];
  const initialChecked = new Set(initialChallenges.filter((c) => poolChallenges.includes(c)));
  const initialExtras = initialChallenges.filter((c) => !poolChallenges.includes(c));

  const pickHtml = poolChallenges.map((c) => `
    <li>
      <label class="challenge-item">
        <input type="checkbox" class="custom-challenge-check" value="${escapeHtml(c)}" ${initialChecked.has(c) ? 'checked' : ''}>
        <span>${escapeHtml(c)}</span>
      </label>
    </li>`).join('');

  openModal(`
    <h3>${existingTheme ? 'Edit Theme' : 'Build a Custom Theme'}</h3>
    ${isBuiltIn ? '<p class="muted">This saves as a new custom theme — the original stays as it was.</p>' : ''}
    <input type="text" id="customThemeTitle" class="text-input" placeholder="Title (e.g. Rainy Day Reflections)" maxlength="60" value="${existingTheme ? escapeHtml(existingTheme.title) : ''}">
    <input type="text" id="customThemeBrief" class="text-input" placeholder="Brief: what are you hunting for? (optional)" maxlength="140" value="${existingTheme ? escapeHtml(existingTheme.brief) : ''}">
    <h4 class="subsection-title">Pick from existing challenges</h4>
    <p class="muted card-text">Optional — challenges only show up on a Guided Sprint. A casual walk runs on the theme alone.</p>
    <ul class="challenges-list">${pickHtml}</ul>
    <h4 class="subsection-title">Add your own</h4>
    <div class="reward-form">
      <input type="text" id="customChallengeInput" class="text-input" placeholder="Write a mini-challenge">
      <button type="button" id="addCustomChallengeBtn" class="btn btn-ghost">Add</button>
    </div>
    <ul id="customChallengeExtras" class="challenges-list"></ul>
    <div class="theme-actions">
      <button type="button" id="saveCustomThemeBtn" class="btn btn-accent btn-block">${existingTheme ? 'Save Changes' : 'Save Theme'}</button>
    </div>
  `);

  const extras = initialExtras.slice();
  const extrasList = document.getElementById('customChallengeExtras');
  const renderExtras = () => {
    extrasList.innerHTML = extras.map((c, i) => `
      <li class="reward-row">
        <span class="reward-title">${escapeHtml(c)}</span>
        <button type="button" class="btn btn-ghost btn-sm" data-extra-idx="${i}">Remove</button>
      </li>`).join('');
  };
  renderExtras();

  document.getElementById('addCustomChallengeBtn').addEventListener('click', () => {
    const input = document.getElementById('customChallengeInput');
    const val = input.value.trim();
    if (!val) return;
    extras.push(val);
    input.value = '';
    renderExtras();
  });

  extrasList.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-extra-idx]');
    if (!btn) return;
    extras.splice(Number(btn.dataset.extraIdx), 1);
    renderExtras();
  });

  document.getElementById('saveCustomThemeBtn').addEventListener('click', () => {
    const title = document.getElementById('customThemeTitle').value.trim();
    const brief = document.getElementById('customThemeBrief').value.trim();
    const checked = Array.from(document.querySelectorAll('.custom-challenge-check:checked')).map((el) => el.value);
    const challenges = [...checked, ...extras];

    if (!title) { showToast('Give your theme a title.'); return; }

    let saved;
    if (editingCustomId) {
      saved = state.customThemes.find((t) => t.id === editingCustomId);
      saved.title = title;
      saved.brief = brief || 'A theme you built yourself.';
      saved.challenges = challenges;
    } else {
      saved = {
        id: uid(),
        title,
        brief: brief || 'A theme you built yourself.',
        // A built-in theme's concepts carry over so its edited copy keeps
        // "View Concept Examples" instead of losing it just because it's custom now.
        concepts: existingTheme ? existingTheme.concepts.slice() : [],
        challenges
      };
      state.customThemes.push(saved);
    }

    save();
    renderSavedThemes();
    closeModal();
    useTheme(saved, 'Your own custom theme.');
    if (onSaved) onSaved(saved); else navigateTo('walks');
    showToast(editingCustomId ? 'Theme updated.' : 'Custom theme saved.');
  });
}

export function renderSavedThemes() {
  if (!els.savedThemesList) return;
  const list = state.customThemes;
  els.savedThemesEmpty.classList.toggle('hidden', list.length > 0);
  els.savedThemesList.innerHTML = list.map((t) => `
    <li class="reward-item">
      <div class="reward-row">
        <span class="reward-title">${escapeHtml(t.title)}</span>
        <span class="reward-actions">
          <button type="button" class="btn btn-ghost btn-sm" data-action="use" data-id="${t.id}">Use</button>
          <button type="button" class="btn btn-ghost btn-sm" data-action="edit" data-id="${t.id}">Edit</button>
          <button type="button" class="btn btn-ghost btn-sm" data-action="remove" data-id="${t.id}">Remove</button>
        </span>
      </div>
    </li>`).join('');
  els.savedThemesCount.textContent = list.length ? `${list.length} saved` : 'None yet';
}

function editSavedTheme(id) {
  const t = state.customThemes.find((x) => x.id === id);
  if (!t) return;
  openThemeEditorModal(t);
}

function useSavedTheme(id) {
  if (state.activeWalk) { showToast('Finish your current walk before switching themes.'); return; }
  const t = state.customThemes.find((x) => x.id === id);
  if (!t) return;
  useTheme(t, 'Your own custom theme.');
  navigateTo('walks');
}

function removeSavedTheme(id) {
  state.customThemes = state.customThemes.filter((t) => t.id !== id);
  save();
  renderSavedThemes();
}

/**
 * The walk brief: what you are shooting and what to try. Pops up on start —
 * before shooting begins this is also where the theme itself gets settled
 * (Change Theme, or a quick edit right next to its name) — and stays reachable
 * from the Home panel for the rest of the walk, read-only once shooting has
 * actually started. Its checkboxes are live.
 */
function openWalkBrief() {
  const w = state.activeWalk;
  const preShooting = Boolean(w && !w.startedAt);
  const modeLine = w && w.mode === 'guided'
    ? `Guided walk &middot; ${w.durationMin}-minute timer`
    : "Casual walk &middot; no timer, stop whenever you're done";

  const briefChallenges = challengesFor();
  const challenges = briefChallenges.length
    ? `<h4 class="subsection-title">Mini-challenges</h4>
       <ul class="challenges-list">${challengeListHtml(briefChallenges)}</ul>`
    : '';

  // Length is only decided before the clock starts — changing it mid-walk
  // would disagree with nudges and hours already banked against the old plan.
  const durationField = preShooting && w.mode === 'guided' ? `
    <div class="field-row" style="margin-top:8px">
      <label for="briefDurationSelect">Walk length</label>
      <select id="briefDurationSelect"></select>
    </div>` : '';

  // Settling the theme — editing it in place or swapping it out entirely —
  // only makes sense before the clock has actually started; once shooting
  // begins this reopens as a read-only recap.
  const editBtn = preShooting
    ? `<button type="button" id="briefEditBtn" class="btn btn-ghost btn-sm">Edit</button>`
    : '';
  const changeThemeBtn = preShooting
    ? `<button type="button" id="briefChangeThemeBtn" class="btn btn-ghost btn-block" style="margin-top:10px">Change Theme</button>`
    : '';

  openModal(`
    <div class="walk-brief-head">
      <h3>${escapeHtml(theme.title)}</h3>
      ${editBtn}
    </div>
    <p class="muted">${escapeHtml(theme.brief)}</p>
    ${themeReason ? `<p class="theme-reason">${escapeHtml(themeReason)}</p>` : ''}
    <p class="walk-brief-mode">${modeLine}</p>
    ${durationField}
    ${challenges}
    ${changeThemeBtn}
    <div class="theme-actions">
      <button type="button" id="briefGoBtn" class="btn btn-accent btn-block">Start shooting</button>
    </div>
  `);

  syncChallengeChecks();

  const briefDurationSelect = document.getElementById('briefDurationSelect');
  if (briefDurationSelect) {
    briefDurationSelect.innerHTML = DURATIONS.map((d) => `<option value="${d.value}">${d.label}</option>`).join('');
    briefDurationSelect.value = String(w.durationMin);
    briefDurationSelect.addEventListener('change', () => {
      w.durationMin = Number(briefDurationSelect.value);
      setGuidedDuration(w.durationMin);
      openWalkBrief();
    });
  }

  if (preShooting) {
    document.getElementById('briefEditBtn').addEventListener('click', () => {
      openThemeEditorModal(theme, { onSaved: () => openWalkBrief() });
    });
    document.getElementById('briefChangeThemeBtn').addEventListener('click', openThemePickerModal);
  }

  document.getElementById('briefGoBtn').addEventListener('click', () => {
    if (state.activeWalk && !state.activeWalk.startedAt) beginShooting();
    closeModal();
  });
}

/**
 * Change Theme: every built-in theme plus any of the user's own, and a
 * Randomize shortcut for when nothing in the list is calling out. Picking one
 * (or building a fresh custom one) drops straight back into the brief.
 */
function openThemePickerModal() {
  const pickRow = (t, source) => `
    <button type="button" class="quick-card theme-pick-item" data-id="${t.id}" data-source="${source}">
      <strong>${escapeHtml(t.title)}</strong>
      <span class="muted card-text">${escapeHtml(t.brief)}</span>
    </button>`;

  const customHtml = state.customThemes.length ? `
    <h4 class="subsection-title">My Themes</h4>
    <div class="theme-pick-list">${state.customThemes.map((t) => pickRow(t, 'custom')).join('')}</div>` : '';

  openModal(`
    <h3>Change Theme</h3>
    <button type="button" id="randomizeThemeBtn" class="btn btn-accent btn-block">Randomize</button>
    <button type="button" id="buildThemeBtn" class="btn btn-ghost btn-block" style="margin-top:8px">Build a Custom Theme</button>
    ${customHtml}
    <h4 class="subsection-title">All Themes</h4>
    <div class="theme-pick-list">${THEMES.map((t) => pickRow(t, 'builtin')).join('')}</div>
  `);

  document.getElementById('randomizeThemeBtn').addEventListener('click', () => {
    pickTheme();
    openWalkBrief();
  });
  document.getElementById('buildThemeBtn').addEventListener('click', () => {
    openThemeEditorModal(null, { onSaved: () => openWalkBrief() });
  });
  document.querySelectorAll('.theme-pick-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const { id, source } = btn.dataset;
      const t = source === 'custom'
        ? state.customThemes.find((x) => x.id === id)
        : THEMES.find((x) => x.id === id);
      if (!t) return;
      useTheme(t, source === 'custom' ? 'Your own custom theme.' : '');
      openWalkBrief();
    });
  });
}

function nudgeMessage(id) {
  if (id === 'half') return 'Halfway there! Try: ' + pickUncheckedChallenge();
  if (id === 'wrap') return 'Almost time to wrap up. Grab one more shot before you go.';
  return "Time's up, nice work! Now share your best shots with your walk partners.";
}

/** Trigger-scheduled copies are written before the walk starts, so they can't
 *  know which challenges are still open. */
function staticNudgeMessage(id, t) {
  if (id === 'half') return 'Halfway there! Try: ' + (t.challenges[0] || 'a new angle on your theme');
  return nudgeMessage(id);
}

function pickUncheckedChallenge() {
  if (!theme || !state.activeWalk) return 'a new angle on your theme';
  const idx = state.activeWalk.challengesChecked.findIndex((c) => !c);
  return idx === -1 ? 'revisit your favorite shot from a new angle' : theme.challenges[idx];
}

function nudgePlan(startedAt, durationMin) {
  const totalMs = durationMin * 60000;
  return [
    { id: 'half', at: startedAt + Math.round(totalMs * 0.5), fired: false },
    { id: 'wrap', at: startedAt + Math.round(totalMs * 0.85), fired: false },
    { id: 'end', at: startedAt + totalMs, fired: false }
  ];
}

const triggersSupported = () =>
  'Notification' in window && 'showTrigger' in Notification.prototype && 'serviceWorker' in navigator;

/**
 * When the browser supports Notification Triggers the service worker delivers
 * nudges even if PhotoWalk is closed — which is the whole point during a walk.
 * Everywhere else we fall back to firing them the next time the app is looked at.
 */
async function scheduleTriggeredNudges() {
  triggersScheduled = false;
  const w = state.activeWalk;
  if (!w || !notifyGranted || !triggersSupported()) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    await Promise.all(w.nudges.map((n) => reg.showNotification('PhotoEYE', {
      body: staticNudgeMessage(n.id, theme),
      tag: 'walk-' + n.id,
      icon: './icons/icon.svg',
      badge: './icons/icon.svg',
      showTrigger: new TimestampTrigger(n.at)
    })));
    triggersScheduled = true;
  } catch (err) {
    triggersScheduled = false;
  }
}

async function cancelScheduledNudges() {
  triggersScheduled = false;
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const notes = await reg.getNotifications({ includeTriggered: true });
    notes.filter((n) => n.tag && n.tag.startsWith('walk-')).forEach((n) => n.close());
  } catch (err) { /* nothing scheduled, or the browser won't say */ }
}

async function deliverNudge(message, id) {
  if (document.visibilityState === 'visible') showToast(message);
  if (!notifyGranted || triggersScheduled) return; // the SW already owns delivery
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.ready : null;
    if (reg && reg.showNotification) {
      // Constructing a Notification directly throws on Android Chrome; the
      // service worker registration is the only route that works there.
      await reg.showNotification('PhotoEYE', { body: message, tag: 'walk-' + id, icon: './icons/icon.svg' });
      return;
    }
  } catch (err) { /* fall through to the page-level API */ }
  try {
    new Notification('PhotoEYE', { body: message, icon: './icons/icon.svg' });
  } catch (err) { /* the in-app toast already covered it */ }
}

function fireDueNudges() {
  const w = state.activeWalk;
  if (!w || !w.nudges) return;
  const now = Date.now();
  let changed = false;
  for (const n of w.nudges) {
    if (n.fired || n.at > now) continue;
    // With no way to reach the user right now, hold the nudge back so it lands
    // when they next open the app instead of being silently spent.
    if (document.visibilityState !== 'visible' && !notifyGranted) continue;
    n.fired = true;
    changed = true;
    deliverNudge(nudgeMessage(n.id), n.id);
  }
  if (changed) save();
}

/* ---------- Walk lifecycle ---------- */

/** Opens a walk on its brief — nothing is logged and the clock hasn't started
 *  until "Start shooting" is tapped there. */
function startWalk() {
  if (!theme || state.activeWalk) return;
  const guided = mode === 'guided';

  state.activeWalk = {
    mode,
    themeId: theme.id,
    startedAt: null,
    durationMin: guided ? guidedDurationMin() : null,
    challengesChecked: new Array(challengesFor().length).fill(false),
    nudges: [],
    pausedAt: null,
    frames: []  // logged in the Field HUD
  };
  save();

  applyActiveWalkUi();
  openWalkBrief();
  window.dispatchEvent(new CustomEvent('photowalk:walk-changed'));
  window.dispatchEvent(new CustomEvent('photowalk:stats-changed'));
}

/** Starts the clock once "Start shooting" is tapped in the walk brief. */
function beginShooting() {
  const w = state.activeWalk;
  w.startedAt = Date.now();
  if (w.mode === 'guided') {
    w.nudges = nudgePlan(w.startedAt, w.durationMin);
    scheduleTriggeredNudges();
  }
  save();
  runTimer();
  navigateTo('hud');
}

function restoreActiveWalk() {
  const w = state.activeWalk;
  if (!w) return;
  const t = THEMES.find((x) => x.id === w.themeId) || state.customThemes.find((x) => x.id === w.themeId);
  if (!t) { state.activeWalk = null; save(); return; }

  theme = t;
  applyMode(w.mode);
  applyActiveWalkUi();
  if (w.startedAt && !w.pausedAt) runTimer();
  else if (!w.startedAt) openWalkBrief();
}

function applyActiveWalkUi() {
  els.startWalkBtn.classList.add('hidden');
  els.finishWalkBtn.classList.remove('hidden');
  els.modeCasual.disabled = true;
  els.modeGuided.disabled = true;
  els.modeHint.classList.remove('hidden');
  renderHomeWalkState();
}

function resetThemeUi() {
  setBtnLabel(els.startWalkBtn, 'Start Photowalk');
  // The launcher stays put. It needed a theme back when it only started a
  // themed walk; it quick-starts one now, so hiding it on the way back to idle
  // left the screen with no way to start a walk until the next reload.
  els.startWalkBtn.classList.remove('hidden');
  els.finishWalkBtn.classList.add('hidden');
  els.modeCasual.disabled = false;
  els.modeGuided.disabled = false;
  els.modeHint.classList.add('hidden');
  renderHomeWalkState();
}

function runTimer() {
  clearInterval(timerHandle);
  tick();
  timerHandle = setInterval(tick, 1000);
}

/** mm:ss, or h:mm:ss once a walk passes the hour — casual walks often do. */
function clockText(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const mm = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function tick() {
  const w = state.activeWalk;
  if (!w) { clearInterval(timerHandle); timerHandle = null; return; }
  if (!w.startedAt) return; // still on the brief, clock hasn't started
  if (w.pausedAt) return;   // frozen until the HUD resumes it

  const elapsed = Date.now() - w.startedAt;

  if (w.mode !== 'guided') {
    // Nothing to count down to, so the Home panel counts up instead.
    els.homeTimer.textContent = clockText(elapsed);
    return;
  }

  const totalMs = w.durationMin * 60000;
  if (elapsed >= totalMs) { finishWalk(true); return; }

  fireDueNudges();

  const remaining = totalMs - elapsed;
  const pct = Math.max(0, Math.min(100, (elapsed / totalMs) * 100)) + '%';
  els.homeTimer.textContent = clockText(remaining);
  els.homeBar.style.width = pct;
}

/**
 * Freezes the walk clock. Rather than track a separate "paused for" total,
 * resume slides startedAt (and every scheduled nudge) forward by the length of
 * the pause, so elapsed time, the countdown, the nudge plan and the hours
 * banked at the end all stay consistent with one number.
 */
export function pauseWalk() {
  const w = state.activeWalk;
  if (!w || !w.startedAt || w.pausedAt) return;
  w.pausedAt = Date.now();
  clearInterval(timerHandle);
  timerHandle = null;
  cancelScheduledNudges();
  save();
  showToast('Walk paused. The timer is stopped.');
  window.dispatchEvent(new CustomEvent('photowalk:walk-changed'));
}

export function resumeWalk() {
  const w = state.activeWalk;
  if (!w || !w.pausedAt) return;
  const delta = Date.now() - w.pausedAt;
  w.startedAt += delta;
  (w.nudges || []).forEach((n) => { n.at += delta; });
  w.pausedAt = null;
  save();
  if (w.mode === 'guided') scheduleTriggeredNudges();
  runTimer();
  showToast('Walk resumed.');
  window.dispatchEvent(new CustomEvent('photowalk:walk-changed'));
}

/** The theme the active walk is running, for the Field HUD's directive card. */
export function activeTheme() {
  return theme;
}

/** Lets the Field HUD's Complete button end the walk through the normal path. */
export function finishActiveWalk() {
  finishWalk(false);
}

/**
 * Home shows either the two start cards or the running walk — never both, so
 * there is always exactly one place to start and one place to stop.
 */
export function renderHomeWalkState() {
  const w = state.activeWalk;
  els.quickStart.classList.toggle('hidden', Boolean(w));
  els.homePanel.classList.toggle('hidden', !w);
  if (!w) return;

  const guided = w.mode === 'guided';
  els.homeTheme.textContent = theme ? theme.title : 'Walk in progress';
  els.homeMode.textContent = guided ? `Guided \u00b7 ${w.durationMin} min` : 'Casual';
  els.homeTimerLabel.textContent = guided ? 'left' : 'elapsed';
  els.homeTrack.classList.toggle('hidden', !guided);
  els.homeBriefBtn.textContent = guided ? 'Theme & challenges' : 'View theme';
  els.homeBriefBtn.classList.toggle('hidden', !theme);
  tick();
}

function computeElapsedHours(walk) {
  const capMs = walk.mode === 'guided'
    ? walk.durationMin * 60000
    : CASUAL_MAX_HOURS * 3600000;
  // Finishing from a paused HUD must bank the time up to the pause, not the
  // wall-clock time since, or a walk left paused overnight logs the night.
  const until = walk.pausedAt || Date.now();
  return Math.max(0, Math.min(until - walk.startedAt, capMs)) / 3600000;
}

function finishWalk(auto) {
  const w = state.activeWalk;
  if (!w) return;

  if (!w.startedAt) {
    // Stopped from the brief before shooting started — nothing was logged.
    state.activeWalk = null;
    save();
    theme = null;
    themeReason = '';
    resetThemeUi();
    applyMode(mode);
    return;
  }

  // A timed-out guided walk has already run its course — nothing to confirm.
  // A manual stop is the one action here with no undo, so gate it behind an
  // explicit confirmation rather than finalizing the instant it's tapped.
  if (auto) {
    finalizeWalk(w, auto);
    return;
  }
  confirmCompleteWalk(() => finalizeWalk(w, auto));
}

function finalizeWalk(w, auto) {
  const measured = computeElapsedHours(w);
  if (w.mode === 'casual' && measured > CASUAL_CONFIRM_HOURS) {
    confirmLoggedHours(measured, (hours) => completeWalk(w, hours, auto));
    return;
  }
  completeWalk(w, measured, auto);
}

/**
 * The one gate between tapping Complete/Stop and the walk actually ending —
 * without it there was no way to back out of a slip once the popup appeared.
 */
function confirmCompleteWalk(onConfirm) {
  let settled = false;

  openModal(`
    <h3>Complete this walk?</h3>
    <p class="muted">This ends the walk and saves your time. You can't undo this.</p>
    <div class="theme-actions">
      <button type="button" id="confirmCompleteBtn" class="btn btn-danger btn-block">Complete Walk</button>
      <button type="button" id="cancelCompleteBtn" class="btn btn-ghost btn-block">Keep Shooting</button>
    </div>
  `, {
    onClose: () => { if (!settled) showToast('Still on your walk.'); }
  });

  document.getElementById('confirmCompleteBtn').addEventListener('click', () => {
    settled = true;
    closeModal();
    onConfirm();
  });
  document.getElementById('cancelCompleteBtn').addEventListener('click', () => closeModal());
}

/**
 * Asks before banking a long casual walk. Dismissing leaves the walk running
 * rather than guessing — an unconfirmed number would spend into the reward
 * budget, and the walk is trivially finished again later.
 */
function confirmLoggedHours(measured, onConfirm) {
  let settled = false;

  openModal(`
    <h3>How long were you shooting?</h3>
    <p class="muted">This walk has been open for about ${formatHours(measured)}. Log the time you actually
      spent out — hours are what earn your rewards, so they're worth keeping honest.</p>
    <div class="field-row">
      <label for="loggedHoursInput">Hours to log</label>
      <input type="number" id="loggedHoursInput" class="text-input hours-input"
        min="0" max="${CASUAL_MAX_HOURS}" step="0.25" value="${(Math.round(measured * 4) / 4).toFixed(2)}">
    </div>
    <div class="theme-actions">
      <button type="button" id="confirmHoursBtn" class="btn btn-accent btn-block">Log it &amp; finish</button>
    </div>
  `, {
    onClose: () => {
      if (!settled) showToast("Still on your walk. Finish whenever you're ready.");
    }
  });

  document.getElementById('confirmHoursBtn').addEventListener('click', () => {
    const entered = Number(document.getElementById('loggedHoursInput').value);
    if (!Number.isFinite(entered) || entered < 0) { showToast('Enter how many hours to log.'); return; }
    settled = true;
    closeModal();
    onConfirm(Math.min(entered, CASUAL_MAX_HOURS));
  });
}

function completeWalk(w, hours, auto) {
  clearInterval(timerHandle);
  timerHandle = null;
  cancelScheduledNudges();

  const finishedTheme = theme;
  const walkFrames = w.frames || [];
  const challengesDone = (w.challengesChecked || []).filter(Boolean).length;
  const record = {
    id: uid(),
    themeId: w.themeId,
    mode: w.mode,
    durationMin: w.durationMin,
    hours,
    challengesDone,
    challengeCount: (w.challengesChecked || []).length,
    endedAt: Date.now(),
    tipDismissed: false
  };

  // lastWalk drives the Analysis tab's pinned tips; walkHistory is the long
  // record that theme suggestions and milestones read from.
  state.lastWalk = record;
  recordWalk(record);
  state.activeWalk = null;
  updateStreakAndStats();
  addActivityHours(hours);
  save();

  theme = null;
  themeReason = '';
  resetThemeUi();
  applyMode(mode);

  // Order matters: hours must be banked before either of these can see them.
  const unlockedRewards = claimRewardUnlocks();
  const milestones = claimNewMilestones(record);

  openWalkSummary(finishedTheme, record, hours, walkFrames, auto, unlockedRewards, milestones);
  window.dispatchEvent(new CustomEvent('photowalk:walk-changed'));
  window.dispatchEvent(new CustomEvent('photowalk:stats-changed'));
}

function openWalkSummary(t, record, hours, walkFrames, auto, unlockedRewards, milestones) {
  const totalHours = totalActivityHours();
  const totalFrames = totalFramesLogged();
  const challengeLine = t.challenges.length
    ? `<p>${record.challengesDone} of ${t.challenges.length} mini-challenges done</p>`
    : '';

  const unlockedHtml = unlockedRewards.map((r) => `
    <li class="summary-win summary-win-reward">
      <strong>Reward earned: ${escapeHtml(r.title)}</strong>
      <span class="muted">You put in the ${formatHours(r.targetHours)}. Claim it on the Walks tab.</span>
    </li>`).join('');

  const milestoneHtml = milestones.map((m) => `
    <li class="summary-win">
      <strong>${escapeHtml(m.title)}</strong>
      <span class="muted">${escapeHtml(m.detail)}</span>
    </li>`).join('');

  const winsHtml = unlockedHtml || milestoneHtml
    ? `<ul class="summary-wins">${unlockedHtml}${milestoneHtml}</ul>`
    : '';

  // Only the rewards still in progress: the ones just unlocked are called out above.
  const progressHtml = activeRewardProgress()
    .filter((r) => !r.done)
    .slice(0, 3)
    .map((r) => `
      <li class="summary-progress">
        <span class="reward-title">${escapeHtml(r.title)}</span>
        <span class="muted">${formatHours(r.remaining)} to go</span>
      </li>`).join('');

  const towardHtml = progressHtml
    ? `<h4 class="subsection-title">Still working toward</h4><ul class="summary-progress-list">${progressHtml}</ul>`
    : '';

  openModal(`
    <h3>${auto ? "Time's up, nice work!" : 'Walk complete!'}</h3>
    <div class="summary-stats-row">
      <div class="summary-stat">
        <span class="summary-stat-value">${formatHours(totalHours)}</span>
        <span class="summary-stat-delta">+${formatHours(hours)} this walk</span>
      </div>
      <div class="summary-stat">
        <span class="summary-stat-value">${totalFrames}</span>
        <span class="summary-stat-delta">+${walkFrames.length} this walk</span>
      </div>
    </div>

    <div class="summary-theme-recap">
      <span class="label-caps">Theme</span>
      <strong>${escapeHtml(t.title)}</strong>
      ${challengeLine}
    </div>

    ${winsHtml}
    ${towardHtml}

    <p class="muted card-text" style="margin-top:14px">Look over your shots while the walk is fresh. Pick your best three and see how well they fit the theme.</p>
    <div class="theme-btn-row" style="margin-top:10px">
      <button type="button" id="walkAnalyzeBtn" class="btn btn-accent">Analyze your best shots</button>
      <button type="button" id="walkShareBtn" class="btn btn-primary btn-icon-only" aria-label="Share your shots">
        <svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-share"/></svg>
      </button>
    </div>
    <div class="theme-actions">
      <button type="button" id="walkDoneBtn" class="btn btn-ghost btn-block">Done</button>
    </div>
  `);

  document.getElementById('walkAnalyzeBtn').addEventListener('click', () => openFramePickerModal(walkFrames));
  document.getElementById('walkShareBtn').addEventListener('click', () => {
    closeModal();
    navigateTo('share');
  });
  document.getElementById('walkDoneBtn').addEventListener('click', closeModal);
}

/** Lets the walk-complete popup's "Analyze" hand off to a specific frame
 *  instead of guessing — always shown, so the choice is always the user's. */
function openFramePickerModal(frames) {
  if (!frames.length) {
    openModal(`
      <h3>Pick a photo to analyze</h3>
      <p class="empty-state-sm">No frames logged on this walk.</p>
      <button type="button" id="frameFallbackBtn" class="btn btn-accent btn-block">Analyze a sample photo instead</button>
    `);
    document.getElementById('frameFallbackBtn').addEventListener('click', () => {
      closeModal();
      navigateTo('analyze');
    });
    return;
  }

  const thumbsHtml = frames.map((f) => `
    <button type="button" class="album-thumb" data-image-id="${f.imageId}" data-image="${f.imageId}">
      <span class="album-thumb-tag">#${f.index}</span>
    </button>`).join('');

  openModal(`
    <h3>Pick a photo to analyze</h3>
    <div class="album-grid" id="framePickGrid">${thumbsHtml}</div>
  `);

  const grid = document.getElementById('framePickGrid');
  hydrateImages(grid);
  grid.addEventListener('click', (e) => {
    const thumb = e.target.closest('.album-thumb');
    if (!thumb) return;
    const frame = frames.find((f) => f.imageId === thumb.dataset.imageId);
    if (!frame) return;
    closeModal();
    navigateTo('analyze');
    analyzeStoredImage(frame.imageId, { exif: frame.exif });
  });
}

function updateStreakAndStats() {
  const profile = state.profile;
  const todayKey = new Date().toDateString();
  if (profile.lastWalkDate !== todayKey) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    profile.streak = profile.lastWalkDate === yesterday.toDateString() ? profile.streak + 1 : 1;
    profile.lastWalkDate = todayKey;
    profile.longestStreak = Math.max(profile.longestStreak || 0, profile.streak);
  }
  profile.walksCompleted += 1;
  save();
}

