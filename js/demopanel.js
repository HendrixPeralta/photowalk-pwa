import { state, totalActivityHours, currentStreak } from './store.js';
import { showToast } from './toast.js';
import { formatHours } from './util.js';

/**
 * The Settings card that loads practice history on demand — the one-tap version
 * of the `?history=` and `?demo=` params, because typing a query string into a
 * phone browser while presenting is not a plan.
 *
 * Both generators live behind dynamic imports: this card only needs the state
 * to describe what is loaded, so nothing extra is fetched until a button is
 * actually pressed.
 */

let els = {};

export function initDemoPanel() {
  els = {
    status: document.getElementById('demoDataStatus'),
    threeMonths: document.getElementById('fillThreeMonthsBtn'),
    year: document.getElementById('fillYearBtn'),
    restore: document.getElementById('restoreProfileBtn')
  };
  if (!els.status) return;

  els.threeMonths.addEventListener('click', fillThreeMonths);
  els.year.addEventListener('click', fillYear);
  els.restore.addEventListener('click', restoreProfile);

  window.addEventListener('photowalk:stats-changed', renderDemoStatus);
  renderDemoStatus();
}

/** What the profile currently claims, so the card never lies about its own effect. */
export function renderDemoStatus() {
  if (!els.status) return;
  const activeDays = Object.keys(state.activityLog).length;
  const facts = `${activeDays} day${activeDays === 1 ? '' : 's'} logged · ${formatHours(totalActivityHours())}`
    + ` · ${state.profile.walksCompleted} walk${state.profile.walksCompleted === 1 ? '' : 's'}`
    + ` · ${currentStreak()}-day streak · ${state.rewards.length} reward${state.rewards.length === 1 ? '' : 's'}`;

  const source = state.demoMode ? 'A full year of demo history is loaded.'
    : state.seededHistory && !state.seededHistory.skipped ? 'Three months of starting history is loaded.'
    : 'This is your own history.';

  els.status.textContent = `${source} ${facts}.`;
}

async function fillThreeMonths() {
  try {
    const backstory = await import('./backstory.js');
    // The year fixture re-seeds itself on every load while its flag is set, so
    // it has to be stood down or it would overwrite this on the next refresh.
    if (state.demoMode) state.demoMode = null;
    backstory.seedStarterHistory();
    showToast('Three months of practice loaded.');
  } catch (err) {
    console.warn('PhotoWalk: could not load the three-month history.', err);
    showToast('Could not load the demo history — see the console.');
  }
}

async function fillYear() {
  try {
    const demo = await import('./demo.js');
    demo.installDemoHooks();
    demo.seedDemoData();
    showToast('A full year of practice loaded — it stays until you restore.');
  } catch (err) {
    console.warn('PhotoWalk: could not load the year of demo data.', err);
    showToast('Could not load the demo history — see the console.');
  }
}

/**
 * Hands back whatever was parked before history was loaded. Both restores
 * reload the page, because the live state object was built from the seeded blob.
 */
async function restoreProfile() {
  try {
    if (state.demoMode) {
      const demo = await import('./demo.js');
      demo.clearDemoData();
      renderDemoStatus(); // only reached when nothing was parked, so no reload happened
      showToast('Demo history cleared.');
      return;
    }
    const backstory = await import('./backstory.js');
    if (!backstory.undoStarterHistory()) {
      showToast('Nothing parked to restore — this profile is already your own.');
    }
  } catch (err) {
    console.warn('PhotoWalk: could not restore the profile.', err);
    showToast('Could not restore the profile — see the console.');
  }
}
