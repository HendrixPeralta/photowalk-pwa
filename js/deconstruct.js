/**
 * The written half of the Analysis screen: the tonal-key verdict and the
 * colour gamut deconstruction, plus the takeaway paragraph the export sheet
 * prints.
 *
 * All of it is rule-based arithmetic over the histogram, the palette and the
 * EXIF block — the same numbers already on screen, phrased. Nothing is sent
 * anywhere and no model is consulted; if the numbers don't support a claim,
 * the claim isn't made.
 */

import { rgbToHex, escapeHtml } from './util.js';
import { paletteRelationship, joinSentences } from './interpret.js';
import { t } from './i18n.js';
import { showToast } from './toast.js';

let els = {};

export function initDeconstruct() {
  els = {
    frameLabel: document.getElementById('analyzeFrameLabel'),
    tonalNote: document.getElementById('tonalKeyNote'),
    tonalTitle: document.getElementById('tonalKeyTitle'),
    tonalTag: document.getElementById('tonalKeyTag'),
    tonalText: document.getElementById('tonalKeyText'),
    gamutBar: document.getElementById('gamutBar'),
    harmonyRow: document.getElementById('harmonyRow'),
    harmonyName: document.getElementById('harmonyName')
  };

  els.gamutBar.addEventListener('click', (e) => {
    const swatch = e.target.closest('.gamut-bar-swatch');
    if (!swatch) return;
    const hex = swatch.dataset.hex;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(hex).then(() => showToast(t('Copied {hex}', { hex }))).catch(() => showToast(hex));
    } else {
      showToast(hex);
    }
  });
}

/* ---------- Tonal key ---------- */


/**
 * Names the tonal key from the histogram's shadow/mid/highlight split.
 * `phrase` is the title as it reads mid-sentence (lowercased in English), so
 * the takeaway never has to lowercase a translated string.
 */
export function tonalKey(summary) {
  const { shadows, highs } = summary;
  if (shadows > 0.5) return { title: t('Low-key (mostly dark)'), phrase: t('low-key (mostly dark)'), tag: t('Moody') };
  if (highs > 0.5) return { title: t('High-key (mostly bright)'), phrase: t('high-key (mostly bright)'), tag: t('Airy') };
  if (shadows > 0.28 && highs > 0.28) return { title: t('High contrast'), phrase: t('high contrast'), tag: t('Punchy') };
  if (shadows < 0.08 && highs < 0.08) return { title: t('Low contrast'), phrase: t('low contrast'), tag: t('Soft') };
  return { title: t('Balanced'), phrase: t('balanced'), tag: t('Even') };
}

/** Share of the frame sitting in the very first and very last histogram bin. */
export function clipShares(bins) {
  const total = bins.reduce((sum, b) => sum + b.lum, 0) || 1;
  return { black: bins[0].lum / total, white: bins[63].lum / total };
}

export function renderTonalKey(bins, summary) {
  if (!els.tonalNote) return;
  const key = tonalKey(summary);
  const clip = clipShares(bins);

  els.tonalTitle.textContent = t('Tonal key: {title}', { title: key.title });
  els.tonalTag.textContent = key.tag;

  const dominant = summary.shadows >= summary.highs
    ? t('{pct}% of the photo is in the darker tones.', { pct: Math.round(summary.shadows * 100) })
    : t('{pct}% of the photo is in the brighter tones.', { pct: Math.round(summary.highs * 100) });

  const clipLine = t('Pure black: {black}% · pure white: {white}%.', {
    black: (clip.black * 100).toFixed(1),
    white: (clip.white * 100).toFixed(1)
  });
  els.tonalText.textContent = joinSentences([dominant, clipLine, summary.caption]);
  els.tonalNote.classList.remove('hidden');
}

/* ---------- Colour gamut ---------- */

/**
 * Turns the extracted palette into clusters with a percentage share.
 * The shares are relative to the extracted clusters, not the whole frame —
 * quantisation leaves colours outside every cluster — so they always total 100.
 */
