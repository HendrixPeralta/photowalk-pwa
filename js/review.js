// Demo feedback: a short review, queued on the device, posted when there's a
// network to post it over.
//
// Every other module in PhotoWalk is self-contained — photos, stats and history
// never leave the phone. This one is the deliberate exception, and it is kept
// as narrow as the job allows: it sends only what the person typed, it sends it
// one way, and it never reads anything back. No identifiers, no telemetry, no
// photo data.
//
// The form lives in a modal rather than on a screen of its own, so the top-bar
// button can reach it from wherever the demo happens to be — the moment someone
// wants to say something is the moment they have just seen something, and
// making them navigate to Settings first loses most of them.
//
// The queue lives under its own localStorage key rather than inside the state
// blob, because demo.js parks and restores that blob wholesale — a review
// written during a demo would evaporate the moment someone pressed
// "Restore mine".

import { showToast } from './toast.js';
import { openModal, closeModal } from './modal.js';

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
const LANG_KEY = 'photowalk:review-lang';
const MAX_QUEUED = 25; // a queue longer than this is a bug, not a busy room
const MAX_TEXT = 2000;
const MAX_NAME = 80;
const TIMEOUT_MS = 8000;

const LEVEL_KEYS = ['beginner', 'hobbyist', 'pro'];
const FEATURE_KEYS = ['walk-guide', 'progress-track', 'rewards', 'analysis-tools', 'photo-sharing'];

// Chip-based answers (level, features) are stored and submitted by key, so
// they read the same in the sheet no matter which language filled the form
// out. Only the free-text fields and the on-screen labels change with `lang`.
const STRINGS = {
  en: {
    toggleLabel: 'EN',
    feedback: 'Feedback',
    title: 'Leave a review',
    subtitle: "Tried PhotoWalk? A few taps tells us more than you'd think.",
    ratingAria: 'Rating out of five',
    levelLabel: 'Your photography level',
    levels: { beginner: 'Beginner', hobbyist: 'Hobbyist', pro: 'Pro' },
    featuresLabel: 'Which features did you find most useful?',
    featuresHint: '(pick any that apply)',
    features: {
      'walk-guide': 'Walk guide',
      'progress-track': 'Progress track',
      rewards: 'Rewards',
      'analysis-tools': 'Analysis tools',
      'photo-sharing': 'Photo sharing with friends'
    },
    improveLabel: "Something you'd like to improve?",
    optionalHint: '(optional)',
    improvePlaceholder: 'What would you improve?',
    problemLabel: 'Another problem this could help you solve?',
    problemPlaceholder: 'What is it?',
    namePlaceholder: 'Name (optional)',
    send: 'Send review',
    privacy: "Held on this device and sent when you are online. Only what's above is sent — never your photos or your practice history.",
    blank: 'Add a rating or an answer first.',
    pendingOne: '1 review is waiting to send.',
    pendingMany: (n) => `${n} reviews are waiting to send.`,
    thanks: 'Thanks — your review has been recorded.'
  },
  ja: {
    toggleLabel: 'JA',
    feedback: 'フィードバック',
    title: 'レビューを書く',
    subtitle: 'PhotoWalkを試しましたか?少しの回答でとても参考になります。',
    ratingAria: '5段階評価',
    levelLabel: '写真のレベル',
    levels: { beginner: '初心者', hobbyist: '趣味', pro: 'プロ' },
    featuresLabel: 'どの機能が役に立ちましたか?',
    featuresHint: '(複数選択可)',
    features: {
      'walk-guide': '散歩ガイド',
      'progress-track': '進捗トラッキング',
      rewards: '報酬',
      'analysis-tools': '分析ツール',
      'photo-sharing': '友達と写真を共有'
    },
    improveLabel: '改善してほしい点はありますか?',
    optionalHint: '(任意)',
    improvePlaceholder: '改善してほしい点を教えてください',
    problemLabel: '解決してほしい他の問題はありますか?',
    problemPlaceholder: '内容を教えてください',
    namePlaceholder: 'お名前(任意)',
    send: 'レビューを送信',
    privacy: 'この内容は端末に保存され、オンライン時に送信されます。送信されるのは上記の内容のみで、写真や利用履歴が送信されることはありません。',
    blank: '評価または回答を入力してください。',
    pendingOne: '1件のレビューが送信待ちです。',
    pendingMany: (n) => `${n}件のレビューが送信待ちです。`,
    thanks: 'ありがとうございました — レビューを受け付けました。'
  }
};

