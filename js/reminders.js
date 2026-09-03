import { state, save, totalActivityHours } from './store.js';
import { showToast } from './toast.js';
import { escapeHtml, localDateKey } from './util.js';

// PhotoWalk only ever talked to people who had already opened it. A habit needs
// a cue that arrives on its own, so these are scheduled ahead of time through
// Notification Triggers where the browser supports them, and fall back to an
// in-app prompt on next open where it doesn't.

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SCHEDULE_AHEAD_DAYS = 14;
const TAG_PREFIX = 'remind-';

let els = {};

export function initReminders() {
  els = {
    toggle: document.getElementById('reminderToggle'),
    body: document.getElementById('reminderBody'),
    time: document.getElementById('reminderTime'),
    days: document.getElementById('reminderDays'),
    status: document.getElementById('reminderStatus')
  };

  els.days.innerHTML = DAY_LABELS.map((label, i) => `
    <button type="button" class="day-chip" data-day="${i}" aria-label="${DAY_NAMES[i]}"
      aria-pressed="false">${label}</button>`).join('');

  els.toggle.addEventListener('change', onToggle);
  els.time.addEventListener('change', () => {
    state.reminder.time = els.time.value || '18:00';
    save();
    refreshSchedule();
    renderReminders();
  });
  els.days.addEventListener('click', (e) => {
    const chip = e.target.closest('.day-chip');
    if (!chip) return;
    toggleDay(Number(chip.dataset.day));
  });

  renderReminders();
}

function onToggle() {
  if (!els.toggle.checked) {
    state.reminder.enabled = false;
    save();
    cancelSchedule();
    renderReminders();
    return;
  }

  state.reminder.enabled = true;
  save();
  renderReminders();
  requestPermissionThenSchedule();
}

function toggleDay(day) {
  const days = state.reminder.days;
  const idx = days.indexOf(day);
  if (idx === -1) days.push(day); else days.splice(idx, 1);
  days.sort();
  save();
  refreshSchedule();
  renderReminders();
}

function requestPermissionThenSchedule() {
  if (!('Notification' in window)) {
    showToast('This browser has no notifications — PhotoWalk will remind you in-app instead.', 5000);
    return;
  }
  if (Notification.permission === 'granted') { refreshSchedule(); return; }
  Notification.requestPermission().then((perm) => {
    if (perm === 'granted') refreshSchedule();
    else showToast('Reminders stayed off at the system level — PhotoWalk will still nudge you in-app.', 5000);
    renderReminders();
  });
}

/* ---------- Scheduling ---------- */

const triggersSupported = () =>
  'Notification' in window && 'showTrigger' in Notification.prototype && 'serviceWorker' in navigator;

/** The next reminder timestamps, soonest first, over the scheduling window. */
function upcomingTimes() {
  const { time, days } = state.reminder;
  if (!days.length) return [];
  const [hh, mm] = String(time || '18:00').split(':').map(Number);

  const times = [];
  const now = Date.now();
  for (let offset = 0; offset <= SCHEDULE_AHEAD_DAYS; offset++) {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    d.setHours(hh || 0, mm || 0, 0, 0);
    if (days.includes(d.getDay()) && d.getTime() > now) times.push(d.getTime());
  }
  return times;
}

/**
 * Written ahead of time, so like the mid-walk nudges these can't know what the
 * numbers will be when they fire — the copy stays deliberately general.
 */
function reminderBody() {
  const pending = state.rewards.find((r) => !r.claimedAt);
  if (pending) {
    const earned = Math.max(0, totalActivityHours() - pending.baselineHours);
    const left = Math.round((pending.targetHours - earned) * 10) / 10;
    if (left > 0) return `Time for a walk — ${left}h of shooting left to earn "${pending.title}".`;
  }
  return 'Time for a walk — grab a theme and go shoot for a bit.';
}

async function refreshSchedule() {
  await cancelSchedule();
  if (!state.reminder.enabled || !triggersSupported()) return;
  if (Notification.permission !== 'granted') return;

  try {
    const reg = await navigator.serviceWorker.ready;
    const body = reminderBody();
    await Promise.all(upcomingTimes().map((at) => reg.showNotification('PhotoWalk', {
      body,
      tag: TAG_PREFIX + at,
      icon: './icons/icon.svg',
      badge: './icons/icon.svg',
      showTrigger: new TimestampTrigger(at)
    })));
  } catch (err) { /* the in-app fallback still covers the user */ }
}

async function cancelSchedule() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const notes = await reg.getNotifications({ includeTriggered: true });
    notes.filter((n) => n.tag && n.tag.startsWith(TAG_PREFIX)).forEach((n) => n.close());
  } catch (err) { /* nothing scheduled, or the browser won't say */ }
}

/**
 * Reschedules on every launch: the window only reaches two weeks out, and the
 * reward copy baked into each notification goes stale as hours accumulate.
 */
export function syncReminderSchedule() {
  if (state.reminder.enabled) refreshSchedule();
}

/* ---------- In-app fallback ---------- */

/**
 * Where triggered notifications aren't available (or permission was declined),
 * catch the user the next time they open the app on a day they meant to walk.
 */
export function maybeNudgeOnOpen() {
  const { enabled, days, time } = state.reminder;
  if (!enabled || !days.includes(new Date().getDay())) return;
  if (state.activeWalk) return;
  if (state.activityLog[localDateKey()]) return; // already been out today

  const [hh, mm] = String(time || '18:00').split(':').map(Number);
  const due = new Date();
  due.setHours(hh || 0, mm || 0, 0, 0);
  if (Date.now() < due.getTime()) return;

  showToast("You planned a walk today — there's still time to get out.", 7000);
}

/* ---------- Render ---------- */

export function renderReminders() {
  if (!els.toggle) return;
  const { enabled, time, days } = state.reminder;

  els.toggle.checked = enabled;
  els.body.classList.toggle('hidden', !enabled);
  els.time.value = time;

  els.days.querySelectorAll('.day-chip').forEach((chip) => {
    const on = days.includes(Number(chip.dataset.day));
    chip.classList.toggle('active', on);
    chip.setAttribute('aria-pressed', String(on));
  });

  els.status.textContent = statusText();
}

function statusText() {
  if (!state.reminder.enabled) return '';
  if (!state.reminder.days.length) return 'Pick at least one day.';

  const names = state.reminder.days.map((d) => DAY_NAMES[d].slice(0, 3)).join(', ');
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return `${escapeHtml(names)} — PhotoWalk will remind you in-app when you next open it.`;
  }
  return triggersSupported()
    ? `${escapeHtml(names)} — you'll get a notification even with PhotoWalk closed.`
    : `${escapeHtml(names)} — this browser only delivers reminders while PhotoWalk is open.`;
}
