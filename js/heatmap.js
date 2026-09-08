import { state, save, hoursInPeriod, hoursForThemeInPeriod } from './store.js';
import { THEMES } from './concepts.js';
import { localDateKey, formatHours, clamp, uid, escapeHtml } from './util.js';
import { showToast } from './toast.js';

const WEEKS = 52;
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const PERIOD_LABEL = { week: 'week', month: 'month', year: 'year' };

// Different periods call for different-sized quick-picks — "3h" makes no sense
// as a yearly suggestion, and "300h" makes no sense as a weekly one.
const GOAL_PRESETS = {
  week: [1, 2, 3, 5, 7, 10],
  month: [5, 10, 15, 20, 30, 40],
  year: [50, 100, 150, 200, 300]
};

let els = {};

export function initHeatmap() {
  els = {
    scroll: document.getElementById('heatmapScroll'),
    months: document.getElementById('heatmapMonths'),
    grid: document.getElementById('heatmapGrid'),
    summary: document.getElementById('heatmapSummary'),
    goalText: document.getElementById('weeklyGoalText'),
    goalBar: document.getElementById('weeklyGoalBar'),
    goalPeriodRow: document.getElementById('goalPeriodRow'),
    goalHoursInput: document.getElementById('goalHoursInput'),
    goalPresets: document.getElementById('goalPresets'),
    themeGoalSelect: document.getElementById('themeGoalThemeSelect'),
    themeGoalHours: document.getElementById('themeGoalHoursInput'),
    themeGoalPeriod: document.getElementById('themeGoalPeriodSelect'),
    addThemeGoalBtn: document.getElementById('addThemeGoalBtn'),
    themeGoalsList: document.getElementById('themeGoalsList'),
    themeGoalsEmpty: document.getElementById('themeGoalsEmpty'),
    themeGoalsCount: document.getElementById('themeGoalsSummaryCount'),
    themeGoalsDetails: document.getElementById('themeGoalsDetails')
  };

  // Nothing to collapse when the list is empty, so start open for a first-time
  // visitor and stay shut once there are goals to summarize.
  if (!state.profile.themeGoals.length) els.themeGoalsDetails.open = true;

  els.goalPeriodRow.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-period]');
    if (!btn) return;
    state.profile.goalPeriod = btn.dataset.period;
    save();
    renderWeeklyGoal();
  });

  els.goalHoursInput.addEventListener('change', () => {
    const period = state.profile.goalPeriod || 'week';
    const val = Number(els.goalHoursInput.value);
    if (!Number.isFinite(val) || val <= 0) { renderWeeklyGoal(); return; }
    state.profile.goals[period] = Math.round(val * 10) / 10;
    save();
    renderWeeklyGoal();
  });

  els.goalPresets.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-preset]');
    if (!btn) return;
    state.profile.goals[state.profile.goalPeriod || 'week'] = Number(btn.dataset.preset);
    save();
    renderWeeklyGoal();
  });

  els.addThemeGoalBtn.addEventListener('click', addThemeGoal);

  els.themeGoalsList.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-remove-id]');
    if (!btn) return;
    state.profile.themeGoals = state.profile.themeGoals.filter((g) => g.id !== btn.dataset.removeId);
    save();
    renderThemeGoals();
  });
}

/** Built-in themes plus anything the user has built themselves, for the goal picker. */
function allThemesForPicker() {
  return [...THEMES, ...state.customThemes].map((t) => ({ id: t.id, title: t.title }));
}

function themeTitle(id) {
  const t = THEMES.find((x) => x.id === id) || state.customThemes.find((x) => x.id === id);
  return t ? t.title : 'Deleted theme';
}

function addThemeGoal() {
  const themeId = els.themeGoalSelect.value;
  const hours = Number(els.themeGoalHours.value);
  const period = els.themeGoalPeriod.value;

  if (!themeId) { showToast('Pick a theme to set a goal for.'); return; }
  if (!Number.isFinite(hours) || hours <= 0) { showToast('Set how many hours the goal targets.'); return; }
  if (state.profile.themeGoals.some((g) => g.themeId === themeId && g.period === period)) {
    showToast('That theme already has a goal for this period — remove it first to replace it.');
    return;
  }

  state.profile.themeGoals.push({ id: uid(), themeId, hours: Math.round(hours * 10) / 10, period });
  save();
  els.themeGoalHours.value = '';
  renderThemeGoals();
  showToast('Theme goal set.');
}

/**
 * An hour target sits alongside the day-streak on purpose: it survives a missed
 * day, which is the failure mode that makes people quit a streak app. Week,
 * month, and year targets are independent numbers, not one value re-scaled —
 * switching the segment just changes which of the three is being edited.
 */