// Only set while the modal is open; every other entry point has to cope with
// there being no form on screen.
let els = null;
let rating = 0;
let level = '';
let features = new Set();
let lang = 'en';
let flushing = false;

export function initReview() {
  [document.getElementById('reviewTopBtn'), document.getElementById('reviewOpenBtn')]
    .forEach((btn) => btn && btn.addEventListener('click', openReviewModal));

  lang = localStorage.getItem(LANG_KEY) === 'ja' ? 'ja' : 'en';

  // A review written on venue wifi that drops mid-tap is the whole reason the
  // queue exists; retry as soon as the browser says it has a connection again.
  window.addEventListener('online', () => flushQueue());

  flushQueue();
}

/* ---------- The form ---------- */

export function openReviewModal() {
  rating = 0;
  level = '';
  features = new Set();
  renderForm();
}

/** Rebuilds the modal markup for the current `lang`, keeping whatever the
 * chip state (rating/level/features) already holds and reusing the free-text
 * field values so switching language mid-entry doesn't lose what was typed. */
function renderForm() {
  const t = STRINGS[lang];
  const prevImprove = els ? els.improveText.value : '';
  const prevProblem = els ? els.problemText.value : '';
  const prevName = els ? els.name.value : '';

  openModal(`
    <div class="review-modal-head">
      <span class="label-caps" style="color:var(--accent-strong)">${t.feedback}</span>
      <div id="reviewLangToggle" class="review-lang-toggle" role="group" aria-label="Language"></div>
    </div>
    <h3 class="subsection-title" style="margin-top:6px">${t.title}</h3>
    <p class="muted card-text">${t.subtitle}</p>

    <div id="reviewStars" class="review-stars" role="radiogroup" aria-label="${t.ratingAria}"></div>

    <span class="label-caps review-field-label">${t.levelLabel}</span>
    <div id="reviewLevel" class="review-chip-row" role="radiogroup" aria-label="${t.levelLabel}"></div>

    <span class="label-caps review-field-label">${t.featuresLabel} <span class="review-field-hint">${t.featuresHint}</span></span>
    <div id="reviewFeatures" class="review-chip-row" role="group" aria-label="${t.featuresLabel}"></div>

    <span class="label-caps review-field-label">${t.improveLabel} <span class="review-field-hint">${t.optionalHint}</span></span>
    <label class="sr-only" for="reviewImproveText">${t.improveLabel}</label>
    <textarea id="reviewImproveText" class="text-input review-text" rows="2" maxlength="${MAX_TEXT}"
      placeholder="${t.improvePlaceholder}"></textarea>

    <span class="label-caps review-field-label">${t.problemLabel} <span class="review-field-hint">${t.optionalHint}</span></span>
    <label class="sr-only" for="reviewProblemText">${t.problemLabel}</label>
    <textarea id="reviewProblemText" class="text-input review-text" rows="2" maxlength="${MAX_TEXT}"
      placeholder="${t.problemPlaceholder}"></textarea>

    <label class="sr-only" for="reviewName">${t.namePlaceholder}</label>
    <input type="text" id="reviewName" class="text-input" maxlength="${MAX_NAME}" placeholder="${t.namePlaceholder}">

    <!-- Honeypot: a real person never fills in a field they cannot see. -->
    <input type="text" id="reviewWebsite" class="review-hp" tabindex="-1" autocomplete="off" aria-hidden="true">

    <button type="button" id="reviewSendBtn" class="btn btn-accent btn-block">${t.send}</button>
    <p id="reviewStatus" class="hint review-hint"></p>
    <p class="hint review-hint">${t.privacy}</p>
  `, { onClose: forgetForm });

  els = {
    stars: document.getElementById('reviewStars'),
    langToggle: document.getElementById('reviewLangToggle'),
    level: document.getElementById('reviewLevel'),
    features: document.getElementById('reviewFeatures'),
    improveText: document.getElementById('reviewImproveText'),
    problemText: document.getElementById('reviewProblemText'),
    name: document.getElementById('reviewName'),
    honeypot: document.getElementById('reviewWebsite'),
    send: document.getElementById('reviewSendBtn'),
    status: document.getElementById('reviewStatus')
  };

  els.improveText.value = prevImprove;
  els.problemText.value = prevProblem;
  els.name.value = prevName;

  buildLangToggle();
  buildStars();
  buildChipGroup(els.level, LEVEL_KEYS.map((key) => ({ key, label: t.levels[key] })), {
    multi: false,
    isActive: (key) => key === level,
    onChange: (value, on) => { level = on ? value : ''; }
  });
  buildChipGroup(els.features, FEATURE_KEYS.map((key) => ({ key, label: t.features[key] })), {
    multi: true,
    isActive: (key) => features.has(key),
    onChange: (value, on) => {
      if (on) features.add(value); else features.delete(value);
    }
  });
  els.send.addEventListener('click', submit);
  reportBacklog();
}

