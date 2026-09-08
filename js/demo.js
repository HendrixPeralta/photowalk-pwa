import { state, save, totalActivityHours, STATE_KEY } from './store.js';
import { THEMES } from './concepts.js';
import { localDateKey, uid, formatHours } from './util.js';
import { backfillMilestones } from './milestones.js';

// Screenshot fixture. Nothing here runs unless the page is opened with ?demo
// or the profile already carries a demoMode flag — it exists so the Home tab
// can be photographed with a year of believable history instead of an empty
// grid. Once switched on it stays on across refreshes, and re-generates itself
// on a later day so the streak always ends today. Every number is derived from one generated activity log, so the
// heatmap, the streak badge, the weekly goal bar, the theme goals and the
// reward timeline all agree with each other rather than being faked separately.

// The real profile is parked here while demo mode is on, so `?demo=clear` can
// hand back whatever walks the user had actually logged.
const PRE_DEMO_KEY = 'photowalk:pre-demo-state';

const DEFAULTS = {
  seed: 20260908,
  days: 364, // one full heatmap year, ending today
  streakDays: 9, // consecutive days ending today — must cover the current week
  weekFill: 0.72, // how full the weekly goal bar should read in the shot
  weeklyGoal: 3,
  // Sized so Month and Year also read as progress-in-flight if the segment is
  // tapped during a demo, instead of one bar full and another empty.
  monthlyGoal: 15,
  yearlyGoal: 200
};

/** Deterministic PRNG (mulberry32): the same seed always screenshots the same. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round = (h) => Math.round(h * 10) / 10;

function midnight(offsetDays = 0) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - offsetDays);
  return d;
}

/**
 * A session length in hours. Most walks are the 30–90 minute kind; the long
 * weekend outing is rare on purpose, because it is what paints the darkest
 * squares on the heatmap and those should feel earned.
 */
function sessionHours(rand, weekend) {
  const roll = rand();
  if (weekend && roll > 0.88) return round(4.2 + rand() * 1.6); // level 4
  if (roll > 0.78) return round(2.2 + rand() * 1.6); // level 3
  if (roll > 0.42) return round(1.1 + rand() * 0.9); // level 2
  return round(0.5 + rand() * 0.5); // level 1
}

/**
 * Builds the activity log back-to-front. The chance of going out climbs across
 * the year (the habit is supposed to be taking hold) and two slumps are cut
 * into it, because a year of unbroken practice looks synthetic.
 */
function buildActivityLog(rand, cfg) {
  const log = {};
  const slumps = [{ from: 250, to: 232 }, { from: 128, to: 111 }]; // days ago
  const inSlump = (ago) => slumps.some((s) => ago <= s.from && ago >= s.to);

  for (let ago = cfg.days; ago >= 0; ago--) {
    const day = midnight(ago);
    const weekend = day.getDay() === 0 || day.getDay() === 6;
    const progress = 1 - ago / cfg.days; // 0 a year ago, 1 today
    let p = 0.16 + progress * 0.34 + (weekend ? 0.2 : 0);
    if (inSlump(ago)) p = 0.04;
    if (rand() > p) continue;
    log[localDateKey(day)] = sessionHours(rand, weekend);
  }
  return log;
}

/** Guarantees the badge number: the last N days, today included, are all active. */
function forceStreak(log, rand, cfg) {
  for (let ago = cfg.streakDays - 1; ago >= 0; ago--) {
    const day = midnight(ago);
    const key = localDateKey(day);
    if (!log[key]) log[key] = sessionHours(rand, day.getDay() === 0 || day.getDay() === 6);
  }
}

/**
 * Rewrites this week's hours so the goal bar lands on a readable fraction of
 * the target. The days stay active (the streak depends on them) — only the
 * amounts are redistributed, so the bar and the heatmap still tell one story.
 */