function renderWeeklyGoal() {
  const period = state.profile.goalPeriod || 'week';
  const goal = state.profile.goals[period] || 1;
  const done = hoursInPeriod(period);
  const pct = clamp((done / goal) * 100, 0, 100);

  els.goalPeriodRow.querySelectorAll('button[data-period]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.period === period);
  });
  els.goalHoursInput.value = String(state.profile.goals[period] ?? '');
  els.goalPresets.innerHTML = GOAL_PRESETS[period].map((h) => `
    <button type="button" class="chip-btn ${h === state.profile.goals[period] ? 'active' : ''}" data-preset="${h}">${h}h</button>
  `).join('');
  els.goalBar.style.width = pct + '%';
  els.goalText.textContent = done >= goal
    ? `Goal met — ${formatHours(done)} this ${PERIOD_LABEL[period]}`
    : `${formatHours(done)} of ${formatHours(goal)} this ${PERIOD_LABEL[period]}`;
}

function renderThemeGoals() {
  if (!els.themeGoalsList) return;

  const options = allThemesForPicker();
  const prevValue = els.themeGoalSelect.value;
  els.themeGoalSelect.innerHTML = options.map((t) => `<option value="${t.id}">${escapeHtml(t.title)}</option>`).join('');
  if (options.some((t) => t.id === prevValue)) els.themeGoalSelect.value = prevValue;

  const goals = state.profile.themeGoals;
  els.themeGoalsEmpty.classList.toggle('hidden', goals.length > 0);
  els.themeGoalsCount.textContent = goals.length ? `${goals.length} set` : 'None yet';

  els.themeGoalsList.innerHTML = goals.map((g) => {
    const done = hoursForThemeInPeriod(g.themeId, g.period);
    const pct = clamp((done / g.hours) * 100, 0, 100);
    const met = done >= g.hours;
    return `
      <li class="reward-item ${met ? 'reward-item-ready' : ''}">
        <div class="reward-row">
          <span class="reward-title">${escapeHtml(themeTitle(g.themeId))}</span>
          <span class="reward-hours">${formatHours(Math.min(done, g.hours))} / ${formatHours(g.hours)} per ${PERIOD_LABEL[g.period]}</span>
        </div>
        <div class="timer-track reward-track"><div class="timer-fill reward-fill" style="width:${pct}%"></div></div>
        <div class="reward-row reward-foot">
          <span class="muted">${met ? 'Goal met this ' + PERIOD_LABEL[g.period] : formatHours(g.hours - done) + ' to go'}</span>
          <span class="reward-actions">
            <button type="button" class="btn btn-ghost btn-sm" data-remove-id="${g.id}">Remove</button>
          </span>
        </div>
      </li>`;
  }).join('');
}

function levelFor(hours) {
  if (!hours) return 0;
  if (hours <= 1) return 1;
  if (hours <= 2) return 2;
  if (hours <= 4) return 3;
  return 4;
}

function buildWeeks() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const start = new Date(today);
  start.setDate(start.getDate() - WEEKS * 7);
  start.setDate(start.getDate() - start.getDay()); // rewind to the preceding Sunday

  const days = [];
  for (const d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
    days.push(new Date(d));
  }
  while (days[days.length - 1].getDay() !== 6) {
    const next = new Date(days[days.length - 1]);
    next.setDate(next.getDate() + 1);
    days.push(next);
  }

  const weeks = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return { weeks, today };
}

export function renderHeatmap() {
  if (!els.grid) return;
  const { weeks, today } = buildWeeks();

  let totalHours = 0;
  let activeDays = 0;

  let prevMonth = null;
  els.months.innerHTML = weeks.map((week) => {
    const month = week[0].getMonth();
    const label = month !== prevMonth ? MONTH_NAMES[month] : '';
    prevMonth = month;
    return `<span class="heatmap-month">${label}</span>`;
  }).join('');

  els.grid.innerHTML = weeks.map((week) => `
    <div class="heatmap-week">
      ${week.map((day) => {
        if (day > today) return '<span class="heatmap-day heatmap-day-empty"></span>';
        const key = localDateKey(day);
        const hours = state.activityLog[key] || 0;
        if (hours > 0) { totalHours += hours; activeDays += 1; }
        const label = `${day.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}: ${hours > 0 ? formatHours(hours) + ' shooting' : 'no walk logged'}`;
        return `<span class="heatmap-day" data-level="${levelFor(hours)}" title="${label}"></span>`;
      }).join('')}
    </div>
  `).join('');

  els.summary.textContent = `${activeDays} day${activeDays === 1 ? '' : 's'} out in the last year · ${formatHours(totalHours)} shooting`;

  renderWeeklyGoal();
  renderThemeGoals();
  requestAnimationFrame(() => { els.scroll.scrollLeft = els.scroll.scrollWidth; });
}
