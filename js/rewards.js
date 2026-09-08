import { state, save, totalActivityHours } from './store.js';
import { showToast } from './toast.js';
import { escapeHtml, uid, clamp, formatDate, formatHours, navigateTo } from './util.js';

// Rewards are priced in hours of shooting. Each one snapshots the lifetime hour
// total when it's created, so "20h" always means twenty fresh hours of walking —
// hours banked before the goal was set don't count toward it.

const MAX_TARGET_HOURS = 1000;

// The Home bar plots rewards on one lifetime-hours axis; a goal that is already
// met would otherwise squash the axis to nothing.
const MIN_AXIS_SPAN_HOURS = 0.5;

let els = {};

export function initRewards() {
  els = {
    list: document.getElementById('rewardsList'),
    empty: document.getElementById('rewardsEmpty'),
    title: document.getElementById('rewardTitleInput'),
    hours: document.getElementById('rewardHoursInput'),
    addBtn: document.getElementById('addRewardBtn'),
    details: document.getElementById('rewardsDetails'),
    detailsCount: document.getElementById('rewardsSummaryCount'),
    bar: document.getElementById('rewardBar')
  };

  els.addBtn.addEventListener('click', addReward);
  els.hours.addEventListener('keydown', (e) => { if (e.key === 'Enter') addReward(); });
  els.title.addEventListener('keydown', (e) => { if (e.key === 'Enter') addReward(); });

  els.list.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const { action, id } = btn.dataset;
    if (action === 'claim') claimReward(id);
    if (action === 'remove') removeReward(id);
  });

  // Nothing to collapse when the list is empty, so start open for a first-time
  // visitor and stay shut once there are rewards to summarize.
  if (!state.rewards.length) els.details.open = true;

  els.bar.addEventListener('click', (e) => {
    if (!e.target.closest('button[data-action="manage"]')) return;
    navigateTo('walks');
    els.details.open = true;
    els.details.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    els.title.focus();
  });

  renderRewards();
}

function addReward() {
  const title = els.title.value.trim();
  const targetHours = Number(els.hours.value);

  if (!title) { showToast('Name the reward you are walking toward.'); return; }
  if (!Number.isFinite(targetHours) || targetHours <= 0) {
    showToast('Set how many hours of shooting the reward costs.');
    return;
  }

  state.rewards.push({
    id: uid(),
    title,
    targetHours: clamp(Math.round(targetHours * 10) / 10, 0.1, MAX_TARGET_HOURS),
    baselineHours: totalActivityHours(),
    createdAt: Date.now(),
    claimedAt: null,
    notified: false
  });
  save();

  els.title.value = '';
  els.hours.value = '';
  renderRewards();
  showToast('Reward set — hours you shoot from now on count toward it.');
}

function claimReward(id) {
  const reward = state.rewards.find((r) => r.id === id);
  if (!reward || reward.claimedAt) return;
  if (earnedHours(reward) < reward.targetHours) return;
  reward.claimedAt = Date.now();
  save();
  renderRewards();
  showToast(`Enjoy it — you earned "${reward.title}" with ${formatHours(reward.targetHours)} of shooting.`, 6000);
}

function removeReward(id) {
  const idx = state.rewards.findIndex((r) => r.id === id);
  if (idx === -1) return;
  state.rewards.splice(idx, 1);
  save();
  renderRewards();
}

function earnedHours(reward) {
  return Math.max(0, totalActivityHours() - reward.baselineHours);
}

function isEarned(reward) {
  return Boolean(reward.claimedAt) || earnedHours(reward) >= reward.targetHours;
}

/** The lifetime-hour total at which a reward comes due — its spot on the axis. */
function targetTotalHours(reward) {
  return reward.baselineHours + reward.targetHours;
}

const byTargetTotal = (a, b) => targetTotalHours(a) - targetTotalHours(b);

