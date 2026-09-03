// Plain-language readings of the numbers the analysis suite already computes.
// Deliberately rule-based (a PRD non-goal is "no AI"): every caption traces
// back to an explicit threshold a curious user could verify by eye.

import { rgbToHsl, nearestColorName } from './util.js';

// The 64 luminance bins cover levels 0-255; quarter marks give the classic
// shadows / midtones / highlights split photographers read on a histogram.
// Exported so the histogram renderer draws its region bands at the same marks.
export const SHADOW_END = 16; // bins 0-15  -> levels 0-63
export const HIGHLIGHT_START = 48; // bins 48-63 -> levels 192-255
const CLIP_SHARE = 0.02; // an edge bin holding >2% of pixels means lost detail

/**
 * Reads a { bins } histogram (from computeHistogram) into region shares and a
 * caption a beginner can act on.
 */
export function histogramSummary(bins) {
  const total = bins.reduce((sum, b) => sum + b.lum, 0) || 1;
  const share = (from, to) => bins.slice(from, to).reduce((sum, b) => sum + b.lum, 0) / total;

  const shadows = share(0, SHADOW_END);
  const mids = share(SHADOW_END, HIGHLIGHT_START);
  const highs = share(HIGHLIGHT_START, 64);
  const clippedBlack = bins[0].lum / total > CLIP_SHARE;
  const clippedWhite = bins[63].lum / total > CLIP_SHARE;

  let base;
  if (shadows > 0.5) base = 'Low-key image — most tones sit in the shadows.';
  else if (highs > 0.5) base = 'High-key image — most tones sit in the highlights.';
  else if (shadows > 0.28 && highs > 0.28) base = 'High contrast — strong darks and brights with few midtones.';
  else if (shadows < 0.08 && highs < 0.08) base = 'Flat, low-contrast light — tones cluster in the midtones.';
  else base = 'Balanced exposure across the tonal range.';

  const parts = [base];
  if (clippedWhite) parts.push('Highlights are clipped: pure-white areas have lost detail.');
  if (clippedBlack) parts.push('Shadows are crushed: pure-black areas have lost detail.');

  return { shadows, mids, highs, clippedBlack, clippedWhite, caption: parts.join(' ') };
}

