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
  if (shadows > 0.5) base = 'Low-key: most of the photo is dark.';
  else if (highs > 0.5) base = 'High-key: most of the photo is bright.';
  else if (shadows > 0.28 && highs > 0.28) base = 'High contrast: strong darks and brights, with little in between.';
  else if (shadows < 0.08 && highs < 0.08) base = 'Low contrast: most tones sit in the middle, so the photo looks soft and flat.';
  else base = 'Balanced: a good spread from dark to bright.';

  const parts = [base];
  if (clippedWhite) parts.push('Some bright areas are pure white, so their detail is lost.');
  if (clippedBlack) parts.push('Some dark areas are pure black, so their detail is lost.');

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
      caption: 'No strong colors. The photo is mostly grays and neutrals, so light and shape do the work.'
    };
  }

  const name = (c) => nearestColorName(c.rgb.r, c.rgb.g, c.rgb.b).toLowerCase();

  if (chromatic.length === 1) {
    return {
      label: 'Monochrome',
      caption: `Mostly one color (${name(chromatic[0])}) plus neutrals. Calm and unified.`
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
      caption: `Colors that sit next to each other on the color wheel (${names.join(', ')}). This is called analogous, and it feels calm and harmonious.`
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
        caption: `${capitalize(name(seedA))} and ${name(seedB)} sit opposite each other on the color wheel. This is called complementary, and it makes both colors pop.`
      };
    }
  }

  return {
    label: 'Mixed',
    caption: 'Several unrelated colors share the photo, with no clear color scheme.'
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
    base = `Brightness runs from about ${low}% to ${high}%, so the photo uses the full range from dark to bright.`;
  } else if (range >= 60) {
    label = 'Healthy range';
    base = `Brightness runs from about ${low}% to ${high}%: a good spread, with a little room left at one end.`;
  } else {
    label = 'Narrow range';
    base = `Brightness only runs from ${low}% to ${high}%, so the photo looks soft and flat.`;
  }

  const parts = [base];
  if (luma.clipWhite > 0.01) {
    parts.push(`${shareText(luma.clipWhite)} of the photo hits the very top of the chart. Those areas are pure white, and their detail can't be recovered.`);
  } else if (high < 80) {
    parts.push("Nothing hits the top of the chart, so there's room to brighten the highlights if you like.");
  }
  if (luma.clipBlack > 0.01) {
    parts.push(`${shareText(luma.clipBlack)} sits at the very bottom: pure black with no detail.`);
  } else if (low > 12) {
    parts.push('Nothing reaches the bottom, so the darkest parts are dark gray, not black. That can look hazy, or like a deliberate faded style.');
  }
  parts.push('Read it left to right, like the photo itself: a high spot on the chart means that part of the photo is bright.');
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
      caption: `The red, green and blue panels start and finish within ${Math.round(Math.max(shadows.spread, highs.spread))} levels of each other, so the colors are balanced with no tint to fix.`
    };
  }

  const parts = [];
  if (shadowCast) {
    parts.push(`The ${shadows.cast} panel sits ${Math.round(shadows.spread)} levels away from the others at the bottom, so the shadows have a ${shadows.cast} tint.`);
  }
  if (highCast) {
    parts.push(`At the top, it leans ${Math.round(highs.spread)} levels toward ${highs.cast}, tinting the bright areas.`);
  }

  let label;
  if (shadowCast && highCast && COMPLEMENTS[shadows.cast] === highs.cast) {
    label = 'Split tone';
    parts.push(`${capitalize(shadows.cast)} shadows against ${highs.cast} highlights is called split toning. It's usually a style choice, not a mistake.`);
  } else if (Math.max(shadows.spread, highs.spread) >= CAST_STRONG) {
    label = 'Strong tint';
    parts.push('To fix it, adjust white balance (or temperature and tint) in your editing app until the three panels line up.');
  } else {
    label = 'Slight tint';
    parts.push('Mild enough to look like a warm or cool mood rather than a mistake.');
  }
  return { label, caption: parts.join(' ') };
}

/** Reads the vectorscope: overall saturation, dominant hue, skin-tone axis. */
export function vectorscopeSummary(stats) {
  const v = stats.vector;
  const chroma = v.meanChroma;
  // A pure primary lands at a chroma of roughly 128, so that is 100% out.
  const outPct = Math.round((chroma / 128) * 100);
  const reach = `On average, colors are about ${outPct < 1 ? '<1' : outPct}% of the way to fully vivid.`;

  let label;
  let base;
  if (chroma < 5) {
    label = 'Almost no color';
    base = `${reach} The dots barely leave the center, so there's almost no color. Light and shape have to do the work.`;
  } else if (chroma < 12) {
    label = 'Muted';
    base = `${reach} The dots stay close to the center: soft, muted color.`;
  } else if (chroma < 22) {
    label = 'Natural';
    base = `${reach} That's a natural-looking amount of color.`;
  } else if (chroma < 35) {
    label = 'Saturated';
    base = `${reach} Strong color: the dots reach well out in one or two directions.`;
  } else {
    label = 'Very saturated';
    base = `${reach} The dots reach close to the outer edge. Any stronger and the colors would start to look unnatural.`;
  }

  const parts = [base];
  if (v.hueRgb) {
    const hue = nearestColorName(v.hueRgb.r, v.hueRgb.g, v.hueRgb.b).toLowerCase();
    parts.push(`Most of the color leans toward ${hue}.`);
  }
  if (v.skinShare > 0.4 && v.chromaticShare > 0.15) {
    parts.push(`About ${shareText(v.skinShare)} of the colored pixels sit on the skin-tone line. If there's a person in the photo, their skin color looks natural.`);
  } else {
    parts.push('The dashed line is the skin-tone line. Skin of every shade falls near it, because this chart ignores brightness, and skin tones differ mostly in brightness, not hue.');
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
  if (coverage >= 30) label = 'Wide color range';
  else if (coverage >= 12) label = 'Medium color range';
  else label = 'Narrow color range';

  const parts = [`The colors cover about ${coverage}% of the triangle${coverage < 12 ? ', a tight, unified palette' : coverage >= 30 ? ', so the photo uses most of the colors a screen can show' : ''}.`];

  if (drift < 0.06) {
    // McCamy's approximation. Only meaningful near the daylight locus, which
    // the drift check above is what confines it to.
    const n = (c.x - 0.3320) / (0.1858 - c.y);
    const cct = Math.round((449 * n * n * n + 3525 * n * n + 6823.3 * n + 5520.33) / 50) * 50;
    const feel = cct < 5200 ? 'warmer than daylight' : cct > 7200 ? 'cooler than daylight' : 'close to daylight';
    parts.push(`Overall the light is about ${cct} K, ${feel} (the white cross marks normal daylight, 6500 K).`);
  } else {
    parts.push('Its average sits far from the white cross (daylight), so one color dominates the photo.');
  }
  parts.push('The horseshoe shape is every color people can see. The triangle is the smaller set a screen can show.');
  return { label, caption: parts.join(' ') };
}