function tuneCurrentWeek(log, rand, cfg) {
  const target = round(cfg.weeklyGoal * cfg.weekFill);
  const days = [];
  for (let ago = new Date().getDay(); ago >= 0; ago--) days.push(midnight(ago));

  // Weight the days randomly, then scale them to hit the target exactly.
  const weights = days.map(() => 0.6 + rand());
  const sum = weights.reduce((a, b) => a + b, 0);
  let assigned = 0;
  days.forEach((day, i) => {
    const isLast = i === days.length - 1;
    const hours = isLast ? round(target - assigned) : round((target * weights[i]) / sum);
    assigned = round(assigned + hours);
    log[localDateKey(day)] = Math.max(0.2, hours);
  });
}

/** The run of consecutive active days ending today — what the badge must say. */
function runEndingToday(log) {
  let run = 0;
  for (let ago = 0; log[localDateKey(midnight(ago))]; ago++) run++;
  return run;
}

/** The longest run of consecutive active days anywhere in the log. */
function longestRun(log, cfg) {
  let best = 0;
  let run = 0;
  for (let ago = cfg.days; ago >= 0; ago--) {
    run = log[localDateKey(midnight(ago))] ? run + 1 : 0;
    if (run > best) best = run;
  }
  return best;
}

/**
 * One walk record per active day (occasionally two, split across the day), so
 * theme goals and theme suggestions read the same hours the heatmap shows.
 * Themes are drawn from a small favourites pool plus the long tail, the way a
 * real user's history skews.
 */
function buildWalkHistory(log, rand, cfg) {
  const favourites = ['golden-hour', 'street-candid', 'leading-lines', 'night-lights', 'reflections'];
  const ids = THEMES.map((t) => t.id);
  const pickTheme = () => (rand() < 0.55
    ? favourites[Math.floor(rand() * favourites.length)]
    : ids[Math.floor(rand() * ids.length)]);

  const history = [];
  for (let ago = cfg.days; ago >= 0; ago--) {
    const day = midnight(ago);
    const hours = log[localDateKey(day)];
    if (!hours) continue;

    const split = hours > 2.5 && rand() < 0.35;
    const parts = split ? [round(hours * 0.6), round(hours - round(hours * 0.6))] : [hours];

    parts.forEach((part, i) => {
      const endedAt = new Date(day);
      endedAt.setHours(i === 0 ? 11 + Math.floor(rand() * 4) : 18 + Math.floor(rand() * 2), Math.floor(rand() * 60));
      const guided = rand() < 0.6;
      const challengeCount = guided ? 3 : 0;
      history.push({
        id: uid(),
        themeId: pickTheme(),
        mode: guided ? 'guided' : 'casual',
        durationMin: Math.round(part * 60),
        hours: part,
        challengesDone: guided ? Math.min(challengeCount, Math.floor(rand() * 4)) : 0,
        challengeCount,
        // Today's walk cannot have ended in the future, and hoursForThemeInPeriod
        // drops anything past `now`.
        endedAt: Math.min(endedAt.getTime(), Date.now() - 60000),
        tipDismissed: true
      });
    });
  }
  return history.sort((a, b) => b.endedAt - a.endedAt);
}

/**
 * Four rewards positioned against the lifetime hour total: one claimed months
 * back, one just earned (the timeline's "Last"), and two ahead of the current
 * total so the Home bar has a "Next" and a "Then" to point at.
 */
function buildRewards(total, now) {
  const day = 86400000;
  return [
    {
      id: uid(),
      title: 'Coffee and a contact sheet',
      targetHours: 5,
      baselineHours: round(Math.max(0, total - 48)),
      createdAt: now - 300 * day,
      claimedAt: now - 96 * day,
      notified: true
    },
    {
      id: uid(),
      title: 'Roll of Portra 400',
      targetHours: 12,
      // Earned 8 hours back, so the timeline has room behind the marker as well
      // as ahead of it — the fill sits about a third along instead of pinned left.
      baselineHours: round(Math.max(0, total - 20)),
      createdAt: now - 70 * day,
      claimedAt: null,
      notified: true
    },
    {
      id: uid(),
      title: 'New 35mm lens',
      targetHours: 20,
      baselineHours: round(Math.max(0, total - 16)), // 80% of the way there
      createdAt: now - 40 * day,
      claimedAt: null,
      notified: false
    },
    {
      id: uid(),
      title: 'Weekend trip to shoot the coast',
      targetHours: 30,
      baselineHours: round(Math.max(0, total - 14)),
      createdAt: now - 20 * day,
      claimedAt: null,
      notified: false
    }
  ];
}

