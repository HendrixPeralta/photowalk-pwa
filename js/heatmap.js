import { state, save, hoursThisWeek } from './store.js';
import { localDateKey, formatHours, clamp } from './util.js';

const WEEKS = 52;
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const GOAL_OPTIONS = [1, 2, 3, 5, 7, 10];

let els = {};

export function initHeatmap() {
  els = {
    scroll: document.getElementById('heatmapScroll'),
    months: document.getElementById('heatmapMonths'),
    grid: document.getElementById('heatmapGrid'),
    summary: document.getElementById('heatmapSummary'),
    goalText: document.getElementById('weeklyGoalText'),
    goalBar: document.getElementById('weeklyGoalBar'),
    goalSelect: document.getElementById('weeklyGoalSelect')
  };

  els.goalSelect.innerHTML = GOAL_OPTIONS
    .map((h) => `<option value="${h}">${h}h / week</option>`).join('');
  els.goalSelect.addEventListener('change', () => {
    state.profile.weeklyGoalHours = Number(els.goalSelect.value);
    save();
    renderWeeklyGoal();
  });
}

/**
 * A weekly hour target sits alongside the day-streak on purpose: it survives a
 * missed day, which is the failure mode that makes people quit a streak app.
 */
function renderWeeklyGoal() {
  const goal = state.profile.weeklyGoalHours || 3;
  const done = hoursThisWeek();
  const pct = clamp((done / goal) * 100, 0, 100);

  els.goalSelect.value = String(goal);
  els.goalBar.style.width = pct + '%';
  els.goalText.textContent = done >= goal
    ? `Weekly goal met — ${formatHours(done)} this week`
    : `${formatHours(done)} of ${formatHours(goal)} this week`;
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
  requestAnimationFrame(() => { els.scroll.scrollLeft = els.scroll.scrollWidth; });
}