/** Active rewards with their progress, nearest to completion first. */
export function activeRewardProgress() {
  return state.rewards
    .filter((r) => !r.claimedAt)
    .map((r) => {
      const earned = earnedHours(r);
      return {
        id: r.id,
        title: r.title,
        earned,
        target: r.targetHours,
        remaining: Math.max(0, r.targetHours - earned),
        done: earned >= r.targetHours
      };
    })
    .sort((a, b) => a.remaining - b.remaining);
}

/**
 * Flags rewards that have just crossed their target and returns them so the
 * caller can celebrate. The `notified` flag makes each unlock fire once, even
 * though renderRewards() runs on every visit to Home.
 */
export function claimRewardUnlocks() {
  const unlocked = [];
  for (const r of state.rewards) {
    if (r.claimedAt || r.notified) continue;
    if (earnedHours(r) >= r.targetHours) {
      r.notified = true;
      unlocked.push(r);
    }
  }
  if (unlocked.length) save();
  return unlocked;
}

/**
 * Places the most recently earned reward and the next two due onto a single
 * lifetime-hours axis, so Home can show where the current hour total sits
 * between the reward just banked and the ones still ahead.
 */
export function rewardTimeline() {
  const now = totalActivityHours();
  const earned = state.rewards.filter(isEarned).sort(byTargetTotal);
  const upcoming = state.rewards.filter((r) => !isEarned(r)).sort(byTargetTotal).slice(0, 2);
  const last = earned[earned.length - 1] || null;

  // Without a reward behind us the axis starts where the nearest goal's clock
  // started, not at hour zero — otherwise banked hours inflate the fill.
  const start = last ? targetTotalHours(last)
    : upcoming.length ? Math.min(...upcoming.map((r) => r.baselineHours))
    : 0;

  // The axis is piecewise, not linear in hours: every leg between two stops
  // gets an equal slice of the bar. A far-off reward (say 200h) would otherwise
  // squash the walk toward the next one (10h) into a sliver of fill.
  const nodes = [start, ...upcoming.map(targetTotalHours)];
  const legPct = 100 / Math.max(nodes.length - 1, 1);
  const pctOf = (hours) => {
    for (let i = 1; i < nodes.length; i++) {
      if (hours > nodes[i]) continue;
      const leg = Math.max(nodes[i] - nodes[i - 1], MIN_AXIS_SPAN_HOURS);
      const within = (hours - nodes[i - 1]) / leg;
      return clamp((i - 1 + within) * legPct, 0, 100);
    }
    return nodes.length > 1 ? 100 : 0;
  };

  const stops = [];
  if (last) {
    stops.push({
      kind: 'earned',
      label: 'Last',
      title: last.title,
      pct: pctOf(targetTotalHours(last)),
      ready: !last.claimedAt,
      note: last.claimedAt ? `Claimed ${formatDate(last.claimedAt)}` : 'Earned — ready to claim'
    });
  }
  upcoming.forEach((r, i) => {
    stops.push({
      kind: 'next',
      label: i === 0 ? 'Next' : 'Then',
      title: r.title,
      pct: pctOf(targetTotalHours(r)),
      ready: false,
      note: `${formatHours(targetTotalHours(r) - now)} of shooting to go`
    });
  });

  return { now, nowPct: pctOf(now), stops, upcoming: upcoming.length };
}

