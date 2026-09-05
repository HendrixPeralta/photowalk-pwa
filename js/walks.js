import { state, save, addActivityHours, recordWalk, themeWalkCounts } from './store.js';
import { CONCEPTS, CONCEPT_QUERIES, THEMES, suggestTheme, renderConceptCard } from './concepts.js';
import { fetchConceptPhotos, safeImageUrl } from './openverse.js';
import { openModal, closeModal } from './modal.js';
import { showToast } from './toast.js';
import { escapeHtml, navigateTo, formatHours, uid } from './util.js';
import { activeRewardProgress, claimRewardUnlocks } from './rewards.js';
import { claimNewMilestones } from './milestones.js';

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
    durationRow: document.getElementById('durationRow'),
    durationSelect: document.getElementById('durationSelect'),
    quickDurationSelect: document.getElementById('quickDurationSelect'),
    getThemeBtn: document.getElementById('getThemeBtn'),
    themeCard: document.getElementById('themeCard'),
    themeTitle: document.getElementById('themeTitle'),
    themeBrief: document.getElementById('themeBrief'),
    themeReason: document.getElementById('themeReason'),
    viewConceptsBtn: document.getElementById('viewConceptsBtn'),
    challengesSection: document.getElementById('challengesSection'),
    challengesList: document.getElementById('challengesList'),
    notifBtn: document.getElementById('notifBtn'),
    startWalkBtn: document.getElementById('startWalkBtn'),
    finishWalkBtn: document.getElementById('finishWalkBtn'),
    timerSection: document.getElementById('timerSection'),
    timerDisplay: document.getElementById('timerDisplay'),
    timerBar: document.getElementById('timerBar'),
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

  const durationOptions = DURATIONS.map((d) => `<option value="${d.value}">${d.label}</option>`).join('');
  els.durationSelect.innerHTML = durationOptions;
  els.quickDurationSelect.innerHTML = durationOptions;
  syncDurationSelects();
  [els.durationSelect, els.quickDurationSelect].forEach((sel) => {
    sel.addEventListener('change', () => setGuidedDuration(Number(sel.value)));
  });

  els.modeCasual.addEventListener('click', () => setMode('casual'));
  els.modeGuided.addEventListener('click', () => setMode('guided'));
  els.getThemeBtn.addEventListener('click', pickTheme);
  els.viewConceptsBtn.addEventListener('click', () => theme && openConceptModal(theme));
  els.startWalkBtn.addEventListener('click', () => startWalk());
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
  els.notifBtn.addEventListener('click', enableNotifications);

  if ('Notification' in window && Notification.permission === 'granted') {
    notifyGranted = true;
    els.notifBtn.classList.add('hidden');
  }

  // Background tabs get their timers throttled to about once a minute, so catch
  // up the moment the walk comes back on screen rather than waiting for a tick.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') tick();
  });
  window.addEventListener('pageshow', tick);

  setMode('casual');
  restoreActiveWalk();
}

/** The guided length is a preference: quick-start has no room to ask for it. */
function setGuidedDuration(minutes) {
  const valid = DURATIONS.some((d) => d.value === minutes);
  state.profile.guidedDurationMin = valid ? minutes : DEFAULT_GUIDED_MIN;
  save();
  syncDurationSelects();
}

function guidedDurationMin() {
  const stored = Number(state.profile.guidedDurationMin);
  return DURATIONS.some((d) => d.value === stored) ? stored : DEFAULT_GUIDED_MIN;
}

function syncDurationSelects() {
  const value = String(guidedDurationMin());
  els.durationSelect.value = value;
  els.quickDurationSelect.value = value;
}

function setMode(next) {
  if (state.activeWalk) return; // finish the walk you're on before switching
  applyMode(next);
}

function applyMode(next) {
  mode = next;
  els.modeCasual.classList.toggle('active', mode === 'casual');
  els.modeGuided.classList.toggle('active', mode === 'guided');
  els.durationRow.classList.toggle('hidden', mode !== 'guided');
  els.startWalkBtn.textContent = 'Start Walk';
  els.finishWalkBtn.textContent = 'Stop Walk';
  if (theme) renderThemeCard();
}

