import { state } from './store.js';
import { THEMES } from './concepts.js';
import { initModal } from './modal.js';
import { initToast, showToast } from './toast.js';
import { initWalks, focusQuickStart } from './walks.js';
import { initAnalysis } from './analysis.js';
import { initAlbum, renderAlbum } from './album.js';
import { initShare, renderShare } from './share.js';
import { initHeatmap, renderHeatmap } from './heatmap.js';

function showView(name) {
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('hidden', v.dataset.view !== name));
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  if (name === 'home') renderHome();
  if (name === 'album') renderAlbum();
  if (name === 'share') renderShare();
}

function renderHome() {
  document.getElementById('streakBadgeText').textContent = String(state.profile.streak);
  document.getElementById('statWalks').textContent = String(state.profile.walksCompleted);
  document.getElementById('statPhotosAnalyzed').textContent = String(state.profile.photosAnalyzed);
  document.getElementById('statRefs').textContent = String(state.album.length);

  const banner = document.getElementById('activeWalkBanner');
  if (state.activeWalk) {
    const theme = THEMES.find((t) => t.id === state.activeWalk.themeId);
    document.getElementById('activeWalkText').textContent =
      `Guided walk in progress: ${theme ? theme.title : 'your theme'}`;
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
  }

  renderHeatmap();
}

function initNav() {
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => showView(btn.dataset.view));
  });
  document.getElementById('quickCasualBtn').addEventListener('click', () => {
    showView('walks');
    focusQuickStart('casual');
  });
  document.getElementById('quickGuidedBtn').addEventListener('click', () => {
    showView('walks');
    focusQuickStart('guided');
  });
  document.getElementById('resumeWalkBtn').addEventListener('click', () => showView('walks'));
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
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('PhotoWalk: service worker registration failed.', err);
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initModal(document.getElementById('modalRoot'));
  initToast(document.getElementById('toastRoot'));

  initWalks();
  initAnalysis();
  initAlbum();
  initShare();
  initHeatmap();
  initNav();
  initInstallPrompt();
  initServiceWorker();

  window.addEventListener('photowalk:stats-changed', () => {
    renderHome();
    renderAlbum();
  });

  showView('home');
});