function renderRewardBar() {
  if (!els.bar) return;

  const { now, nowPct, stops, upcoming } = rewardTimeline();

  if (!stops.length) {
    els.bar.innerHTML = `
      <p class="empty-state-sm">No rewards yet — price a treat in shooting hours to give your next walks a target.</p>
      <button type="button" class="btn btn-ghost btn-sm" data-action="manage">Set a reward</button>`;
    return;
  }

  const next = stops.find((s) => s.kind === 'next');

  // Only the far end of the axis is marked. The reward behind us is the origin,
  // and a dot pinned to the left edge reads as a stray blob rather than an
  // achievement; the rewards in between are named in the legend below. That
  // leaves one circle that moves: the handle riding the end of the fill.
  const endStop = stops.filter((s) => s.kind === 'next').pop();
  const marksHtml = endStop
    ? `<span class="reward-bar-mark" style="left:${endStop.pct}%" title="${escapeHtml(endStop.title)}"></span>`
    : '';

  const legendHtml = stops.map((s) => `
    <li class="reward-leg ${s.kind === 'earned' ? 'reward-leg-done' : ''}">
      <span class="reward-leg-label">${s.label}</span>
      <span class="reward-leg-title">${escapeHtml(s.title)}</span>
      <span class="reward-leg-note">${escapeHtml(s.note)}</span>
    </li>`).join('');

  // Any progress at all should read as a visible nub rather than a hairline the
  // track's rounded cap swallows — and that 2% floor is also what keeps the
  // handle clear of the left end of the track.
  const fillPct = upcoming ? (nowPct > 0 ? Math.max(nowPct, 2) : 0) : 100;
  // The handle sits at exactly the fill's width, so the two always end at the
  // same point and animate as one. With nothing banked there is no head to the
  // fill, so there is no handle either.
  const handleHtml = fillPct > 0
    ? `<span class="reward-bar-handle" style="left:${fillPct}%" title="${formatHours(now)} shot"></span>`
    : '';

  els.bar.innerHTML = `
    <div class="reward-bar-head">
      <span class="reward-bar-now">${formatHours(now)} shot</span>
      <span class="muted">${next
        ? `${escapeHtml(next.title)} in ${next.note.replace(' of shooting to go', '')}`
        : 'Every reward earned — set another one'}</span>
    </div>
    <div class="reward-bar-track">
      <div class="reward-bar-fill" style="width:${fillPct}%"></div>
      ${marksHtml}
      ${handleHtml}
    </div>
    <ul class="reward-bar-legend">${legendHtml}</ul>
    <button type="button" class="btn btn-ghost btn-sm" data-action="manage">Manage rewards</button>`;
}

export function renderRewards() {
  renderRewardBar();
  if (!els.list) return;

  const active = state.rewards.filter((r) => !r.claimedAt);
  const claimed = state.rewards.filter((r) => r.claimedAt).sort((a, b) => b.claimedAt - a.claimedAt);

  els.empty.classList.toggle('hidden', state.rewards.length > 0);

  const activeHtml = active.map((r) => {
    const earned = earnedHours(r);
    const pct = clamp((earned / r.targetHours) * 100, 0, 100);
    const done = earned >= r.targetHours;
    return `
      <li class="reward-item ${done ? 'reward-item-ready' : ''}">
        <div class="reward-row">
          <span class="reward-title">${escapeHtml(r.title)}</span>
          <span class="reward-hours">${formatHours(Math.min(earned, r.targetHours))} / ${formatHours(r.targetHours)}</span>
        </div>
        <div class="timer-track reward-track"><div class="timer-fill reward-fill" style="width:${pct}%"></div></div>
        <div class="reward-row reward-foot">
          <span class="muted">${done ? 'Earned — treat yourself!' : formatHours(r.targetHours - earned) + ' of shooting to go'}</span>
          <span class="reward-actions">
            ${done ? `<button type="button" class="btn btn-accent btn-sm" data-action="claim" data-id="${r.id}">Claim</button>` : ''}
            <button type="button" class="btn btn-ghost btn-sm" data-action="remove" data-id="${r.id}">Remove</button>
          </span>
        </div>
      </li>`;
  }).join('');

  const claimedHtml = claimed.map((r) => `
    <li class="reward-item reward-item-claimed">
      <div class="reward-row">
        <span class="reward-title">&check; ${escapeHtml(r.title)}</span>
        <span class="reward-actions">
          <span class="reward-hours">${formatHours(r.targetHours)} &middot; ${formatDate(r.claimedAt)}</span>
          <button type="button" class="btn btn-ghost btn-sm" data-action="remove" data-id="${r.id}">Remove</button>
        </span>
      </div>
    </li>`).join('');

  els.list.innerHTML = activeHtml + claimedHtml;

  els.detailsCount.textContent = state.rewards.length
    ? `${active.length} active${claimed.length ? ` \u00b7 ${claimed.length} claimed` : ''}`
    : 'None set';
}
