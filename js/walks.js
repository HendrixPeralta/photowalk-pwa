import { state, save, addActivityHours } from './store.js';
import { CONCEPTS, THEMES, randomTheme } from './concepts.js';
import { openModal } from './modal.js';
import { showToast } from './toast.js';
import { escapeHtml } from './util.js';

const DURATIONS = [
  { value: 2, label: '2 min (quick demo)' },
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 45, label: '45 min' },
  { value: 60, label: '60 min' }
];

let els = {};
let mode = 'casual';
let theme = null;
let timerHandle = null;
let notifyGranted = false;
let casualStartedAt = null;

export function initWalks() {
  els = {
    modeCasual: document.getElementById('modeCasualBtn'),
    modeGuided: document.getElementById('modeGuidedBtn'),
    durationRow: document.getElementById('durationRow'),
    durationSelect: document.getElementById('durationSelect'),
    getThemeBtn: document.getElementById('getThemeBtn'),
    themeCard: document.getElementById('themeCard'),
    themeTitle: document.getElementById('themeTitle'),
    themeBrief: document.getElementById('themeBrief'),
    viewConceptsBtn: document.getElementById('viewConceptsBtn'),
    challengesSection: document.getElementById('challengesSection'),
    challengesList: document.getElementById('challengesList'),
    notifBtn: document.getElementById('notifBtn'),
    startWalkBtn: document.getElementById('startWalkBtn'),
    finishWalkBtn: document.getElementById('finishWalkBtn'),
    markCompleteBtn: document.getElementById('markCompleteBtn'),
    timerSection: document.getElementById('timerSection'),
    timerDisplay: document.getElementById('timerDisplay'),
    timerBar: document.getElementById('timerBar'),
    modeHint: document.getElementById('modeHint')
  };

  els.durationSelect.innerHTML = DURATIONS.map((d) => `<option value="${d.value}">${d.label}</option>`).join('');

  els.modeCasual.addEventListener('click', () => setMode('casual'));
  els.modeGuided.addEventListener('click', () => setMode('guided'));
  els.getThemeBtn.addEventListener('click', pickTheme);
  els.viewConceptsBtn.addEventListener('click', () => theme && openConceptModal(theme));
  els.startWalkBtn.addEventListener('click', startGuidedWalk);
  els.finishWalkBtn.addEventListener('click', () => finishWalk(false));
  els.markCompleteBtn.addEventListener('click', () => finishWalk(false));
  els.notifBtn.addEventListener('click', enableNotifications);

  if ('Notification' in window && Notification.permission === 'granted') {
    notifyGranted = true;
    els.notifBtn.classList.add('hidden');
  }

  setMode('casual');
  restoreActiveWalk();
}

function setMode(next) {
  if (state.activeWalk) return; // a guided walk is running; finish it first
  applyMode(next);
}

function applyMode(next) {
  mode = next;
  els.modeCasual.classList.toggle('active', mode === 'casual');
  els.modeGuided.classList.toggle('active', mode === 'guided');
  els.durationRow.classList.toggle('hidden', mode !== 'guided');
  els.challengesSection.classList.toggle('hidden', mode !== 'guided');
  els.startWalkBtn.classList.toggle('hidden', mode !== 'guided');
  els.markCompleteBtn.classList.toggle('hidden', mode !== 'casual');
  if (theme) renderThemeCard();
}

function pickTheme() {
  theme = randomTheme(theme && theme.id);
  els.getThemeBtn.textContent = 'New Theme';
  renderThemeCard();
}

function renderThemeCard() {
  els.themeCard.classList.remove('hidden');
  if (mode === 'casual' && !casualStartedAt) casualStartedAt = Date.now();
  els.themeTitle.textContent = theme.title;
  els.themeBrief.textContent = theme.brief;
  els.challengesList.innerHTML = theme.challenges.map((c, i) => `
    <li>
      <label class="challenge-item">
        <input type="checkbox" data-idx="${i}" class="challenge-check">
        <span>${escapeHtml(c)}</span>
      </label>
    </li>`).join('');
  els.challengesList.querySelectorAll('.challenge-check').forEach((box) => {
    box.addEventListener('change', (e) => toggleChallenge(Number(e.target.dataset.idx), e.target.checked));
  });
  syncChallengeChecks();
}

function syncChallengeChecks() {
  if (!state.activeWalk) return;
  els.challengesList.querySelectorAll('.challenge-check').forEach((box) => {
    box.checked = !!state.activeWalk.challengesChecked[Number(box.dataset.idx)];
  });
}

function toggleChallenge(idx, checked) {
  if (!state.activeWalk) return;
  state.activeWalk.challengesChecked[idx] = checked;
  save();
}

function openConceptModal(t) {
  const cards = t.concepts.map((key) => {
    const c = CONCEPTS[key];
    if (!c) return '';
    return `<div class="concept-card">
      <div class="concept-art">${c.svg}</div>
      <h4>${escapeHtml(c.title)}</h4>
      <p>${escapeHtml(c.tip)}</p>
    </div>`;
  }).join('');
  openModal(`
    <h3>${escapeHtml(t.title)}</h3>
    <p class="muted">What to look for before you shoot:</p>
    <div class="concept-grid">${cards}</div>
  `);
}