/** Shortest distance between two hue angles, in degrees (0-180). */
function hueDistance(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** Weighted circular mean of hue angles. */
function meanHue(hues) {
  let x = 0, y = 0;
  for (const { h, weight } of hues) {
    x += Math.cos((h * Math.PI) / 180) * weight;
    y += Math.sin((h * Math.PI) / 180) * weight;
  }
  let deg = (Math.atan2(y, x) * 180) / Math.PI;
  if (deg < 0) deg += 360;
  return deg;
}

/**
 * Names the color relationship in a palette from computePalette
 * ([{ r, g, b, count }]) — the difference between showing colors and
 * teaching color. Returns { label, caption }.
 */
export function paletteRelationship(palette) {
  const chromatic = (palette || [])
    .map((c) => ({ ...rgbToHsl(c.r, c.g, c.b), weight: c.count || 1, rgb: c }))
    .filter((c) => c.s >= 0.15 && c.l > 0.08 && c.l < 0.95);

  if (chromatic.length === 0) {
    return {
      label: 'Monochrome',
      caption: 'No strong color — the image reads in neutrals, so light and shape have to carry it.'
    };
  }

  const name = (c) => nearestColorName(c.rgb.r, c.rgb.g, c.rgb.b).toLowerCase();

  if (chromatic.length === 1) {
    return {
      label: 'Monochrome',
      caption: `Essentially one color (${name(chromatic[0])}) against neutrals — a quiet, unified palette.`
    };
  }

  // Circular hue span: 360° minus the largest empty gap between sorted hues.
  const sorted = chromatic.map((c) => c.h).sort((a, b) => a - b);
  let maxGap = 360 - sorted[sorted.length - 1] + sorted[0];
  for (let i = 1; i < sorted.length; i++) maxGap = Math.max(maxGap, sorted[i] - sorted[i - 1]);
  const span = 360 - maxGap;

  if (span <= 75) {
    const names = [...new Set(chromatic.map(name))];
    return {
      label: 'Analogous',
      caption: `Neighboring hues (${names.join(', ')}) — an analogous palette that feels harmonious and calm.`
    };
  }

  // Two clusters roughly opposite on the wheel? Seed with the two
  // heaviest swatches, assign the rest to the nearer seed, compare means.
  const byWeight = [...chromatic].sort((a, b) => b.weight - a.weight);
  const [seedA, seedB] = byWeight;
  const clusterA = [], clusterB = [];
  for (const c of chromatic) {
    (hueDistance(c.h, seedA.h) <= hueDistance(c.h, seedB.h) ? clusterA : clusterB).push(c);
  }
  if (clusterA.length && clusterB.length) {
    const gap = hueDistance(meanHue(clusterA), meanHue(clusterB));
    if (gap >= 150) {
      return {
        label: 'Complementary',
        caption: `${name(seedA)} against ${name(seedB)} — opposites on the color wheel, a classic complementary pair with built-in tension.`
      };
    }
  }

  return {
    label: 'Mixed',
    caption: 'Several unrelated hues share the frame — no single color relationship dominates.'
  };
}

/* ---------- Scope readings ---------- */

// On the 0-255 scale the scopes measure in: a gap this wide between the three
// channels is something you can see, and CAST_STRONG is where it stops being
// a look and starts being a mistake.
const CAST_VISIBLE = 6;
const CAST_STRONG = 16;

const COMPLEMENTS = { red: 'cyan', cyan: 'red', green: 'magenta', magenta: 'green', blue: 'yellow', yellow: 'blue' };

const asPercent = (level) => Math.round((level / 255) * 100);
const capitalize = (word) => word.charAt(0).toUpperCase() + word.slice(1);
const shareText = (share) => `${share < 0.01 ? '<1' : Math.round(share * 100)}%`;

/** Names a cast from each channel's distance from the three-channel mean. */
function castLabel(dr, dg, db) {
  const biggest = Math.max(Math.abs(dr), Math.abs(dg), Math.abs(db));
  if (biggest === Math.abs(dr)) return dr > 0 ? 'red' : 'cyan';
  if (biggest === Math.abs(dg)) return dg > 0 ? 'green' : 'magenta';
  return db > 0 ? 'blue' : 'yellow';
}

function balanceOf({ r, g, b }) {
  const mean = (r + g + b) / 3;
  return {
    spread: Math.max(r, g, b) - Math.min(r, g, b),
    cast: castLabel(r - mean, g - mean, b - mean)
  };
}

/**
 * Reads the luma waveform: where the trace starts and stops, and whether it is
 * jammed against either rail. Takes the `stats` object from computeScopes.
 */
export function waveformSummary(stats) {
  const luma = stats.luma;
  const low = asPercent(luma.low);
  const high = asPercent(luma.high);
  const range = high - low;

  let label;
  let base;
  if (range >= 85) {
    label = 'Full range';
    base = `The trace spans roughly ${low}% to ${high}% — this frame uses the whole scale.`;
  } else if (range >= 60) {
    label = 'Healthy range';
    base = `The trace spans roughly ${low}% to ${high}% — a solid tonal spread with a little headroom left at one end.`;
  } else {
    label = 'Compressed range';
    base = `The trace only spans ${low}% to ${high}% — a narrow band, so the image reads soft and flat.`;
  }

  const parts = [base];
  if (luma.clipWhite > 0.01) {
    parts.push(`${shareText(luma.clipWhite)} of the frame is pinned to the top rail: those highlights are pure white with no detail left to recover.`);
  } else if (high < 80) {
    parts.push('Nothing reaches the top rail, so there is room to lift the highlights.');
  }
  if (luma.clipBlack > 0.01) {
    parts.push(`${shareText(luma.clipBlack)} sits on the bottom rail — crushed blacks.`);
  } else if (low > 12) {
    parts.push('The trace never touches the floor, so the blacks are lifted — that reads as haze, or as a deliberate matte finish.');
  }
  parts.push('Read left to right: a bump under a part of the trace is that part of the frame, so you can see which side of the picture is carrying the light.');
  return { label, caption: parts.join(' ') };
}

/**
 * Reads the RGB parade by comparing where each channel's trace starts and
 * stops — the measurement behind "the shadows are blue".
 */
export function paradeSummary(stats) {
  const { r, g, b } = stats.channels;
  const shadows = balanceOf({ r: r.low, g: g.low, b: b.low });
  const highs = balanceOf({ r: r.high, g: g.high, b: b.high });

  const shadowCast = shadows.spread >= CAST_VISIBLE;
  const highCast = highs.spread >= CAST_VISIBLE;

  if (!shadowCast && !highCast) {
    return {
      label: 'Neutral',
      caption: `All three panels start and finish within ${Math.round(Math.max(shadows.spread, highs.spread))} levels of each other — the image is already color balanced, with no cast to correct.`
    };
  }

  const parts = [];
  if (shadowCast) {
    parts.push(`The ${shadows.cast} panel sits ${Math.round(shadows.spread)} levels off the others at the floor, so the shadows carry a ${shadows.cast} cast.`);
  }
  if (highCast) {
    parts.push(`At the ceiling the spread is ${Math.round(highs.spread)} levels toward ${highs.cast}, tinting the highlights.`);
  }

  let label;
  if (shadowCast && highCast && COMPLEMENTS[shadows.cast] === highs.cast) {
    label = 'Split-toned';
    parts.push(`${capitalize(shadows.cast)} shadows against ${highs.cast} highlights is a split tone — usually a look worth keeping rather than a fault worth fixing.`);
  } else if (Math.max(shadows.spread, highs.spread) >= CAST_STRONG) {
    label = 'Strong cast';
    parts.push('To neutralize it, raise or lower that channel until all three panels share a floor and a ceiling.');
  } else {
    label = 'Slight cast';
    parts.push('Mild enough to read as warmth or coolness rather than an error.');
  }
  return { label, caption: parts.join(' ') };
}

/** Reads the vectorscope: overall saturation, dominant hue, skin-tone axis. */
export function vectorscopeSummary(stats) {
  const v = stats.vector;
  const chroma = v.meanChroma;
  // A pure primary lands at a chroma of roughly 128, so that is 100% out.
  const outPct = Math.round((chroma / 128) * 100);
  const reach = `The average pixel sits about ${outPct < 1 ? '<1' : outPct}% of the way out to a fully saturated primary.`;

  let label;
  let base;
  if (chroma < 5) {
    label = 'Near-neutral';
    base = `${reach} The trace barely leaves the center — there is almost no color here, so the frame has to work on light and shape alone.`;
  } else if (chroma < 12) {
    label = 'Muted';
    base = `${reach} A tight cluster near the center: restrained, desaturated color.`;
  } else if (chroma < 22) {
    label = 'Natural';
    base = `${reach} That is the range that reads as real rather than processed.`;
  } else if (chroma < 35) {
    label = 'Saturated';
    base = `${reach} Strong color — the trace has clear reach in one or two directions.`;
  } else {
    label = 'Very saturated';
    base = `${reach} The trace runs a long way toward the graticule targets, which is about as saturated as color gets before it stops looking photographic.`;
  }

  const parts = [base];
  if (v.hueRgb) {
    const hue = nearestColorName(v.hueRgb.r, v.hueRgb.g, v.hueRgb.b).toLowerCase();
    parts.push(`Its center of mass points toward ${hue}, so that is the hue the frame leans on.`);
  }
  if (v.skinShare > 0.4 && v.chromaticShare > 0.15) {
    parts.push(`About ${shareText(v.skinShare)} of the colored pixels fall along the skin-tone line — if this frame has a face in it, the skin is landing where it should.`);
  } else {
    parts.push('The dashed line is the skin-tone axis: skin of every complexion sits close to that angle, because complexion changes brightness, which a vectorscope deliberately discards.');
  }
  return { label, caption: parts.join(' ') };
}

/**
 * Reads the CIE plot: how much of sRGB the frame occupies, and where its
 * average color sits relative to daylight.
 */
export function chromaticitySummary(stats) {
  const c = stats.cie;
  const coverage = Math.round(c.gamutShare * 100);
  const dx = c.x - 0.3127;
  const dy = c.y - 0.3290;
  const drift = Math.sqrt(dx * dx + dy * dy);

  let label;
  if (coverage >= 30) label = 'Wide gamut';
  else if (coverage >= 12) label = 'Moderate gamut';
  else label = 'Narrow gamut';

  const parts = [`The cloud covers about ${coverage}% of the sRGB triangle${coverage < 12 ? ' — a tight, unified palette' : coverage >= 30 ? ' — this frame ranges across most of the hues the display can show' : ''}.`];

  if (drift < 0.06) {
    // McCamy's approximation. Only meaningful near the daylight locus, which
    // the drift check above is what confines it to.
    const n = (c.x - 0.3320) / (0.1858 - c.y);
    const cct = Math.round((449 * n * n * n + 3525 * n * n + 6823.3 * n + 5520.33) / 50) * 50;
    const feel = cct < 5200 ? 'warmer than daylight' : cct > 7200 ? 'cooler than daylight' : 'close to daylight';
    parts.push(`Its average chromaticity works out to roughly ${cct} K — ${feel} (D65, the white cross, is 6500 K).`);
  } else {
    parts.push('Its average sits well away from the D65 white cross, so the frame is dominated by one color rather than balanced around neutral.');
  }
  parts.push('The horseshoe is every color a person can see; the triangle is the much smaller set a screen can actually show.');
  return { label, caption: parts.join(' ') };
}
