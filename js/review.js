// Demo feedback: a short review, queued on the device, posted when there's a
// network to post it over.
//
// Every other module in PhotoWalk is self-contained — photos, stats and history
// never leave the phone. This one is the deliberate exception, and it is kept
// as narrow as the job allows: it sends only what the person typed, it sends it
// one way, and it never reads anything back. No identifiers, no telemetry, no
// photo data.
//
// The queue lives under its own localStorage key rather than inside the state
// blob, because demo.js parks and restores that blob wholesale — a review
// written during a demo would evaporate the moment someone pressed
// "Restore mine".

import { showToast } from './toast.js';

// The Apps Script web app from tools/review-endpoint.gs. Public on purpose:
// it is append-only, so the worst it can leak is the ability to add a row.
//
// Blanking this is a safe state rather than a broken one — the form still
// works and reviews still queue, and the backlog goes out on the first load
// after a URL comes back.
//
// Re-deploying the script under "New deployment" mints a *different* /exec
// URL and leaves this one pinned to the old code; use Manage deployments ->
// edit -> New version to keep this URL working.
const ENDPOINT = 'https://script.google.com/macros/s/AKfycbwPZC5YSPUaSVIuMKn6FZCd0dbHcwmqv2ksedbLDC2fnxo0CAYMd_faEAHaHGNgO63QVw/exec';

const QUEUE_KEY = 'photowalk:review-queue';
const MAX_QUEUED = 25; // a queue longer than this is a bug, not a busy room
const MAX_TEXT = 2000;
const MAX_NAME = 80;
const TIMEOUT_MS = 8000;

let els = null;
let rating = 0;
let flushing = false;

export function initReview() {
  els = {
    stars: document.getElementById('reviewStars'),
    text: document.getElementById('reviewText'),
    name: document.getElementById('reviewName'),
    honeypot: document.getElementById('reviewWebsite'),
    send: document.getElementById('reviewSendBtn'),
    status: document.getElementById('reviewStatus')
  };
  if (!els.stars || !els.send) return; // markup not on this build

  buildStars();
  els.send.addEventListener('click', submit);

  // A review written on venue wifi that drops mid-tap is the whole reason the
  // queue exists; retry as soon as the browser says it has a connection again.
  window.addEventListener('online', () => flushQueue());

  reportBacklog();
  flushQueue();
}

/* ---------- Rating ---------- */

function buildStars() {
  els.stars.innerHTML = '';
  for (let n = 1; n <= 5; n += 1) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'review-star';
    btn.textContent = '★';
    btn.dataset.value = String(n);
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-checked', 'false');
    btn.setAttribute('aria-label', n === 1 ? '1 star' : `${n} stars`);
    btn.addEventListener('click', () => setRating(n));
    els.stars.appendChild(btn);
  }
  paintStars();
}

function setRating(value) {
  // Tapping the current rating clears it, so a misfire isn't permanent.
  rating = rating === value ? 0 : value;
  paintStars();
}

function paintStars() {
  els.stars.querySelectorAll('.review-star').forEach((btn) => {
    const on = Number(btn.dataset.value) <= rating;
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-checked', on && Number(btn.dataset.value) === rating ? 'true' : 'false');
  });
}

/* ---------- Submit ---------- */

function submit() {
  const text = (els.text.value || '').trim().slice(0, MAX_TEXT);
  const name = (els.name.value || '').trim().slice(0, MAX_NAME);

  if (!rating && !text) {
    setStatus('Add a rating or a few words first.');
    return;
  }

  // Honeypot: a real person never fills in a field they cannot see. Accept the
  // submission silently so a bot gets no signal about why it failed.
  if (els.honeypot && els.honeypot.value) {
    resetForm();
    showToast('Thanks — your review has been recorded.');
    return;
  }

  enqueue({
    source: 'photowalk-demo',
    submittedAt: new Date().toISOString(),
    rating: rating || null,
    text,
    name
  });

  resetForm();
  showToast('Thanks — your review has been recorded.');
  flushQueue();
}

function resetForm() {
  rating = 0;
  paintStars();
  els.text.value = '';
  els.name.value = '';
}

function setStatus(message) {
  if (els && els.status) els.status.textContent = message || '';
}

function reportBacklog() {
  const pending = readQueue().length;
  if (!pending) { setStatus(''); return; }
  setStatus(pending === 1
    ? '1 review is waiting to send.'
    : `${pending} reviews are waiting to send.`);
}

/* ---------- Queue ---------- */

function readQueue() {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (err) {
    return [];
  }
}

function writeQueue(list) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(list));
    return true;
  } catch (err) {
    console.warn('PhotoWalk: the review queue could not be saved.', err);
    return false;
  }
}

function enqueue(record) {
  const list = readQueue();
  list.push(record);
  // Drop from the front: if something has gone wrong, the oldest stuck review
  // is the least interesting one to keep.
  writeQueue(list.slice(-MAX_QUEUED));
  reportBacklog();
}

/**
 * Drains the queue oldest-first, stopping at the first failure so ordering
 * survives and nothing is sent twice.
 */
async function flushQueue() {
  if (flushing || !ENDPOINT) return;
  if (!navigator.onLine) return;

  const list = readQueue();
  if (!list.length) return;

  flushing = true;
  try {
    let sent = 0;
    for (const record of list) {
      const ok = await postReview(record);
      if (!ok) break;
      sent += 1;
    }
    if (sent) writeQueue(readQueue().slice(sent));
  } finally {
    flushing = false;
    reportBacklog();
  }
}

/**
 * Posts one review.
 *
 * `no-cors` with a text/plain body is what keeps this a simple request, so the
 * browser skips the preflight that an Apps Script endpoint won't answer. The
 * cost is that the response is opaque: a resolved fetch means "the request
 * left the device", not "the row reached the sheet". Only a network-level
 * failure is detectable, which is the one the queue exists to survive — so
 * that's the trade taken here. Watch the sheet during a live demo rather than
 * trusting the toast.
 */
function postReview(record) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  return fetch(ENDPOINT, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(record),
    signal: controller.signal
  })
    .then(() => true)
    .catch(() => false)
    .finally(() => clearTimeout(timer));
}