/** Hours per theme inside one period, mirroring store.hoursForThemeInPeriod. */
function themeHoursSince(history, since) {
  const counts = {};
  for (const w of history) {
    if (w.endedAt >= since) counts[w.themeId] = (counts[w.themeId] || 0) + w.hours;
  }
  return counts;
}

/**
 * Theme goals for whatever the generated history actually favours, each priced
 * against the hours already logged in *its own* period — a weekly goal sized
 * off a month of shooting would render as a nearly empty bar.
 */
function buildThemeGoals(history) {
  const weekStart = midnight(new Date().getDay()).getTime();
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const weekly = themeHoursSince(history, weekStart);
  const monthly = themeHoursSince(history, monthStart);

  const top = (counts) => Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const weekTop = top(weekly);
  const monthTop = top(monthly);

  const goals = [];
  // 1.35x what has been shot puts each bar around three-quarters full.
  if (weekTop) {
    goals.push({ id: uid(), themeId: weekTop[0], hours: Math.max(1, Math.round(weekTop[1] * 1.35 * 2) / 2), period: 'week' });
  }
  if (monthTop && (!weekTop || monthTop[0] !== weekTop[0])) {
    goals.push({ id: uid(), themeId: monthTop[0], hours: Math.max(2, Math.round(monthTop[1] * 1.35 * 2) / 2), period: 'month' });
  }
  return goals;
}

/**
 * Frames exposed per shooting day, derived from the hours actually logged so
 * the film strip and the heatmap can never disagree. Roughly 18 frames an hour
 * with some scatter: a working rate for someone shooting deliberately.
 */
function buildFrameLog(log, rand) {
  const frames = {};
  for (const [key, hours] of Object.entries(log)) {
    if (!hours) continue;
    frames[key] = Math.max(1, Math.round(hours * (14 + rand() * 10)));
  }
  return frames;
}

/**
 * Fills the profile with a year of plausible practice. Overwrites the activity
 * log, walk history, rewards and theme goals — photos, rooms and custom themes
 * are left alone.
 */
export function seedDemoData(options = {}) {
  const cfg = { ...DEFAULTS, ...options };
  const rand = rng(cfg.seed);

  stashRealState();

  const log = buildActivityLog(rand, cfg);
  forceStreak(log, rand, cfg);
  tuneCurrentWeek(log, rand, cfg);

  const history = buildWalkHistory(log, rand, cfg);
  state.activityLog = log;
  state.frameLog = buildFrameLog(log, rand);
  state.walkHistory = history.slice(0, 200);

  const total = totalActivityHours();
  const walks = history.length;
  // Read the streak back off the log rather than asserting cfg.streakDays: the
  // random days either side can extend the run, and a badge that disagrees with
  // the squares next to it is the one thing a screenshot cannot hide.
  const streak = runEndingToday(log);

  Object.assign(state.profile, {
    streak,
    longestStreak: Math.max(streak, longestRun(log, cfg)),
    lastWalkDate: new Date().toDateString(),
    walksCompleted: walks,
    photosAnalyzed: Math.round(walks * 1.6),
    goals: { week: cfg.weeklyGoal, month: cfg.monthlyGoal, year: cfg.yearlyGoal },
    goalPeriod: 'week',
    milestonesSeen: [] // rebuilt below, so the demo doesn't open to a badge storm
  });

  state.rewards = buildRewards(total, Date.now());
  state.profile.themeGoals = buildThemeGoals(state.walkHistory);
  state.lastWalk = state.walkHistory[0] || null;
  state.demoMode = { seed: cfg.seed, seededAt: Date.now() };

  backfillMilestones();
  if (!save()) console.warn('PhotoWalk: demo data could not be written to storage — it will not survive a refresh.');
  window.dispatchEvent(new CustomEvent('photowalk:stats-changed'));

  const summary = {
    seed: cfg.seed,
    activeDays: Object.keys(log).length,
    totalHours: formatHours(total),
    streak: state.profile.streak,
    walks: state.profile.walksCompleted,
    thisWeek: formatHours(cfg.weeklyGoal * cfg.weekFill) + ' of ' + formatHours(cfg.weeklyGoal)
  };
  console.info('PhotoWalk demo data seeded', summary);
  return summary;
}

