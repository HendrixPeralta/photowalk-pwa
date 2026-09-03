import { state, initStorage, totalActivityHours, currentStreak } from './store.js';
import { takeSharedFiles } from './db.js';
import { formatHours } from './util.js';
import { initModal } from './modal.js';
import { initToast, showToast } from './toast.js';
import { initWalks, quickStartWalk, renderHomeWalkState } from './walks.js';
import { initAnalysis } from './analysis.js';
import { initAlbum, renderAlbum } from './album.js';
import { initShare, renderShare, joinRoom, attachSharedFiles } from './share.js';
import { initHeatmap, renderHeatmap } from './heatmap.js';
import { initRewards, renderRewards } from './rewards.js';
import { initReminders, syncReminderSchedule, maybeNudgeOnOpen } from './reminders.js';
import { initProfile } from './profile.js';
import { backfillMilestones } from './milestones.js';

function showView(name) {
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('hidden', v.dataset.view !== name));
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  if (name === 'home') renderHome();
  if (name === 'walks') renderStatTiles();
  if (name === 'album') renderAlbum();
  if (name === 'share') renderShare();
}

// The stat tiles live on the Walks screen.
function renderStatTiles() {
  document.getElementById('statHours').textContent = formatHours(totalActivityHours());
  document.getElementById('statWalks').textContent = String(state.profile.walksCompleted);
}

function renderHome() {
  // currentStreak(), not profile.streak: the stored number is only rewritten
  // when a walk finishes, so it keeps reading high after the streak has lapsed.
  document.getElementById('streakBadgeText').textContent = String(currentStreak());

  // Start cards or the running walk (clock + Stop), never both.
  renderHomeWalkState();

  renderHeatmap();
  renderRewards();
}

function initNav() {
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => showView(btn.dataset.view));
  });
  document.getElementById('quickCasualBtn').addEventListener('click', () => quickStartWalk('casual'));
  document.getElementById('quickGuidedBtn').addEventListener('click', () => quickStartWalk('guided'));
}

/**
 * Handles the two ways PhotoWalk can be opened from outside: an invite link
 * (?room=CODE) and the OS share sheet, which parks its files in IndexedDB for
 * us via the service worker.
 */
async function handleLaunchIntent() {
  const params = new URLSearchParams(window.location.search);
  const roomParam = params.get('room');
  let shared = [];
  try {
    shared = await takeSharedFiles();
  } catch (err) { /* no inbox yet */ }

  if (shared.length) attachSharedFiles(shared);

  if (roomParam) {
    showView('share');
    joinRoom(roomParam, { quiet: true });
  } else if (shared.length) {
    showView('share');
    showToast('Pick a room, then press Upload to post the photos you shared.', 6000);
  }

  if (roomParam || params.has('shared')) {
    // Clear the query so a refresh doesn't replay the invite or the share.
    const url = new URL(window.location.href);
    url.search = '';
    window.history.replaceState({}, '', url.toString());
  }
}

function initInstallPrompt() {
  const installBtn = document.getElementById('installBtn');
  let deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installBtn.classList.remove('hidden');
  });

  installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    installBtn.classList.add('hidden');
  });

  window.addEventListener('appinstalled', () => {
    installBtn.classList.add('hidden');
    showToast('PhotoWalk installed to your device.');
  });
}

function initServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js').catch((err) => {
    console.warn('PhotoWalk: service worker registration failed.', err);
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  initModal(document.getElementById('modalRoot'));
  initToast(document.getElementById('toastRoot'));

  // Photos live in IndexedDB now; finish migrating them off localStorage before
  // any view tries to read one.
  await initStorage();

  // Anyone with stats from before milestones existed shouldn't be buried in
  // retroactive badges on their next walk.
  backfillMilestones();

  initWalks();
  initAnalysis();
  initAlbum();
  initShare();
  initHeatmap();
  initRewards();
  initReminders();
  initProfile();
  initNav();
  initInstallPrompt();
  initServiceWorker();

  window.addEventListener('photowalk:stats-changed', () => {
    renderHome();
    renderStatTiles();
    renderAlbum();
  });
  window.addEventListener('photowalk:navigate', (e) => showView(e.detail.view));

  showView('home');
  handleLaunchIntent();

  // The scheduling window only reaches two weeks out, so top it up every launch.
  syncReminderSchedule();
  maybeNudgeOnOpen();
});
