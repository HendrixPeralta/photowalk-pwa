import { t } from './i18n.js';
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
  const walks = state.profile.walksCompleted;
  const rewards = state.rewards.length;
  const facts = [
    t(activeDays === 1 ? '{n} day logged' : '{n} days logged', { n: activeDays }),
    formatHours(totalActivityHours()),
    t(walks === 1 ? '{n} walk' : '{n} walks', { n: walks }),
    t('{n}-day streak', { n: currentStreak() }),
    t(rewards === 1 ? '{n} reward' : '{n} rewards', { n: rewards })
  ].join(' · ');

  const source = state.demoMode ? t('A full year of demo history is loaded.')
    : state.seededHistory && !state.seededHistory.skipped ? t('Three months of starting history is loaded.')
    : t('This is your own history.');

  els.status.textContent = t('{source} {facts}.', { source, facts });
}

async function fillThreeMonths() {
  try {
    const backstory = await import('./backstory.js');
    // The year fixture re-seeds itself on every load while its flag is set, so
    // it has to be stood down or it would overwrite this on the next refresh.
    if (state.demoMode) state.demoMode = null;
    backstory.seedStarterHistory();
    showToast(t('Three months of practice loaded.'));
  } catch (err) {
    console.warn('PhotoWalk: could not load the three-month history.', err);
    showToast(t("Couldn't load the demo history. Please try again."));
  }
}

async function fillYear() {
  try {
    const demo = await import('./demo.js');
    demo.installDemoHooks();
    demo.seedDemoData();
    showToast(t('A full year of practice loaded. It stays until you tap Restore mine.'));
  } catch (err) {
    console.warn('PhotoWalk: could not load the year of demo data.', err);
    showToast(t("Couldn't load the demo history. Please try again."));
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
      showToast(t('Demo history cleared.'));
      return;
    }
    const backstory = await import('./backstory.js');
    if (!backstory.undoStarterHistory()) {
      showToast(t('Nothing to restore. This is already your own history.'));
    }
  } catch (err) {
    console.warn('PhotoWalk: could not restore the profile.', err);
    showToast(t("Couldn't restore your history. Please try again."));
  }
}
