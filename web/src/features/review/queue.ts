// Reviews wait on the device and go out when there's a network to send them
// over. This is the one place PhotoEYE sends anything anywhere, and it stays
// narrow: only what the person typed, one way, nothing read back. No
// identifiers, no telemetry, no photo data.
//
// The queue has its own localStorage key, outside the saved data, because
// demo mode parks and restores that wholesale: a review written during a demo
// would vanish when someone pressed Restore mine.

/**
 * The Apps Script web app behind the review sheet (tools/review-endpoint.gs).
 * Public on purpose: it only appends rows. Blank is safe too: reviews keep
 * queueing and go out on the first load after a URL is back.
 */
export const REVIEW_ENDPOINT =
  "https://script.google.com/macros/s/AKfycbwPZC5YSPUaSVIuMKn6FZCd0dbHcwmqv2ksedbLDC2fnxo0CAYMd_faEAHaHGNgO63QVw/exec";
export const QUEUE_KEY = "photowalk:review-queue";
const MAX_QUEUED = 25; // longer than this is a bug, not a busy room
const TIMEOUT_MS = 8000;

export interface ReviewRecord {
  /** Which app sent it, so the sheet can tell the two apart. */
  source: string;
  submittedAt: string;
  rating: number | null;
  level: string;
  features: string;
  improveText: string;
  problemText: string;
  name: string;
}

export function readQueue(): ReviewRecord[] {
  try {
    const list = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeQueue(list: ReviewRecord[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(list));
  } catch (err) {
    console.warn("PhotoEYE: the review queue could not be saved.", err);
  }
}

/** Adds a review; if the queue is somehow full, the oldest is dropped. */
export function enqueue(record: ReviewRecord): void {
  writeQueue([...readQueue(), record].slice(-MAX_QUEUED));
}

/**
 * Posts one review. `no-cors` with a text/plain body keeps it a simple
 * request, so the browser skips the preflight Apps Script won't answer. The
 * response is opaque as a result: resolving means the request left the
 * device, and only a network failure (what the queue is for) can be seen.
 */
async function post(record: ReviewRecord): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    await fetch(REVIEW_ENDPOINT, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(record),
      signal: controller.signal,
    });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

let flushing = false;

/**
 * Sends the queue oldest first, stopping at the first failure so the order
 * holds and nothing goes twice. Returns how many were sent.
 */
export async function flushQueue(): Promise<number> {
  if (flushing || !REVIEW_ENDPOINT || !navigator.onLine) return 0;
  const list = readQueue();
  if (!list.length) return 0;
  flushing = true;
  let sent = 0;
  try {
    for (const record of list) {
      if (!(await post(record))) break;
      sent++;
    }
    // Re-read: a review may have been added while these were sending.
    if (sent) writeQueue(readQueue().slice(sent));
  } finally {
    flushing = false;
  }
  return sent;
}

/** Sends the backlog now, and again whenever the connection comes back. */
export function startReviewSync(): () => void {
  const onOnline = () => void flushQueue();
  window.addEventListener("online", onOnline);
  void flushQueue();
  return () => window.removeEventListener("online", onOnline);
}