function pickTheme() {
  if (state.activeWalk) return;
  const picked = suggestTheme(theme && theme.id, themeWalkCounts());
  theme = picked.theme;
  themeReason = picked.reason;
  els.getThemeBtn.textContent = 'New Theme';
  // Hand the accent over to Start Walk: rerolling is the fallback now, not the
  // main action, and two accent buttons on screen read as two primary choices.
  els.getThemeBtn.classList.replace('btn-accent', 'btn-primary');
  renderThemeCard();
  els.startWalkBtn.classList.remove('hidden');
  els.finishWalkBtn.classList.add('hidden');
}

function renderThemeCard() {
  els.themeCard.classList.remove('hidden');
  els.challengesSection.classList.toggle('hidden', !theme.challenges.length);
  els.themeTitle.textContent = theme.title;
  els.themeBrief.textContent = theme.brief;
  els.themeReason.textContent = themeReason;
  els.themeReason.classList.toggle('hidden', !themeReason);
  els.challengesList.innerHTML = challengeListHtml(theme);
  syncChallengeChecks();
}

function challengeListHtml(t) {
  return t.challenges.map((c, i) => `
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

/**
 * The walk brief: what you are shooting and what to try. Pops up on start so a
 * one-tap walk still tells you your theme, and stays reachable from the Home
 * panel for the rest of the walk. Its checkboxes are live.
 */
function openWalkBrief() {
  const w = state.activeWalk;
  const modeLine = w && w.mode === 'guided'
    ? `Guided walk &middot; ${w.durationMin} min on the clock`
    : 'Casual walk &middot; no timer, stop it whenever you are done';

  const challenges = theme.challenges.length
    ? `<h4 class="subsection-title">Mini-challenges</h4>
       <ul class="challenges-list">${challengeListHtml(theme)}</ul>`
    : '';

  openModal(`
    <h3>${escapeHtml(theme.title)}</h3>
    <p class="muted">${escapeHtml(theme.brief)}</p>
    ${themeReason ? `<p class="theme-reason">${escapeHtml(themeReason)}</p>` : ''}
    <p class="walk-brief-mode">${modeLine}</p>
    ${challenges}
    <div class="theme-actions">
      <button type="button" id="briefGoBtn" class="btn btn-accent btn-block">Start shooting</button>
      <button type="button" id="briefConceptsBtn" class="btn btn-ghost btn-block">View concept examples</button>
      <button type="button" id="briefStopBtn" class="btn btn-ghost btn-block">Stop walk</button>
    </div>
  `);

  syncChallengeChecks();

  document.getElementById('briefGoBtn').addEventListener('click', () => {
    if (state.activeWalk && !state.activeWalk.startedAt) beginShooting();
    closeModal();
  });
  document.getElementById('briefConceptsBtn').addEventListener('click', () => openConceptModal(theme));
  document.getElementById('briefStopBtn').addEventListener('click', () => {
    closeModal();
    finishWalk(false);
  });
}

/* ---------- Concept explainer ---------- */

function openConceptModal(t) {
  const cards = t.concepts.map(renderConceptCard).join('');

  openModal(`
    <h3>${escapeHtml(t.title)}</h3>
    <p class="muted">What to look for before you shoot:</p>
    <div class="concept-grid">${cards}</div>
  `);

  loadConceptPhotos(t);
}

/**
 * Layers real public-domain examples on top of the built-in diagrams. Entirely
 * optional: offline, rate-limited, or blocked, the diagrams stand on their own.
 */
async function loadConceptPhotos(t) {
  if (navigator.onLine === false) return;

  for (const key of t.concepts) {
    const holder = document.querySelector(`.concept-photos[data-concept="${key}"]`);
    if (!holder) continue;

    const photos = await fetchConceptPhotos(key, CONCEPT_QUERIES[key] || CONCEPTS[key].title);
    if (!holder.isConnected || !photos.length) continue;

    const strip = photos.map((p) => {
      const thumb = safeImageUrl(p.thumbnail);
      const source = safeImageUrl(p.source);
      if (!thumb) return '';
      const label = `${p.title} — ${p.creator} (${p.license})`;
      const img = `<span class="concept-photo" style="background-image:url('${thumb}')"></span>`;
      return source
        ? `<a href="${escapeHtml(source)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(label)}">${img}</a>`
        : `<span title="${escapeHtml(label)}">${img}</span>`;
    }).join('');

    if (!strip) continue;
    holder.innerHTML = `<div class="concept-photo-strip">${strip}</div>`
      + '<p class="concept-credit">Public-domain examples via Openverse</p>';
  }
}

/* ---------- Notifications ---------- */

function enableNotifications() {
  if (!('Notification' in window)) {
    showToast('Notifications are not supported in this browser — in-app alerts will still work.');
    return;
  }
  Notification.requestPermission().then((perm) => {
    notifyGranted = perm === 'granted';
    if (notifyGranted) {
      els.notifBtn.classList.add('hidden');
      if (state.activeWalk && state.activeWalk.mode === 'guided') scheduleTriggeredNudges();
    }
    showToast(notifyGranted
      ? 'Notifications enabled for this walk.'
      : 'Notifications stayed off — in-app alerts will still work.');
  });
}

function nudgeMessage(id) {
  if (id === 'half') return 'Halfway there — try: ' + pickUncheckedChallenge();
  if (id === 'wrap') return 'Almost time to wrap up — one more frame before you go.';
  return "Time's up — nice work! Head to Share to post your shots.";
}

/** Trigger-scheduled copies are written before the walk starts, so they can't
 *  know which challenges are still open. */
function staticNudgeMessage(id, t) {
  if (id === 'half') return 'Halfway there — try: ' + (t.challenges[0] || 'a new angle on your theme');
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
    await Promise.all(w.nudges.map((n) => reg.showNotification('PhotoWalk', {
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
      await reg.showNotification('PhotoWalk', { body: message, tag: 'walk-' + id, icon: './icons/icon.svg' });
      return;
    }
  } catch (err) { /* fall through to the page-level API */ }
  try {
    new Notification('PhotoWalk', { body: message, icon: './icons/icon.svg' });
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

function startWalk({ brief = false } = {}) {
  if (!theme || state.activeWalk) return;
  const guided = mode === 'guided';

  state.activeWalk = {
    mode,
    themeId: theme.id,
    startedAt: brief ? null : Date.now(),
    durationMin: guided ? guidedDurationMin() : null,
    challengesChecked: new Array(theme.challenges.length).fill(false),
    nudges: []
  };
  save();

  applyActiveWalkUi();
  if (brief) openWalkBrief();
  else beginShooting();
  window.dispatchEvent(new CustomEvent('photowalk:stats-changed'));
}

/**
 * Starts the clock. Called right away for a manual Start Walk, or deferred
 * until "Start shooting" is tapped so a quick-start walk doesn't burn shooting
 * time while its brief is still up.
 */
function beginShooting() {
  const w = state.activeWalk;
  w.startedAt = Date.now();
  if (w.mode === 'guided') {
    w.nudges = nudgePlan(w.startedAt, w.durationMin);
    scheduleTriggeredNudges();
  }
  save();
  runTimer();
}

function restoreActiveWalk() {
  const w = state.activeWalk;
  if (!w) return;
  const t = THEMES.find((x) => x.id === w.themeId);
  if (!t) { state.activeWalk = null; save(); return; }

  theme = t;
  applyMode(w.mode);
  els.getThemeBtn.textContent = 'New Theme';
  if (w.mode === 'guided') els.durationSelect.value = String(w.durationMin);
  els.quickDurationSelect.disabled = true;
  renderThemeCard();
  applyActiveWalkUi();
  if (w.startedAt) runTimer();
  else openWalkBrief();
}

function applyActiveWalkUi() {
  els.getThemeBtn.disabled = true;
  els.durationSelect.disabled = true;
  els.quickDurationSelect.disabled = true;
  els.startWalkBtn.classList.add('hidden');
  els.finishWalkBtn.classList.remove('hidden');
  els.timerSection.classList.toggle('hidden', state.activeWalk.mode !== 'guided');
  els.modeCasual.disabled = true;
  els.modeGuided.disabled = true;
  els.modeHint.classList.remove('hidden');
  renderHomeWalkState();
}

function resetThemeUi() {
  els.getThemeBtn.disabled = false;
  els.getThemeBtn.textContent = 'Get a Theme';
  els.getThemeBtn.classList.replace('btn-primary', 'btn-accent');
  els.durationSelect.disabled = false;
  els.quickDurationSelect.disabled = false;
  syncDurationSelects();
  els.startWalkBtn.classList.add('hidden');
  els.finishWalkBtn.classList.add('hidden');
  els.timerSection.classList.add('hidden');
  els.themeCard.classList.add('hidden');
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
  els.timerDisplay.textContent = clockText(remaining);
  els.timerBar.style.width = pct;
  els.homeTimer.textContent = clockText(remaining);
  els.homeBar.style.width = pct;
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
  els.homeBriefBtn.classList.toggle('hidden', !theme);
  tick();
}

function computeElapsedHours(walk) {
  const capMs = walk.mode === 'guided'
    ? walk.durationMin * 60000
    : CASUAL_MAX_HOURS * 3600000;
  return Math.max(0, Math.min(Date.now() - walk.startedAt, capMs)) / 3600000;
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

  const measured = computeElapsedHours(w);
  if (w.mode === 'casual' && measured > CASUAL_CONFIRM_HOURS) {
    confirmLoggedHours(measured, (hours) => completeWalk(w, hours, auto));
    return;
  }
  completeWalk(w, measured, auto);
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
      if (!settled) showToast('Still on your walk — finish it whenever you are ready.');
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

  // lastWalk drives the Analyze tab's pinned tips; walkHistory is the long
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

  openWalkSummary(finishedTheme, record, hours, auto, unlockedRewards, milestones);
  window.dispatchEvent(new CustomEvent('photowalk:stats-changed'));
}

function openWalkSummary(t, record, hours, auto, unlockedRewards, milestones) {
  const challengeLine = t.challenges.length
    ? `<p class="muted">${record.challengesDone} of ${t.challenges.length} mini-challenges done</p>`
    : '';

  const unlockedHtml = unlockedRewards.map((r) => `
    <li class="summary-win summary-win-reward">
      <strong>Reward earned: ${escapeHtml(r.title)}</strong>
      <span class="muted">You put in the ${formatHours(r.targetHours)} — claim it on the Home tab.</span>
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
    <h3>${auto ? "Time's up — nice work!" : 'Walk complete!'}</h3>
    <p class="summary-hours">+${formatHours(hours)} logged</p>
    <p class="muted">${escapeHtml(t.title)}</p>
    ${challengeLine}
    ${winsHtml}
    ${towardHtml}
    <p>Study your shots while the walk is fresh — pick your best three and check them against the theme.</p>
    <div class="theme-actions">
      <button type="button" id="walkAnalyzeBtn" class="btn btn-accent btn-block">Analyze your best shots</button>
      <button type="button" id="walkShareBtn" class="btn btn-primary btn-block">Share your shots</button>
      <button type="button" id="walkDoneBtn" class="btn btn-ghost btn-block">Done</button>
    </div>
  `);

  document.getElementById('walkAnalyzeBtn').addEventListener('click', () => {
    closeModal();
    navigateTo('analyze');
  });
  document.getElementById('walkShareBtn').addEventListener('click', () => {
    closeModal();
    navigateTo('share');
  });
  document.getElementById('walkDoneBtn').addEventListener('click', closeModal);
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

/**
 * The Home tab's one-tap start: pick a theme, start the walk, and show the brief
 * pop-up. Home itself turns into the running-walk panel with the clock and Stop.
 */
export function quickStartWalk(targetMode) {
  if (state.activeWalk) {
    showToast('You are already on a walk — stop it first.');
    return;
  }
  applyMode(targetMode);
  pickTheme();
  startWalk({ brief: true });
}
