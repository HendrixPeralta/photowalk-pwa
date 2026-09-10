import { state, initStorage, totalActivityHours, currentStreak } from './store.js';
import { takeSharedFiles } from './db.js';
import { formatHours } from './util.js';
import { initModal } from './modal.js';
import { initToast, showToast } from './toast.js';
import {
  initWalks, renderHomeWalkState, pauseWalk, resumeWalk, activeTheme, finishActiveWalk
} from './walks.js';
import { initWalkScreen, renderWalkScreen } from './walkscreen.js';
import { initHud, renderHud, pauseHudRendering } from './hud.js';
import { initDebrief } from './debrief.js';
import { initAnalysis, loadDefaultPhoto } from './analysis.js';
import { initAlbum, renderAlbum } from './album.js';
import { initShare, renderShare, joinRoom, attachSharedFiles } from './share.js';
import { initHeatmap, renderHeatmap } from './heatmap.js';
import { initRewards, renderRewards } from './rewards.js';
import { initReminders, syncReminderSchedule, maybeNudgeOnOpen } from './reminders.js';
import { initProfile } from './profile.js';
import { initDemoPanel } from './demopanel.js';
import { initReview } from './review.js';
import { backfillMilestones } from './milestones.js';

// The header shows which instrument you are looking at, under the wordmark.
const SCREEN_TITLES = {
  walks: 'Walks',
  hud: 'Field HUD',
  analyze: 'Analysis',
  album: 'Album',
  share: 'Partners',
  settings: 'Settings'
};

function showView(name) {
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('hidden', v.dataset.view !== name));
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  document.getElementById('screenTitle').textContent = SCREEN_TITLES[name] || 'PhotoWalk';

  // The HUD runs a one-second clock; don't leave it ticking behind other tabs.
  if (name !== 'hud') pauseHudRendering();

  if (name === 'walks') renderWalks();
  if (name === 'hud') renderHud();
  if (name === 'album') renderAlbum();
  if (name === 'share') renderShare();
  // Deliberately on first view rather than at boot: the default frame costs a
  // fetch and four scope passes, and most sessions never open this tab.
  if (name === 'analyze') loadDefaultPhoto();

  document.querySelector('.views').scrollTo({ top: 0 });
}

function renderWalks() {
  // currentStreak(), not profile.streak: the stored number is only rewritten
  // when a walk finishes, so it keeps reading high after the streak has lapsed.
  document.getElementById('streakBadgeText').textContent = String(currentStreak());
  document.getElementById('statHours').textContent = formatHours(totalActivityHours());
  document.getElementById('statWalks').textContent = String(state.profile.walksCompleted);

  // The launcher or the running walk (clock + HUD + Stop), never both.
  renderHomeWalkState();

  renderWalkScreen();
  renderHeatmap();
  renderRewards();
}

function initNav() {
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => showView(btn.dataset.view));
  });
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

/**
 * Screenshot fixture: `?demo` seeds a year of believable practice, `?demo=clear`
 * hands the real profile back, and any other value is used as the generator
 * seed for a different-looking year. Distinct from the three months of starting
 * history below: the fixture is temporary and reversible, that is permanent.
 *
 * Demo mode is sticky — the flag rides along in saved state, so the module also
 * loads on a plain refresh and tops the data up if it has gone missing or no
 * longer reaches today. Without the flag and without the param, nothing loads.
 */
async function maybeSeedDemoData() {
  const value = new URLSearchParams(window.location.search).get('demo');
  if (value === null && !state.demoMode) return false;
  try {
    const demo = await import('./demo.js');
    demo.installDemoHooks();
    // Leaving demo mode is a wipe or a restore, and either way the starting
    // history must keep its hands off it — hence the "handled" answer.
    if (value === 'clear') { demo.clearDemoData(); return true; }
    demo.ensureDemoData(Number(value) > 1 ? { seed: Number(value) } : {});
  } catch (err) {
    console.warn('PhotoWalk: could not load demo data.', err);
  }
  return true;
}

/**
 * A profile with nothing in it makes every screen on the app look broken: an
 * empty heatmap, a dead streak, reward bars with nowhere to point. So a new
 * profile is given three months of practice to stand on, once, and from then on
 * it is ordinary history that real walks add to.
 *
 * `?history=seed` rewrites it (handy after clearing storage) and `?history=undo`
 * hands back the profile as it was before the seed landed. Both still work
 * while demo mode is on; the automatic seed does not, because the fixture owns
 * the stats then.
 */
async function maybeSeedStartingHistory({ skipAuto = false } = {}) {
  const value = new URLSearchParams(window.location.search).get('history');
  if (skipAuto && value === null) return;
  try {
    const backstory = await import('./backstory.js');
    backstory.installHistoryHooks();
    if (value === 'undo') { backstory.undoStarterHistory(); return; }
    if (value === 'seed') { backstory.seedStarterHistory(); return; }
    backstory.maybeSeedStarterHistory();
  } catch (err) {
    console.warn('PhotoWalk: could not seed the starting history.', err);
  }
}

/**
 * The bundled starter reference library. Lands once per profile, so that the
 * Album tab and its six filters have something to work on before the user has
 * saved anything of their own.
 *
 * `?photos=seed` writes it again (handy after clearing storage) and
 * `?photos=clear` takes it back out, pixels included.
 */
async function maybeSeedStarterAlbum() {
  const value = new URLSearchParams(window.location.search).get('photos');
  try {
    const seeder = await import('./seedphotos.js');
    seeder.installPhotoHooks();
    if (value === 'clear') { await seeder.clearBundledPhotos(); return; }
    if (value === 'seed') { await seeder.seedBundledPhotos(); return; }
    await seeder.maybeSeedBundledPhotos();
  } catch (err) {
    console.warn('PhotoWalk: could not seed the starter album.', err);
  }
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

  // Before any view renders, so the seeded stats are what Home paints.
  const demoHandledStats = await maybeSeedDemoData();
  await maybeSeedStartingHistory({ skipAuto: demoHandledStats });

  // Before initWalks: the launch button's mode and GPS chrome is rendered from
  // inside applyMode(), which runs during initWalks().
  initWalkScreen();
  initWalks();
  initHud({
    pause: pauseWalk,
    resume: resumeWalk,
    finish: finishActiveWalk,
    themeOf: activeTheme
  });
  initDebrief();
  initAnalysis();
  initAlbum();
  initShare();
  initHeatmap();
  initRewards();
  initReminders();
  initProfile();
  initDemoPanel();
  initReview();
  initNav();
  initInstallPrompt();
  initServiceWorker();

  window.addEventListener('photowalk:stats-changed', () => {
    renderWalks();
    renderAlbum();
  });
  window.addEventListener('photowalk:navigate', (e) => showView(e.detail.view));

  showView('walks');
  handleLaunchIntent();

  // Not awaited: nine fetches and nine decodes have no business holding up the
  // first paint, and the album re-renders itself off stats-changed when they land.
  maybeSeedStarterAlbum();

  // The scheduling window only reaches two weeks out, so top it up every launch.
  syncReminderSchedule();
  maybeNudgeOnOpen();
});
