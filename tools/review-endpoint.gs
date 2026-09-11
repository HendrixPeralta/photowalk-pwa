/**
 * PhotoWalk demo review collector — Google Apps Script.
 *
 * Appends one row per review to a Google Sheet. Free, no server to run, and
 * nothing secret ships to the browser: the /exec URL is an append-only write
 * endpoint, so publishing it costs you nothing worse than the spam a honeypot
 * and a rate limit are here to blunt.
 *
 * ---- Deploying ----------------------------------------------------------
 * 1. Create a spreadsheet (sheets.new) — the tab can stay "Sheet1".
 * 2. Extensions -> Apps Script. Delete the placeholder, paste this file, save.
 * 3. Deploy -> New deployment -> gear icon -> Web app.
 *      Execute as:     Me
 *      Who has access: Anyone          <-- NOT "Anyone with a Google account"
 * 4. Authorise when prompted (it is your own script writing to your own sheet;
 *    the "unverified app" screen is expected — Advanced -> Go to project).
 * 5. Copy the deployment URL. It ends in /exec.
 * 6. Paste it into ENDPOINT at the top of js/review.js.
 *
 * Open the /exec URL in a browser to sanity-check: it should answer with
 * {"ok":true,"service":"photowalk-reviews"}.
 *
 * Re-deploying after an edit: Deploy -> Manage deployments -> pencil ->
 * Version: New version. Keeping the same deployment keeps the same URL.
 * -------------------------------------------------------------------------
 */

var SHEET_NAME = 'Reviews';
var HEADERS = [
  'Received', 'Submitted (device)', 'Rating', 'Photography level', 'Features',
  'Improve', 'Problem', 'Name', 'Source'
];

var MAX_TEXT = 4000;
var MAX_NAME = 120;
var MAX_FEATURES = 300;
var LEVELS = ['beginner', 'hobbyist', 'pro'];

// Crude flood guard: no more than this many rows in a rolling window. A class
// of thirty submitting at once passes; a script hammering the URL does not.
var RATE_LIMIT_ROWS = 60;
var RATE_LIMIT_WINDOW_MS = 60 * 1000;

function doPost(e) {
  // Two people tapping Send at the same instant would otherwise race for the
  // same row. Thirty of them will, at the end of a presentation.
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (err) {
    return json({ ok: false, error: 'busy' });
  }

  try {
    if (!e || !e.postData || !e.postData.contents) return json({ ok: false, error: 'empty' });

    var data = JSON.parse(e.postData.contents);

    // Honeypot tripped. Answer as though it worked so a bot learns nothing.
    if (data.website) return json({ ok: true });

    var rating = Number(data.rating);
    if (!(rating >= 1 && rating <= 5)) rating = '';

    var level = LEVELS.indexOf(data.level) >= 0 ? data.level : '';
    var features = trim(data.features, MAX_FEATURES);
    var improveText = trim(data.improveText, MAX_TEXT);
    var problemText = trim(data.problemText, MAX_TEXT);
    var name = trim(data.name, MAX_NAME);

    if (!rating && !level && !features && !improveText && !problemText) return json({ ok: false, error: 'blank' });

    var sheet = ensureSheet();
    if (isFlooding(sheet)) return json({ ok: false, error: 'rate-limited' });

    sheet.appendRow([
      new Date(),
      trim(data.submittedAt, 40),
      rating,
      level,
      features,
      improveText,
      problemText,
      name,
      trim(data.source, 40)
    ]);

    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/** So you can confirm the deployment is live by opening the URL. */
function doGet() {
  return json({ ok: true, service: 'photowalk-reviews' });
}

function ensureSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(5, 260); // Features
    sheet.setColumnWidth(6, 420); // Improve
    sheet.setColumnWidth(7, 420); // Problem
  }
  return sheet;
}

/** True when the most recent rows arrived too fast to be a room full of people. */
function isFlooding(sheet) {
  var last = sheet.getLastRow();
  if (last <= RATE_LIMIT_ROWS) return false;
  var probe = sheet.getRange(last - RATE_LIMIT_ROWS + 1, 1).getValue();
  if (!(probe instanceof Date)) return false;
  return (Date.now() - probe.getTime()) < RATE_LIMIT_WINDOW_MS;
}

function trim(value, max) {
  return String(value == null ? '' : value).slice(0, max);
}

function json(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