/** Parks the user's real profile before the first seed overwrites it. */
function stashRealState() {
  if (localStorage.getItem(PRE_DEMO_KEY) !== null) return; // already parked
  try {
    localStorage.setItem(PRE_DEMO_KEY, localStorage.getItem(STATE_KEY) || '');
  } catch (err) {
    console.warn('PhotoWalk: could not park the real profile before seeding demo data.', err);
  }
}

/** Drops ?demo from the address bar without reloading, so a refresh is a clean one. */
function stripDemoParam() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has('demo')) return;
  url.searchParams.delete('demo');
  window.history.replaceState({}, '', url.toString());
}

function wipeStats() {
  state.activityLog = {};
  state.frameLog = {};
  state.walkHistory = [];
  state.rewards = [];
  state.lastWalk = null;
  state.demoMode = null;
  Object.assign(state.profile, {
    streak: 0,
    longestStreak: 0,
    lastWalkDate: null,
    walksCompleted: 0,
    photosAnalyzed: 0,
    themeGoals: [],
    milestonesSeen: []
  });
  save();
  window.dispatchEvent(new CustomEvent('photowalk:stats-changed'));
}

/**
 * Leaves demo mode. Whatever profile was parked at the first seed is handed
 * back — which means a page reload, because the live state object was built
 * from the demo blob. With nothing parked, the stats are simply wiped.
 */
export function clearDemoData() {
  const parked = localStorage.getItem(PRE_DEMO_KEY);
  localStorage.removeItem(PRE_DEMO_KEY);
  stripDemoParam();

  if (parked === null) { wipeStats(); return false; }

  if (parked) localStorage.setItem(STATE_KEY, parked);
  else localStorage.removeItem(STATE_KEY);
  window.location.reload();
  return true;
}

/** True once the fixture has been seeded, until it is cleared. */
export function demoModeActive() {
  return Boolean(state.demoMode);
}

/**
 * Seeds only when there is something to fix: no demo data yet, a different seed
 * asked for, or a log that no longer reaches today. Boot calls this on every
 * load while demo mode is on, so a refresh keeps the screenshot intact and
 * opening the app tomorrow still shows a streak ending today.
 */
export function ensureDemoData(options = {}) {
  const seed = options.seed ?? (state.demoMode && state.demoMode.seed) ?? DEFAULTS.seed;
  const upToDate = state.demoMode
    && state.demoMode.seed === seed
    && state.walkHistory.length > 0
    && (state.activityLog[localDateKey()] || 0) > 0
    // A fixture seeded before the frame log existed has to be topped up too.
    && Object.keys(state.frameLog || {}).length > 0;
  if (upToDate) return null;
  return seedDemoData({ ...options, seed });
}

/**
 * Console handle: photowalkDemo.seed({ seed: 7 }) reseeds, .clear() restores the
 * real profile, .status() reports what the fixture currently claims.
 */
export function installDemoHooks() {
  window.photowalkDemo = {
    seed: seedDemoData,
    ensure: ensureDemoData,
    clear: clearDemoData,
    active: demoModeActive,
    status: () => ({
      ...(state.demoMode || { seed: null }),
      activeDays: Object.keys(state.activityLog).length,
      streak: state.profile.streak,
      totalHours: formatHours(totalActivityHours())
    })
  };
}