export function gamutClusters(palette) {
  const counts = palette.map((c) => c.count || 1);
  const total = counts.reduce((a, b) => a + b, 0) || 1;
  return palette.map((c, i) => ({
    hex: rgbToHex(c.r, c.g, c.b),
    share: counts[i] / total,
    role: roleFor(c, i)
  }));
}

/** A short stamped label for each cluster: DOM, BASE, TUNG, RIM… */
function roleFor(c, index) {
  const lum = (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;
  const max = Math.max(c.r, c.g, c.b), min = Math.min(c.r, c.g, c.b);
  const sat = max === 0 ? 0 : (max - min) / max;
  if (index === 0) return 'DOM';
  if (lum > 0.82) return 'SPEC';
  if (lum < 0.12) return 'BLACK';
  if (sat < 0.15) return 'BASE';
  if (c.r > c.b && lum > 0.5) return 'RIM';
  if (c.r > c.b) return 'WARM';
  return 'COOL';
}

export function renderGamut(palette) {
  if (!els.gamutBar) return;
  const clusters = gamutClusters(palette);

  els.gamutBar.innerHTML = clusters.map((c) => `
    <button type="button" class="gamut-bar-swatch" style="background:${c.hex};width:${(c.share * 100).toFixed(2)}%" data-hex="${c.hex}" title="${t('{hex}, {pct}%. Click to copy.', { hex: c.hex, pct: Math.round(c.share * 100) })}">
      <span class="gamut-bar-hex">${escapeHtml(c.hex)}</span>
    </button>`).join('');

  if (palette.length) {
    const rel = paletteRelationship(palette);
    els.harmonyName.textContent = rel.label;
    els.harmonyRow.hidden = false;
  } else {
    els.harmonyRow.hidden = true;
  }
  return clusters;
}

/* ---------- Takeaway ---------- */

/**
 * One paragraph tying the exposure decisions to what the frame looks like.
 * Every clause is guarded by the measurement that justifies it, so a photo
 * with no EXIF simply gets a shorter note rather than an invented one.
 */
export function takeawayText(palette, summary, exif) {
  const key = tonalKey(summary);
  const rel = palette.length ? paletteRelationship(palette) : null;
  const parts = [];

  if (exif && exif.aperture && exif.shutter) {
    const at = [exif.shutter, exif.aperture.replace('f/', 'ƒ/'), exif.iso].filter(Boolean).join(' · ');
    parts.push(t('Shot at {at}, the photo comes out {key}.', { at, key: key.phrase }));
  } else {
    parts.push(t('The photo comes out {key}.', { key: key.phrase }));
  }

  if (summary.shadows > 0.5) {
    parts.push(t('Most of the scene falls into darkness, so whatever is lit becomes the focus.'));
  } else if (summary.highs > 0.5) {
    parts.push(t('Tones are bright and airy. That softens texture but keeps the subject easy to see against a light background.'));
  } else if (summary.shadows > 0.28 && summary.highs > 0.28) {
    parts.push(t('Strong darks and brights with little in between make shapes and edges stand out.'));
  }

  if (summary.clippedWhite) parts.push(t("Some bright areas are pure white, and editing can't bring that detail back."));
  if (summary.clippedBlack) parts.push(t('Some dark areas are pure black, with no detail left to brighten.'));

  // The label is already translated; lowercasing only affects English.
  if (rel) parts.push(t('Color: {harmony}.', { harmony: rel.label.toLowerCase() }), rel.caption);

  if (exif && exif.focalMm) {
    const wide = exif.focalMm < 35;
    parts.push(wide
      ? t('At {focal} (wide), you were close enough for the foreground to play a big part.', { focal: exif.focalLength })
      : t('At {focal} (zoomed in), the background looks pulled closer, stacking the layers together.', { focal: exif.focalLength }));
  }

  return joinSentences(parts);
}

/* ---------- Reset ---------- */

export function clearDeconstruct() {
  if (!els.tonalNote) return;
  els.tonalNote.classList.add('hidden');
  els.tonalNote.open = false;
  els.harmonyRow.hidden = true;
  els.gamutBar.innerHTML = '';
}