function enableNotifications() {
  if (!('Notification' in window)) {
    showToast('Notifications are not supported in this browser — in-app alerts will still work.');
    return;
  }
  Notification.requestPermission().then((perm) => {
    notifyGranted = perm === 'granted';
    if (notifyGranted) els.notifBtn.classList.add('hidden');
    showToast(notifyGranted ? 'Notifications enabled for this walk.' : 'Notifications stayed off — in-app alerts will still work.');
  });
}

function startGuidedWalk() {
  if (!theme) return;
  const durationMin = Number(els.durationSelect.value);
  state.activeWalk = {
    mode: 'guided',
    themeId: theme.id,
    startedAt: Date.now(),
    durationMin,
    notifiedMarks: [],
    challengesChecked: new Array(theme.challenges.length).fill(false)
  };
  save();
  els.startWalkBtn.classList.add('hidden');
  els.finishWalkBtn.classList.remove('hidden');
  els.getThemeBtn.disabled = true;
  els.durationSelect.disabled = true;
  els.timerSection.classList.remove('hidden');
  lockModeControls();
  runTimer();
}

function restoreActiveWalk() {
  if (!state.activeWalk) return;
  const t = THEMES.find((x) => x.id === state.activeWalk.themeId);
  if (!t) { state.activeWalk = null; save(); return; }
  theme = t;
  applyMode('guided');
  els.getThemeBtn.textContent = 'New Theme';
  els.getThemeBtn.disabled = true;
  els.durationSelect.disabled = true;
  els.durationSelect.value = String(state.activeWalk.durationMin);
  renderThemeCard();
  els.startWalkBtn.classList.add('hidden');
  els.finishWalkBtn.classList.remove('hidden');
  els.timerSection.classList.remove('hidden');
  lockModeControls();
  runTimer();
}

function lockModeControls() {
  els.modeCasual.disabled = true;
  els.modeGuided.disabled = true;
  els.modeHint.classList.remove('hidden');
}

function unlockModeControls() {
  els.modeCasual.disabled = false;
  els.modeGuided.disabled = false;
  els.modeHint.classList.add('hidden');
}

function runTimer() {
  clearInterval(timerHandle);
  tick();
  timerHandle = setInterval(tick, 1000);
}

function tick() {
  const w = state.activeWalk;
  if (!w) { clearInterval(timerHandle); return; }
  const totalMs = w.durationMin * 60000;
  const elapsed = Date.now() - w.startedAt;
  const remaining = totalMs - elapsed;

  if (remaining <= 0) {
    finishWalk(true);
    return;
  }

  const mm = String(Math.floor(remaining / 60000)).padStart(2, '0');
  const ss = String(Math.floor((remaining % 60000) / 1000)).padStart(2, '0');
  els.timerDisplay.textContent = `${mm}:${ss}`;
  const pct = Math.max(0, Math.min(100, (elapsed / totalMs) * 100));
  els.timerBar.style.width = pct + '%';

  checkNudge(elapsed / totalMs, 0.5, "Halfway there — try: " + pickUncheckedChallenge());
  checkNudge(elapsed / totalMs, 0.85, 'Almost time to wrap up — one more frame before you go.');
}

function pickUncheckedChallenge() {
  if (!theme || !state.activeWalk) return 'a new angle on your theme';
  const idx = state.activeWalk.challengesChecked.findIndex((c) => !c);
  return idx === -1 ? 'revisit your favorite shot from a new angle' : theme.challenges[idx];
}

function checkNudge(fraction, threshold, message) {
  const w = state.activeWalk;
  if (!w || fraction < threshold || w.notifiedMarks.includes(threshold)) return;
  w.notifiedMarks.push(threshold);
  save();
  notify(message);
}

function notify(message) {
  showToast(message);
  if (notifyGranted) {
    try { new Notification('PhotoWalk', { body: message, icon: './icons/icon.svg' }); } catch (err) { /* ignore */ }
  }
}

function finishWalk(auto) {
  clearInterval(timerHandle);
  const elapsedHours = computeElapsedHours();
  state.activeWalk = null;
  casualStartedAt = null;
  save();
  updateStreakAndStats();
  addActivityHours(elapsedHours);
  save();

  els.getThemeBtn.disabled = false;
  els.durationSelect.disabled = false;
  els.startWalkBtn.classList.remove('hidden');
  els.finishWalkBtn.classList.add('hidden');
  els.timerSection.classList.add('hidden');
  els.themeCard.classList.add('hidden');
  els.getThemeBtn.textContent = 'Get a Theme';
  theme = null;
  unlockModeControls();

  showToast(auto ? "Time's up — nice work! Head to Share to post your shots." : 'Walk marked complete! Head to Share to post your shots.');
  window.dispatchEvent(new CustomEvent('photowalk:stats-changed'));
}

function computeElapsedHours() {
  if (state.activeWalk) {
    const cappedMs = Math.min(Date.now() - state.activeWalk.startedAt, state.activeWalk.durationMin * 60000);
    return cappedMs / 3600000;
  }
  if (casualStartedAt) {
    return (Date.now() - casualStartedAt) / 3600000;
  }
  return 0;
}

function updateStreakAndStats() {
  const profile = state.profile;
  const todayKey = new Date().toDateString();
  if (profile.lastWalkDate !== todayKey) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    profile.streak = profile.lastWalkDate === yesterday.toDateString() ? profile.streak + 1 : 1;
    profile.lastWalkDate = todayKey;
  }
  profile.walksCompleted += 1;
  save();
}

export function focusQuickStart(targetMode) {
  setMode(targetMode);
  if (!theme) pickTheme();
}
