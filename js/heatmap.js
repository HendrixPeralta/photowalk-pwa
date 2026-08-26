import { state } from './store.js';
import { localDateKey } from './util.js';

const WEEKS = 52;
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

let els = {};

export function initHeatmap() {
  els = {
    scroll: document.getElementById('heatmapScroll'),
    months: document.getElementById('heatmapMonths'),
    grid: document.getElementById('heatmapGrid'),
    summary: document.getElementById('heatmapSummary')
  };
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
        const label = `${day.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}: ${hours > 0 ? hours.toFixed(1) + 'h shooting' : 'no walk logged'}`;
        return `<span class="heatmap-day" data-level="${levelFor(hours)}" title="${label}"></span>`;
      }).join('')}
    </div>
  `).join('');

  els.summary.textContent = `${activeDays} day${activeDays === 1 ? '' : 's'} out in the last year · ${totalHours.toFixed(1)}h shooting`;

  requestAnimationFrame(() => { els.scroll.scrollLeft = els.scroll.scrollWidth; });
}
