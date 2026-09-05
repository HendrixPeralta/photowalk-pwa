import { navigateTo } from './util.js';
import { showToast } from './toast.js';

// The side menu fronts the screens that have no tab of their own (Settings).
// The user card at the foot is where Google sign-in will land.

let root = null;

export function initProfile() {
  root = document.getElementById('drawerRoot');

  document.getElementById('profileBtn').addEventListener('click', openDrawer);

  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-close-drawer]')) { closeDrawer(); return; }
    const item = e.target.closest('.drawer-item');
    if (item) {
      navigateTo(item.dataset.nav);
      closeDrawer();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !root.classList.contains('hidden')) closeDrawer();
  });

  document.getElementById('drawerUserBtn').addEventListener('click', () => {
    showToast('Google sign-in is coming soon — PhotoWalk works fully without an account.', 4000);
  });
}

function openDrawer() {
  const current = document.querySelector('.view:not(.hidden)');
  const view = current ? current.dataset.view : 'home';
  root.querySelectorAll('.drawer-item').forEach((item) => {
    item.classList.toggle('active', item.dataset.nav === view);
  });
  root.classList.remove('hidden');
}

function closeDrawer() {
  root.classList.add('hidden');
}
