import { localDateKey, dataUrlToBlob } from './util.js';
import { putImage, requestPersistence, storageEstimate } from './db.js';
import { showToast } from './toast.js';

const KEY = 'photowalk:state:v2';
const LEGACY_KEY = 'photowalk:state:v1';
export const SYNC_CHANNEL = 'photowalk-sync';

function defaultState() {
  return {
    profile: {
      streak: 0,
      longestStreak: 0,
      lastWalkDate: null,
      walksCompleted: 0,
      photosAnalyzed: 0,
      weeklyGoalHours: 3,
      guidedDurationMin: 30,
      milestonesSeen: [],
      displayName: ''
    },
    album: [],
    rooms: {},
    currentRoom: null,
    activeWalk: null,
    // The most recent finished walk, kept so the Analyze tab can pin its theme
    // tips for a day: { themeId, mode, durationMin, endedAt, challengesDone, tipDismissed }
    lastWalk: null,
    // Newest first, capped at WALK_HISTORY_LIMIT:
    // { id, themeId, mode, hours, challengesDone, challengeCount, endedAt }
    walkHistory: [],
    activityLog: {}, // { 'YYYY-MM-DD': hoursSpentShooting }
    rewards: [], // { id, title, targetHours, baselineHours, createdAt, claimedAt, notified }
    customThemes: [], // { id, title, brief, concepts: [], challenges: [string] } — user-built themes

    reminder: { enabled: false, time: '18:00', days: [1, 3, 5] } // days: 0=Sun
  };
}

function hydrate(parsed) {
  return Object.assign(defaultState(), parsed, {
    profile: Object.assign(defaultState().profile, parsed.profile || {})
  });
}

/**
 * v1 kept every photo as a base64 dataURL inside the state blob. The structural
 * half of the migration runs synchronously here (so `state` is usable the moment
 * the module loads); the blob writes are queued for initStorage() to flush,
 * because IndexedDB is async.
 */
let pendingImageMigration = [];

function migrateFromV1(parsed) {
  const migrated = hydrate(parsed);

  const extract = (record) => {
    if (!record || !record.dataUrl) return;
    record.imageId = record.imageId || record.id;
    pendingImageMigration.push({ id: record.imageId, dataUrl: record.dataUrl });
    delete record.dataUrl;
  };

  migrated.album.forEach(extract);
  Object.values(migrated.rooms).forEach((room) => (room.photos || []).forEach(extract));
  return migrated;
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return hydrate(JSON.parse(raw));
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) return migrateFromV1(JSON.parse(legacy));
    return defaultState();
  } catch (err) {
    console.warn('PhotoWalk: could not read saved state, starting fresh.', err);
    return defaultState();
  }
}

export const state = load();

let lastQuotaWarning = 0;

/** Returns false (and warns the user once a minute) when the write was rejected. */
export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch (err) {
    console.warn('PhotoWalk: could not persist state.', err);
    if (Date.now() - lastQuotaWarning > 60000) {
      lastQuotaWarning = Date.now();
      showToast('Storage is full — delete a few references so PhotoWalk can keep saving.', 6000);
    }
    return false;
  }
}

/**
 * Flushes the v1 photo migration into IndexedDB and asks for persistent storage.
 * Must be awaited before anything else reads or writes photos.
 */
export async function initStorage() {
  if (pendingImageMigration.length) {
    try {
      for (const { id, dataUrl } of pendingImageMigration) {
        await putImage(id, dataUrlToBlob(dataUrl));
      }
      pendingImageMigration = [];
      // Only drop the v1 key once every photo is safely in IndexedDB, so a
      // failure part-way through leaves the old state intact to retry next boot.
      if (save()) localStorage.removeItem(LEGACY_KEY);
    } catch (err) {
      console.warn('PhotoWalk: photo migration failed, keeping the old data to retry.', err);
      showToast('Could not upgrade your saved photos — they are still safe, retrying next launch.', 6000);
    }
  }
  requestPersistence();
}

/** Warns once the origin is close to its storage quota. */
export async function warnIfStorageTight() {
  const info = await storageEstimate();
  if (!info || info.ratio < 0.8) return;
  if (Date.now() - lastQuotaWarning < 60000) return;
  lastQuotaWarning = Date.now();
  showToast(`Storage is ${Math.round(info.ratio * 100)}% full — consider clearing older references.`, 6000);
}

export function setDisplayName(name) {
  const trimmed = String(name || '').trim();
  if (trimmed === state.profile.displayName) return;
  state.profile.displayName = trimmed;
  save();
}

/** Adds hours spent shooting to today's tally in the activity heatmap. */
export function addActivityHours(hours, dateKey = localDateKey()) {
  if (!hours || hours <= 0) return;
  state.activityLog[dateKey] = (state.activityLog[dateKey] || 0) + hours;
}

/** Lifetime hours logged to the heatmap — the currency rewards are priced in. */
export function totalActivityHours() {
  return Object.values(state.activityLog).reduce((sum, h) => sum + (h || 0), 0);
}

/** Hours logged since the most recent Sunday, matching the heatmap's week start. */
export function hoursThisWeek() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());

  let total = 0;
  for (const d = new Date(start); d <= new Date(); d.setDate(d.getDate() + 1)) {
    total += state.activityLog[localDateKey(d)] || 0;
  }
  return total;
}

/**
 * The streak as of right now. `profile.streak` is only rewritten when a walk
 * finishes, so reading it raw keeps showing a dead streak for days; anything
 * user-facing should ask here instead.
 */
export function currentStreak() {
  const { streak, lastWalkDate } = state.profile;
  if (!streak || !lastWalkDate) return 0;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const alive = lastWalkDate === new Date().toDateString() || lastWalkDate === yesterday.toDateString();
  return alive ? streak : 0;
}

const WALK_HISTORY_LIMIT = 200;

/** Files a finished walk into the history ring buffer. */
export function recordWalk(entry) {
  state.walkHistory.unshift(entry);
  if (state.walkHistory.length > WALK_HISTORY_LIMIT) {
    state.walkHistory.length = WALK_HISTORY_LIMIT;
  }
}

/** How many times each theme has been walked, keyed by theme id. */
export function themeWalkCounts() {
  const counts = {};
  for (const w of state.walkHistory) {
    if (w.themeId) counts[w.themeId] = (counts[w.themeId] || 0) + 1;
  }
  return counts;
}

/**
 * Reloads only the room-sharing slice of state from localStorage after a sync broadcast.
 * Scoped narrowly (rather than reloading everything) so a Share-tab update in one browser
 * tab can't clobber an in-progress walk timer or an unsaved album edit happening in another.
 */
export function reloadRoomsFromDisk() {
  const fresh = load();
  state.rooms = fresh.rooms;
  state.currentRoom = fresh.currentRoom;
}

export const bus = ('BroadcastChannel' in window) ? new BroadcastChannel(SYNC_CHANNEL) : null;

export function broadcast(type, payload) {
  save();
  if (bus) bus.postMessage({ type, payload });
}
