import { localDateKey } from './util.js';

const KEY = 'photowalk:state:v1';
export const SYNC_CHANNEL = 'photowalk-sync';

function defaultState() {
  return {
    profile: {
      streak: 0,
      lastWalkDate: null,
      walksCompleted: 0,
      photosAnalyzed: 0
    },
    album: [],
    rooms: {},
    currentRoom: null,
    activeWalk: null,
    activityLog: {} // { 'YYYY-MM-DD': hoursSpentShooting }
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return Object.assign(defaultState(), parsed, {
      profile: Object.assign(defaultState().profile, parsed.profile || {})
    });
  } catch (err) {
    console.warn('PhotoWalk: could not read saved state, starting fresh.', err);
    return defaultState();
  }
}

export const state = load();

export function save() {
  localStorage.setItem(KEY, JSON.stringify(state));
}

/** Adds hours spent shooting to today's tally in the activity heatmap. */
export function addActivityHours(hours, dateKey = localDateKey()) {
  if (!hours || hours <= 0) return;
  state.activityLog[dateKey] = (state.activityLog[dateKey] || 0) + hours;
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