function buildLangToggle() {
  els.langToggle.innerHTML = '';
  ['en', 'ja'].forEach((code) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip-btn' + (lang === code ? ' active' : '');
    btn.textContent = STRINGS[code].toggleLabel;
    btn.setAttribute('aria-pressed', String(lang === code));
    btn.addEventListener('click', () => setLang(code));
    els.langToggle.appendChild(btn);
  });
}

function setLang(code) {
  if (lang === code) return;
  lang = code;
  localStorage.setItem(LANG_KEY, lang);
  renderForm();
}

/** The modal wipes its own markup on close, so drop the stale element refs. */
function forgetForm() {
  els = null;
  rating = 0;
  level = '';
  features = new Set();
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
  if (!els) return;
  els.stars.querySelectorAll('.review-star').forEach((btn) => {
    const on = Number(btn.dataset.value) <= rating;
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-checked', on && Number(btn.dataset.value) === rating ? 'true' : 'false');
  });
}

/* ---------- Chip groups (level / features) ---------- */

/**
 * A single-select (`multi: false`, radio semantics — tapping the active chip
 * clears it) or multi-select (`multi: true`, checkbox semantics) row of
 * `.chip-btn`s. `onChange` fires with `(key)` for single-select or
 * `(key, isNowOn)` for multi-select. `isActive(key)` seeds which chips start
 * checked — needed when a language switch rebuilds a group that already had
 * a selection.
 */
function buildChipGroup(container, options, { multi, onChange, isActive }) {
  container.innerHTML = '';
  options.forEach((opt) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip-btn';
    btn.textContent = opt.label;
    btn.dataset.value = opt.key;
    btn.setAttribute('role', multi ? 'checkbox' : 'radio');
    const active = isActive ? isActive(opt.key) : false;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-checked', String(active));
    btn.addEventListener('click', () => {
      const nowOn = !btn.classList.contains('active');
      if (multi) {
        btn.classList.toggle('active', nowOn);
        btn.setAttribute('aria-checked', String(nowOn));
      } else {
        container.querySelectorAll('.chip-btn').forEach((other) => {
          const otherOn = other === btn && nowOn;
          other.classList.toggle('active', otherOn);
          other.setAttribute('aria-checked', String(otherOn));
        });
      }
      onChange(opt.key, nowOn);
    });
    container.appendChild(btn);
  });
}

/* ---------- Submit ---------- */

function submit() {
  if (!els) return;
  const improveText = (els.improveText.value || '').trim().slice(0, MAX_TEXT);
  const problemText = (els.problemText.value || '').trim().slice(0, MAX_TEXT);
  const name = (els.name.value || '').trim().slice(0, MAX_NAME);
  // Always submitted in English, regardless of `lang`, so the sheet reads the
  // same no matter which language the form was filled out in.
  const featureLabels = FEATURE_KEYS.filter((key) => features.has(key)).map((key) => STRINGS.en.features[key]);

  if (!rating && !level && !featureLabels.length && !improveText && !problemText) {
    setStatus(STRINGS[lang].blank);
    return;
  }

  // Honeypot tripped. Close on the usual note, so a bot gets no signal about
  // why nothing was recorded.
  if (els.honeypot && els.honeypot.value) {
    finish();
    return;
  }

  enqueue({
    source: 'photowalk-demo',
    submittedAt: new Date().toISOString(),
    rating: rating || null,
    level,
    features: featureLabels.join(', '),
    improveText,
    problemText,
    name
  });

  finish();
  flushQueue();
}

function finish() {
  closeModal(); // fires forgetForm()
  showToast(STRINGS[lang].thanks);
}

function setStatus(message) {
  if (els && els.status) els.status.textContent = message || '';
}

function reportBacklog() {
  if (!els) return;
  const pending = readQueue().length;
  if (!pending) { setStatus(''); return; }
  setStatus(pending === 1 ? STRINGS[lang].pendingOne : STRINGS[lang].pendingMany(pending));
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
