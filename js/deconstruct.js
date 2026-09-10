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
import { paletteRelationship, SHADOW_END, HIGHLIGHT_START } from './interpret.js';
import { showToast } from './toast.js';

let els = {};

export function initDeconstruct() {
  els = {
    frameLabel: document.getElementById('analyzeFrameLabel'),
    frameNo: document.getElementById('analyzeFrameNo'),
    tonalNote: document.getElementById('tonalKeyNote'),
    tonalTitle: document.getElementById('tonalKeyTitle'),
    tonalTag: document.getElementById('tonalKeyTag'),
    tonalText: document.getElementById('tonalKeyText'),
    gamutCount: document.getElementById('gamutCount'),
    gamutBar: document.getElementById('gamutBar'),
    gamutSpecs: document.getElementById('gamutSpecs'),
    harmonyRow: document.getElementById('harmonyRow'),
    harmonyName: document.getElementById('harmonyName')
  };

  els.gamutSpecs.addEventListener('click', (e) => {
    const spec = e.target.closest('.gamut-spec');
    if (!spec) return;
    const hex = spec.dataset.hex;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(hex).then(() => showToast(`Copied ${hex}`)).catch(() => showToast(hex));
    } else {
      showToast(hex);
    }
  });
}

/* ---------- Tonal key ---------- */

// Level ranges the histogram bins actually cover, so the copy can quote them.
const SHADOW_TOP = Math.round((SHADOW_END / 64) * 255);
const HIGHLIGHT_FLOOR = Math.round((HIGHLIGHT_START / 64) * 255);

/** Names the tonal key from the histogram's shadow/mid/highlight split. */
export function tonalKey(summary) {
  const { shadows, highs } = summary;
  if (shadows > 0.5) return { title: 'Low-key / Chiaroscuro', tag: 'Decisive' };
  if (highs > 0.5) return { title: 'High-key / Airy', tag: 'Open' };
  if (shadows > 0.28 && highs > 0.28) return { title: 'High contrast / Graphic', tag: 'Hard' };
  if (shadows < 0.08 && highs < 0.08) return { title: 'Flat, low contrast', tag: 'Soft' };
  return { title: 'Balanced key', tag: 'Neutral' };
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

  els.tonalTitle.textContent = `Tonal key: ${key.title}`;
  els.tonalTag.textContent = key.tag;

  const dominant = summary.shadows >= summary.highs
    ? `${Math.round(summary.shadows * 100)}% of the frame sits in the shadows (levels 0–${SHADOW_TOP})`
    : `${Math.round(summary.highs * 100)}% of the frame sits in the highlights (levels ${HIGHLIGHT_FLOOR}–255)`;

  const clipLine = `Clipped shadow ${(clip.black * 100).toFixed(1)}% · clipped highlight ${(clip.white * 100).toFixed(1)}%.`;
  els.tonalText.textContent = `${dominant}. ${clipLine} ${summary.caption}`;
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

  els.gamutCount.textContent = `${clusters.length} cluster${clusters.length === 1 ? '' : 's'}`;
  els.gamutBar.innerHTML = clusters
    .map((c) => `<span style="background:${c.hex};width:${(c.share * 100).toFixed(2)}%" title="${c.hex} — ${Math.round(c.share * 100)}%"></span>`)
    .join('');

  els.gamutSpecs.innerHTML = clusters.map((c) => `
    <div class="gamut-spec" data-hex="${c.hex}" title="Copy ${c.hex}">
      <span class="gamut-spec-chip" style="background:${c.hex}"></span>
      <span class="gamut-spec-hex">${escapeHtml(c.hex)}</span>
      <span class="gamut-spec-pct">${Math.round(c.share * 100)}% ${c.role}</span>
    </div>`).join('');

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
    parts.push(`Shot at ${at}, the frame lands as ${key.title.toLowerCase()}.`);
  } else {
    parts.push(`The frame reads as ${key.title.toLowerCase()}.`);
  }

  if (summary.shadows > 0.5) {
    parts.push('Ambient detail is crushed into the blacks, so whatever is still lit carries the whole composition.');
  } else if (summary.highs > 0.5) {
    parts.push('Tones sit high and open, which flattens texture but keeps the subject legible against a bright ground.');
  } else if (summary.shadows > 0.28 && summary.highs > 0.28) {
    parts.push('Darks and brights both hold weight with little between them — the frame is carried by edges, not gradients.');
  }

  if (summary.clippedWhite) parts.push('Highlights are clipped: those areas will not recover in post.');
  if (summary.clippedBlack) parts.push('Shadows are crushed: there is no detail left to lift.');

  if (rel) parts.push(`Colour reads as ${rel.label.toLowerCase()} — ${rel.caption.charAt(0).toLowerCase()}${rel.caption.slice(1)}`);

  if (exif && exif.focalMm) {
    const wide = exif.focalMm < 35;
    parts.push(wide
      ? `At ${exif.focalLength} you were close enough for the foreground to do the work.`
      : `At ${exif.focalLength} the background compresses, which is what stacks the layers together.`);
  }

  return parts.join(' ');
}

/* ---------- Header + reset ---------- */

export function setFrameLabel(index) {
  if (!els.frameNo) return;
  els.frameNo.textContent = index === null ? 'NO FRAME' : `FRAME #${String(index).padStart(3, '0')}`;
}

export function clearDeconstruct() {
  if (!els.tonalNote) return;
  els.tonalNote.classList.add('hidden');
  els.harmonyRow.hidden = true;
  els.gamutBar.innerHTML = '';
  els.gamutSpecs.innerHTML = '';
  els.gamutCount.textContent = '0 clusters';
  setFrameLabel(null);
}
