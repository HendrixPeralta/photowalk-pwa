import { t, dateLocale } from './i18n.js';
import { state, save, hoursInPeriod, hoursForThemeInPeriod } from './store.js';
import { THEMES } from './concepts.js';
import { localDateKey, formatHours, clamp, uid, escapeHtml } from './util.js';
import { showToast } from './toast.js';

const WEEKS = 52;
const MONTH_NAMES = [t('Jan'), t('Feb'), t('Mar'), t('Apr'), t('May'), t('Jun'), t('Jul'), t('Aug'), t('Sep'), t('Oct'), t('Nov'), t('Dec')];

// Whole sentences per period, so Japanese can place the period word where it needs to.
const GOAL_MET_TEXT = { week: 'Goal met: {done} this week', month: 'Goal met: {done} this month', year: 'Goal met: {done} this year' };
const GOAL_PROGRESS_TEXT = { week: '{done} of {goal} this week', month: '{done} of {goal} this month', year: '{done} of {goal} this year' };
const PER_PERIOD_TEXT = { week: '{done} / {goal} per week', month: '{done} / {goal} per month', year: '{done} / {goal} per year' };
const MET_THIS_PERIOD_TEXT = { week: 'Goal met this week', month: 'Goal met this month', year: 'Goal met this year' };

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
  return [...THEMES, ...state.customThemes].map((th) => ({ id: th.id, title: th.title }));
}

function themeTitle(id) {
  const theme = THEMES.find((x) => x.id === id) || state.customThemes.find((x) => x.id === id);
  return theme ? theme.title : t('Deleted theme');
}

function addThemeGoal() {
  const themeId = els.themeGoalSelect.value;
  const hours = Number(els.themeGoalHours.value);
  const period = els.themeGoalPeriod.value;

  if (!themeId) { showToast(t('Pick a theme to set a goal for.')); return; }
  if (!Number.isFinite(hours) || hours <= 0) { showToast(t('Set how many hours the goal targets.')); return; }
  if (state.profile.themeGoals.some((g) => g.themeId === themeId && g.period === period)) {
    showToast(t('That theme already has a goal for this period. Remove it first to set a new one.'));
    return;
  }

  state.profile.themeGoals.push({ id: uid(), themeId, hours: Math.round(hours * 10) / 10, period });
  save();
  els.themeGoalHours.value = '';
  renderThemeGoals();
  showToast(t('Theme goal set.'));
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
    <button type="button" class="chip-btn ${h === state.profile.goals[period] ? 'active' : ''}" data-preset="${h}">${t('{n}h', { n: h })}</button>
  `).join('');
  els.goalBar.style.width = pct + '%';
  els.goalText.textContent = done >= goal
    ? t(GOAL_MET_TEXT[period], { done: formatHours(done) })
    : t(GOAL_PROGRESS_TEXT[period], { done: formatHours(done), goal: formatHours(goal) });
}

function renderThemeGoals() {
  if (!els.themeGoalsList) return;

  const options = allThemesForPicker();
  const prevValue = els.themeGoalSelect.value;
  els.themeGoalSelect.innerHTML = options.map((th) => `<option value="${th.id}">${escapeHtml(th.title)}</option>`).join('');
  if (options.some((th) => th.id === prevValue)) els.themeGoalSelect.value = prevValue;

  const goals = state.profile.themeGoals;
  els.themeGoalsEmpty.classList.toggle('hidden', goals.length > 0);
  els.themeGoalsCount.textContent = goals.length ? t('{n} set', { n: goals.length }) : t('None yet');

  els.themeGoalsList.innerHTML = goals.map((g) => {
    const done = hoursForThemeInPeriod(g.themeId, g.period);
    const pct = clamp((done / g.hours) * 100, 0, 100);
    const met = done >= g.hours;
    return `
      <li class="reward-item ${met ? 'reward-item-ready' : ''}">
        <div class="reward-row">
          <span class="reward-title">${escapeHtml(themeTitle(g.themeId))}</span>
          <span class="reward-hours">${t(PER_PERIOD_TEXT[g.period], { done: formatHours(Math.min(done, g.hours)), goal: formatHours(g.hours) })}</span>
        </div>
        <div class="timer-track reward-track"><div class="timer-fill reward-fill" style="width:${pct}%"></div></div>
        <div class="reward-row reward-foot">
          <span class="muted">${met ? t(MET_THIS_PERIOD_TEXT[g.period]) : t('{hours} to go', { hours: formatHours(g.hours - done) })}</span>
          <span class="reward-actions">
            <button type="button" class="btn btn-ghost btn-sm" data-remove-id="${g.id}">${t('Remove')}</button>
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
        const date = day.toLocaleDateString(dateLocale, { month: 'short', day: 'numeric' });
        const label = hours > 0
          ? t('{date}: {hours} shooting', { date, hours: formatHours(hours) })
          : t('{date}: no walk logged', { date });
        return `<span class="heatmap-day" data-level="${levelFor(hours)}" title="${label}"></span>`;
      }).join('')}
    </div>
  `).join('');

  els.summary.textContent = t(activeDays === 1 ? '{n} day out in the last year · {hours} shooting' : '{n} days out in the last year · {hours} shooting', { n: activeDays, hours: formatHours(totalHours) });

  renderWeeklyGoal();
  renderThemeGoals();
  requestAnimationFrame(() => { els.scroll.scrollLeft = els.scroll.scrollWidth; });
}
