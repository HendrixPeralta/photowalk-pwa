import { state, save, totalActivityHours, STATE_KEY } from './store.js';
import { THEMES } from './concepts.js';
import { localDateKey, uid, formatHours } from './util.js';
import { backfillMilestones } from './milestones.js';

/**
 * Generates a plausible practice history — the activity log, the walks behind
 * it, the frames, the reward ladder and the theme goals — all derived from one
 * generated log so the heatmap, the streak badge, the goal bars and the reward
 * timeline can never disagree with each other.
 *
 * Two callers, same generator:
 *  - demo.js seeds a full year as a screenshot fixture, parked over the real
 *    profile and reversible with `?demo=clear`.
 *  - seedStarterHistory() below writes three months into the profile for keeps,
 *    so a brand-new install has something to show instead of an empty grid.
 */

/** Deterministic PRNG (mulberry32): the same seed always generates the same history. */
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
 * the window (the habit is supposed to be taking hold) and the configured
 * slumps are cut into it, because unbroken practice looks synthetic.
 */
function buildActivityLog(rand, cfg) {
  const inSlump = (ago) => cfg.slumps.some((s) => ago <= s.from && ago >= s.to);

  const log = {};
  for (let ago = cfg.days; ago >= 0; ago--) {
    const day = midnight(ago);
    const weekend = day.getDay() === 0 || day.getDay() === 6;
    const progress = 1 - ago / cfg.days; // 0 at the start of the window, 1 today
    let p = cfg.baseChance + progress * cfg.rampChance + (weekend ? cfg.weekendBonus : 0);
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
      // Casual walks carry no checklist — mini-challenges are a Guided Sprint
      // feature, and the history has to agree with that.
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
 * Four rewards positioned against the lifetime hour total: one claimed early
 * on, one just earned (the timeline's "Last"), and two ahead of the current
 * total so the Home bar has a "Next" and a "Then" to point at. Baselines are
 * offsets back from the total, so the geometry holds whether the window is
 * three months or a year.
 */
function buildRewards(total, now, cfg) {
  const day = 86400000;
  const [oldest, earnedAge, nextAge, laterAge] = cfg.rewardAgeDays;
  return [
    {
      id: uid(),
      title: 'Coffee and a contact sheet',
      targetHours: 5,
      baselineHours: round(Math.max(0, total - 48)),
      createdAt: now - oldest * day,
      claimedAt: now - Math.round(oldest * 0.4) * day,
      notified: true
    },
    {
      id: uid(),
      title: 'Roll of Portra 400',
      targetHours: 12,
      // Earned 8 hours back, so the timeline has room behind the marker as well
      // as ahead of it — the fill sits along the bar instead of pinned left.
      baselineHours: round(Math.max(0, total - 20)),
      createdAt: now - earnedAge * day,
      claimedAt: null,
      notified: true
    },
    {
      id: uid(),
      title: 'New 35mm lens',
      targetHours: 20,
      baselineHours: round(Math.max(0, total - 16)), // 80% of the way there
      createdAt: now - nextAge * day,
      claimedAt: null,
      notified: false
    },
    {
      id: uid(),
      title: 'Weekend trip to shoot the coast',
      targetHours: 30,
      baselineHours: round(Math.max(0, total - 14)),
      createdAt: now - laterAge * day,
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
 * Writes a generated history over the stats slice of the profile: activity log,
 * frame log, walk history, the counters that hang off them, rewards and theme
 * goals. Photos, rooms, custom themes and reminders are left alone.
 *
 * @returns a summary of what the profile now claims.
 */
export function applyBackstory(cfg) {
  const rand = rng(cfg.seed);

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
  // the squares next to it is the one thing that always reads as fake.
  const streak = runEndingToday(log);

  Object.assign(state.profile, {
    streak,
    longestStreak: Math.max(streak, longestRun(log, cfg)),
    lastWalkDate: new Date().toDateString(),
    walksCompleted: walks,
    photosAnalyzed: Math.round(walks * 1.6),
    goals: { week: cfg.weeklyGoal, month: cfg.monthlyGoal, year: cfg.yearlyGoal },
    goalPeriod: 'week',
    milestonesSeen: [] // rebuilt below, so the app doesn't open to a badge storm
  });

  state.rewards = buildRewards(total, Date.now(), cfg);
  state.profile.themeGoals = buildThemeGoals(state.walkHistory);
  state.lastWalk = state.walkHistory[0] || null;

  backfillMilestones();

  return {
    seed: cfg.seed,
    days: cfg.days,
    activeDays: Object.keys(log).length,
    walks,
    totalHours: formatHours(total),
    streak,
    thisWeek: `${formatHours(cfg.weeklyGoal * cfg.weekFill)} of ${formatHours(cfg.weeklyGoal)}`
  };
}

/* ---------- The lasting three-month backstory ---------- */

// Where the pre-seed profile is parked, so a backstory can always be undone.
const PRE_SEED_KEY = 'photowalk:pre-backstory-state';
// Set when the user restores their own profile. It has to live outside the
// state blob — restoring replaces that wholesale — and without it, restoring an
// empty profile would land straight back on a freshly seeded one.
const DECLINED_KEY = 'photowalk:backstory-declined';

// Three months of practice ending today. Unlike the demo fixture this is
// written once and then left alone: from the moment it lands it is ordinary
// history, and real walks pile on top of it.
export const STARTER = {
  seed: 20260608,
  days: 91, // the last three months, ending today
  streakDays: 6, // consecutive days ending today, so the badge has something to say
  weekFill: 0.68, // how full the weekly goal bar reads on first open
  weeklyGoal: 3,
  // Denser than the year fixture: three months has to read as a habit already
  // forming, and the same odds that fill a year leave a quarter looking sparse.
  baseChance: 0.28,
  rampChance: 0.30,
  weekendBonus: 0.18,
  monthlyGoal: 15,
  yearlyGoal: 150,
  // Two gaps inside the window: a week off and a long weekend, because three
  // unbroken months of shooting is not a history anyone recognises.
  slumps: [{ from: 74, to: 67 }, { from: 38, to: 34 }],
  // Reward ages in days: the claimed one dates back near the start of the
  // window, the rest were set as the habit took hold.
  rewardAgeDays: [86, 58, 32, 14]
};

// Under this many lifetime hours, a profile is someone trying the app out
// rather than someone practising — hours, not walk count, because a handful of
// two-minute test walks is exactly the state that most needs a past.
const THIN_PROFILE_HOURS = 5;

function profileIsThin() {
  return totalActivityHours() < THIN_PROFILE_HOURS;
}

/**
 * Seeds the three-month backstory unless there is a reason not to: demo mode
 * owns the stats while it is on, a profile that already has one keeps it, and a
 * profile with real practice in it is left exactly as it is.
 */
export function maybeSeedStarterHistory() {
  if (state.demoMode) return null;
  if (localStorage.getItem(DECLINED_KEY)) return null;
  // `skipped` markers were written by an earlier version that recorded the
  // decision not to seed; they must not lock a thin profile out forever.
  if (state.seededHistory && !state.seededHistory.skipped) return null;
  if (!profileIsThin()) return null;
  return seedStarterHistory();
}

/** Writes the backstory for keeps. Exposed for `?history=seed` and the console hook. */
export function seedStarterHistory(options = {}) {
  const cfg = { ...STARTER, ...options };
  // Asking for a backstory outright un-declines it.
  localStorage.removeItem(DECLINED_KEY);
  parkCurrentState();

  const summary = applyBackstory(cfg);
  state.seededHistory = { seed: cfg.seed, days: cfg.days, seededAt: Date.now() };

  if (!save()) console.warn('PhotoWalk: the seeded history could not be written to storage — it will not survive a refresh.');
  window.dispatchEvent(new CustomEvent('photowalk:stats-changed'));
  console.info('PhotoWalk: seeded three months of history', summary);
  return summary;
}

/** Parks whatever was saved before the first seed, so undo() has something to give back. */
function parkCurrentState() {
  if (localStorage.getItem(PRE_SEED_KEY) !== null) return; // already parked
  try {
    localStorage.setItem(PRE_SEED_KEY, localStorage.getItem(STATE_KEY) || '');
  } catch (err) {
    console.warn('PhotoWalk: could not park the profile before seeding history.', err);
  }
}

/**
 * Hands back the profile as it was before the backstory landed. Reloads,
 * because the live state object was built from the seeded blob.
 */
export function undoStarterHistory() {
  const parked = localStorage.getItem(PRE_SEED_KEY);
  if (parked === null) { console.warn('PhotoWalk: no pre-seed profile is parked.'); return false; }
  localStorage.removeItem(PRE_SEED_KEY);
  // Whatever comes back is what the user asked for, empty or not — the seed
  // must not re-fire on the reload below and undo the undo.
  try { localStorage.setItem(DECLINED_KEY, '1'); } catch (err) { /* seeding again is the lesser evil */ }
  if (parked) localStorage.setItem(STATE_KEY, parked);
  else localStorage.removeItem(STATE_KEY);
  window.location.reload();
  return true;
}

/**
 * Console handle: photowalkHistory.seed() rewrites the backstory (optionally
 * with a different seed or window), .undo() restores the pre-seed profile,
 * .status() reports what the profile currently claims.
 */
export function installHistoryHooks() {
  window.photowalkHistory = {
    seed: seedStarterHistory,
    undo: undoStarterHistory,
    status: () => ({
      ...(state.seededHistory || { seed: null }),
      declined: Boolean(localStorage.getItem(DECLINED_KEY)),
      activeDays: Object.keys(state.activityLog).length,
      walks: state.profile.walksCompleted,
      streak: state.profile.streak,
      totalHours: formatHours(totalActivityHours()),
      rewards: state.rewards.length
    })
  };
}
