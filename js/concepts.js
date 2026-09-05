// Curated, procedurally-drawn diagrams for the "Concept Explainer" feature.
// The PRD flags real reference-photo licensing as an open question, so this
// demo illustrates each concept with original vector diagrams instead of
// sourced photography — no copyright risk, and it renders fully offline.

import { escapeHtml } from './util.js';

export const CONCEPTS = {
  'thirds': {
    title: 'Rule of Thirds',
    tip: 'Place key subjects along the grid lines or their intersections instead of dead center.',
    svg: `<svg viewBox="0 0 200 140"><rect width="200" height="140" class="bg"/>
      <line x1="66.6" y1="0" x2="66.6" y2="140" class="grid"/>
      <line x1="133.3" y1="0" x2="133.3" y2="140" class="grid"/>
      <line x1="0" y1="46.6" x2="200" y2="46.6" class="grid"/>
      <line x1="0" y1="93.3" x2="200" y2="93.3" class="grid"/>
      <circle cx="133.3" cy="46.6" r="9" class="accent-fill"/></svg>`
  },
  'golden': {
    title: 'Golden Ratio',
    tip: 'A gentler alternative to thirds — the spiral pulls the eye toward the subject naturally.',
    svg: `<svg viewBox="0 0 200 140"><rect width="200" height="140" class="bg"/>
      <line x1="76.4" y1="0" x2="76.4" y2="140" class="grid"/>
      <line x1="123.6" y1="0" x2="123.6" y2="140" class="grid"/>
      <line x1="0" y1="53.5" x2="200" y2="53.5" class="grid"/>
      <line x1="0" y1="86.5" x2="200" y2="86.5" class="grid"/>
      <path d="M200,140 A140,140 0 0 0 60,0" class="spiral"/></svg>`
  },
  'leading-lines': {
    title: 'Leading Lines',
    tip: 'Use roads, rails, or fences that draw the eye toward your subject.',
    svg: `<svg viewBox="0 0 200 140"><rect width="200" height="140" class="bg"/>
      <path d="M-10,150 L120,30" class="line"/>
      <path d="M210,150 L120,30" class="line"/>
      <circle cx="120" cy="30" r="7" class="accent-fill"/></svg>`
  },
  'reflection': {
    title: 'Reflections & Symmetry',
    tip: 'Still water, glass, and mirrors let you double a subject and flatten the frame.',
    svg: `<svg viewBox="0 0 200 140"><rect width="200" height="140" class="bg"/>
      <line x1="0" y1="70" x2="200" y2="70" class="grid"/>
      <path d="M100,20 L130,65 H70 Z" class="shape"/>
      <path d="M100,120 L130,75 H70 Z" class="shape shape-dim"/></svg>`
  },
  'framing': {
    title: 'Natural Framing',
    tip: 'Shoot through doorways, arches, or branches to add depth and draw focus inward.',
    svg: `<svg viewBox="0 0 200 140"><rect width="200" height="140" class="bg-dark"/>
      <rect x="30" y="15" width="140" height="110" class="bg"/>
      <circle cx="100" cy="70" r="16" class="accent-fill"/></svg>`
  },
  'silhouette': {
    title: 'Silhouette',
    tip: 'Expose for a bright background so your subject turns into a graphic, detail-free shape.',
    svg: `<svg viewBox="0 0 200 140"><defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" class="sky-top"/><stop offset="1" class="sky-bottom"/></linearGradient></defs>
      <rect width="200" height="140" fill="url(#sky)"/>
      <path d="M0,140 L40,80 L70,110 L110,60 L150,100 L200,70 L200,140 Z" class="silhouette"/></svg>`
  },
  'texture-pattern': {
    title: 'Texture & Pattern',
    tip: 'Fill the whole frame with a repeating pattern, then look for the one break in it.',
    svg: `<svg viewBox="0 0 200 140"><rect width="200" height="140" class="bg"/>
      <g class="pattern-fill">${Array.from({ length: 6 }).map((_, row) =>
        Array.from({ length: 8 }).map((_, col) => {
          const skip = row === 3 && col === 5;
          return skip ? '' : `<rect x="${col * 25 + 4}" y="${row * 23 + 4}" width="17" height="17" rx="3"/>`;
        }).join('')
      ).join('')}</g>
      <rect x="129" y="73" width="17" height="17" rx="3" class="accent-fill"/></svg>`
  },
  'negative-space': {
    title: 'Negative Space',
    tip: 'Let empty sky, wall, or floor dominate the frame so the small subject reads clearly.',
    svg: `<svg viewBox="0 0 200 140"><rect width="200" height="140" class="bg"/>
      <circle cx="168" cy="112" r="9" class="accent-fill"/></svg>`
  },
  'warm-light': {
    title: 'Golden Hour Light',
    tip: 'Shoot low sun for warm color and long, dramatic shadows.',
    svg: `<svg viewBox="0 0 200 140"><defs><linearGradient id="warm" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" class="warm-a"/><stop offset="1" class="warm-b"/></linearGradient></defs>
      <rect width="200" height="140" fill="url(#warm)"/>
      <circle cx="150" cy="40" r="18" class="sun"/>
      <path d="M20,140 L60,140 L100,90 L90,90 Z" class="shadow"/></svg>`
  },
  'layers-depth': {
    title: 'Layers & Depth',
    tip: 'Combine a foreground, subject, and background so the frame reads in three dimensions.',
    svg: `<svg viewBox="0 0 200 140"><rect width="200" height="140" class="bg"/>
      <rect x="20" y="20" width="120" height="90" rx="10" class="layer layer-3"/>
      <rect x="50" y="35" width="120" height="90" rx="10" class="layer layer-2"/>
      <rect x="80" y="50" width="100" height="75" rx="10" class="layer layer-1"/></svg>`
  },
  'color-pop': {
    title: 'Color Pop',
    tip: 'One saturated color against a muted scene reads instantly as the subject.',
    svg: `<svg viewBox="0 0 200 140"><rect width="200" height="140" class="bg"/>
      <circle cx="45" cy="45" r="16" class="muted"/>
      <circle cx="95" cy="90" r="16" class="muted"/>
      <circle cx="150" cy="50" r="16" class="muted"/>
      <circle cx="150" cy="95" r="18" class="accent-fill"/></svg>`
  },
  'shallow-dof': {
    title: 'Shallow Depth of Field',
    tip: 'A wide aperture blurs the background so one sharp subject stands out.',
    svg: `<svg viewBox="0 0 200 140"><defs><filter id="blur"><feGaussianBlur stdDeviation="4"/></filter></defs>
      <rect width="200" height="140" class="bg"/>
      <g filter="url(#blur)" class="muted">
        <circle cx="40" cy="35" r="14"/><circle cx="170" cy="30" r="10"/>
        <circle cx="30" cy="110" r="12"/><circle cx="175" cy="105" r="16"/>
      </g>
      <circle cx="100" cy="70" r="24" class="accent-fill"/></svg>`
  },
  'motion-blur': {
    title: 'Motion & Blur',
    tip: 'Let moving subjects streak while something still stays sharp — or pan with the motion.',
    svg: `<svg viewBox="0 0 200 140"><defs><filter id="mblur" x="-40%" width="180%"><feGaussianBlur stdDeviation="6 0.3"/></filter></defs>
      <rect width="200" height="140" class="bg"/>
      <g filter="url(#mblur)" class="muted">
        <rect x="25" y="50" width="65" height="34" rx="10"/>
      </g>
      <circle cx="150" cy="67" r="17" class="accent-fill"/></svg>`
  },
  'low-angle': {
    title: 'Change Your Angle',
    tip: 'Shoot from your knees or point straight up — unfamiliar angles make familiar places new.',
    svg: `<svg viewBox="0 0 200 140"><rect width="200" height="140" class="bg"/>
      <path d="M0,140 L78,22 L90,22 L44,140 Z" class="layer layer-2"/>
      <path d="M200,140 L122,22 L110,22 L156,140 Z" class="layer layer-2"/>
      <circle cx="100" cy="36" r="10" class="accent-fill"/></svg>`
  },
  'scale-contrast': {
    title: 'Sense of Scale',
    tip: 'A tiny figure beside something huge tells the viewer exactly how big the scene is.',
    svg: `<svg viewBox="0 0 200 140"><rect width="200" height="140" class="bg"/>
      <path d="M35,140 L35,25 L115,25 L115,140 Z" class="muted"/>
      <line x1="0" y1="128" x2="200" y2="128" class="grid"/>
      <circle cx="155" cy="121" r="6" class="accent-fill"/></svg>`
  },
  'night-glow': {
    title: 'Night Glow',
    tip: 'After dark, point lights become the subject — brace your phone and expose for the glow.',
    svg: `<svg viewBox="0 0 200 140"><defs><filter id="nglow"><feGaussianBlur stdDeviation="2.5"/></filter></defs>
      <rect width="200" height="140" class="bg-dark"/>
      <g filter="url(#nglow)">
        <circle cx="48" cy="42" r="8" class="sun"/>
        <circle cx="118" cy="88" r="6" class="sun"/>
        <circle cx="170" cy="30" r="5" class="sun"/>
      </g>
      <circle cx="90" cy="52" r="11" class="accent-fill"/></svg>`
  }
};

// Search terms for the optional public-domain photo strip (see openverse.js).
// Kept beside the concepts so a new concept and its examples stay in one place.
export const CONCEPT_QUERIES = {
  'thirds': 'rule of thirds composition photograph',
  'golden': 'golden ratio composition photograph',
  'leading-lines': 'leading lines road perspective photograph',
  'reflection': 'reflection still water symmetry photograph',
  'framing': 'natural framing archway doorway photograph',
  'silhouette': 'silhouette sunset backlit photograph',
  'texture-pattern': 'repeating pattern texture wall photograph',
  'negative-space': 'negative space minimal sky photograph',
  'warm-light': 'golden hour warm sunlight long shadows photograph',
  'layers-depth': 'foreground background depth layers landscape photograph',
  'color-pop': 'single bright color against muted scene photograph',
  'shallow-dof': 'shallow depth of field bokeh photograph',
  'motion-blur': 'motion blur panning moving subject photograph',
  'low-angle': 'looking up buildings low angle perspective photograph',
  'scale-contrast': 'tiny person vast landscape sense of scale photograph',
  'night-glow': 'night city lights bokeh long exposure photograph'
};

export const THEMES = [
  {
    id: 'shadows-silhouettes',
    title: 'Shadows & Silhouettes',
    brief: 'Hunt for hard light, long shadows, and shapes stripped of detail.',
    concepts: ['silhouette', 'warm-light'],
    challenges: [
      'Shoot when the sun is low and behind your subject',
      'Find a hard-edged shadow on a wall or sidewalk',
      'Turn a person or object into a pure silhouette'
    ]
  },
  {
    id: 'leading-lines',
    title: 'Leading Lines',
    brief: 'Find lines in the environment that pull the eye through the frame.',
    concepts: ['leading-lines', 'thirds'],
    challenges: [
      'Find a road, rail, or fence that leads into the frame',
      "Get low to exaggerate the line's pull",
      'Place your subject where the lines converge'
    ]
  },
  {
    id: 'reflections',
    title: 'Reflections',
    brief: 'Puddles, glass, and still water double the world in interesting ways.',
    concepts: ['reflection', 'thirds'],
    challenges: [
      'Find a puddle, window, or still water',
      'Try a low angle to fill the frame with the reflection',
      'Shoot one where the real subject is barely visible'
    ]
  },
  {
    id: 'urban-textures',
    title: 'Urban Textures',
    brief: 'Peeling paint, brick, tile — get close and let pattern be the subject.',
    concepts: ['texture-pattern', 'negative-space'],
    challenges: [
      'Fill the frame with one repeating pattern',
      'Photograph a texture up close, with no context',
      'Look for a break or imperfection in a repetition'
    ]
  },
  {
    id: 'golden-hour',
    title: 'Golden Hour Glow',
    brief: 'Time your walk around sunrise or sunset for warm, directional light.',
    concepts: ['warm-light', 'silhouette'],
    challenges: [
      'Shoot 30 minutes before sunset',
      'Backlight a subject and expose for the sky',
      'Capture a long shadow stretching across the frame'
    ]
  },
  {
    id: 'framing-doorways',
    title: 'Framing & Doorways',
    brief: 'Use the environment itself to build a frame around your subject.',
    concepts: ['framing', 'layers-depth'],
    challenges: [
      'Shoot through a doorway, window, or archway',
      'Use foliage or an object to frame the edges',
      'Add a second layer of depth behind the frame'
    ]
  },
  {
    id: 'color-pop',
    title: 'Color Pop',
    brief: 'One bold color against a muted scene is an instant subject.',
    concepts: ['color-pop'],
    challenges: [
      'Find one bright color against a muted background',
      'Shoot mostly grayscale, then find the one exception',
      'Try it with a person wearing a bold color'
    ]
  },
  {
    id: 'street-candid',
    title: 'Street Candid',
    brief: 'Practice patience — wait for a moment instead of chasing it.',
    concepts: ['layers-depth', 'negative-space'],
    challenges: [
      'Capture a stranger in motion, respectfully, in public',
      'Wait in one spot for a moment to come to you',
      'Look for overlapping layers: foreground, subject, background'
    ]
  },
  {
    id: 'macro-details',
    title: 'Macro Details',
    brief: 'Get close to something people usually walk past.',
    concepts: ['shallow-dof', 'texture-pattern'],
    challenges: [
      'Get as close as your lens allows',
      'Isolate one small detail with a blurred background',
      'Photograph something people usually overlook'
    ]
  },
  {
    id: 'negative-space',
    title: 'Negative Space',
    brief: 'Give your subject room to breathe in a mostly-empty frame.',
    concepts: ['negative-space', 'color-pop'],
    challenges: [
      'Place your subject small in a large empty area',
      'Use a plain sky, wall, or floor as the space',
      'Leave more empty room than feels comfortable'
    ]
  },
  {
    id: 'motion-rhythm',
    title: 'Motion & Rhythm',
    brief: 'Bikes, buses, birds — let the city move through your frame.',
    concepts: ['motion-blur', 'leading-lines'],
    challenges: [
      'Capture something moving while the background stays sharp',
      'Pan with a moving subject so the background streaks instead',
      'Freeze a moment mid-motion: a step, a jump, a splash'
    ]
  },
  {
    id: 'look-up',
    title: 'Look Up',
    brief: 'Everything above eye level — rooftops, wires, canopies, sky.',
    concepts: ['low-angle', 'negative-space'],
    challenges: [
      'Point the camera straight up and shoot what converges',
      'Frame a rooftop, wire, or branch against plain sky',
      'Shoot a tall subject from its base to exaggerate its height'
    ]
  },
  {
    id: 'ground-level',
    title: 'Ground Level',
    brief: 'Drop the camera to your ankles and shoot the world from below.',
    concepts: ['low-angle', 'leading-lines'],
    challenges: [
      'Shoot with the camera resting on the ground',
      'Use the pavement itself as a giant foreground',
      'Catch feet, wheels, or paws passing at their own eye level'
    ]
  },
  {
    id: 'sense-of-scale',
    title: 'Sense of Scale',
    brief: 'Pair something tiny with something huge and let the contrast speak.',
    concepts: ['scale-contrast', 'negative-space'],
    challenges: [
      'Photograph a person dwarfed by a building or landscape',
      'Include something familiar to make a big scene measurable',
      'Reverse it: shoot something tiny so it looks monumental'
    ]
  },
  {
    id: 'night-lights',
    title: 'Night Lights',
    brief: 'After dark the light sources become the subjects.',
    concepts: ['night-glow', 'color-pop'],
    challenges: [
      'Shoot a lit window, sign, or streetlamp against the dark',
      'Brace your phone on something solid and hold still',
      'Find two different colors of light in one frame'
    ]
  },
  {
    id: 'weather-mood',
    title: 'Weather & Mood',
    brief: 'Rain, fog, wind, and heavy clouds do the atmosphere for you.',
    concepts: ['negative-space', 'layers-depth'],
    challenges: [
      'Make the weather itself visible in the frame',
      'Shoot how the light changes under clouds or through fog',
      'Find someone or something reacting to the weather'
    ]
  },
  {
    id: 'signs-letters',
    title: 'Signs & Letters',
    brief: 'Hunt typography — hand-painted, neon, worn, or accidental.',
    concepts: ['color-pop', 'texture-pattern'],
    challenges: [
      'Photograph a sign so old it has become texture',
      'Isolate a single letter or number as the subject',
      'Find words that mean something new out of context'
    ]
  },
  {
    id: 'nature-in-city',
    title: 'Nature in the City',
    brief: 'Find the green pushing back — weeds, roots, moss, and birds.',
    concepts: ['framing', 'shallow-dof'],
    challenges: [
      'Photograph a plant growing where it should not',
      'Frame something man-made through leaves or branches',
      'Get close to one small living detail and blur the city behind it'
    ]
  },
  {
    id: 'curves-spirals',
    title: 'Curves & Spirals',
    brief: 'Skip the straight lines — hunt arcs, bends, and coils instead.',
    concepts: ['golden', 'leading-lines'],
    challenges: [
      'Find a staircase, ramp, or road that curves through the frame',
      'Let one arc carry the eye from a corner to your subject',
      'Shoot a spiral — a shell, a hose, a stairwell from above or below'
    ]
  },
  {
    id: 'symmetry-hunt',
    title: 'Symmetry Hunt',
    brief: 'Find scenes that mirror themselves — then decide whether to break them.',
    concepts: ['reflection', 'framing'],
    challenges: [
      'Center a perfectly symmetrical scene, dead-on',
      'Use a reflection to complete the symmetry',
      'Break it: add one off-center element to a symmetrical frame'
    ]
  },
  {
    id: 'minimal-geometry',
    title: 'Minimal Geometry',
    brief: 'Reduce the world to shapes: blocks of color, edges, and empty space.',
    concepts: ['negative-space', 'thirds'],
    challenges: [
      'Shoot a frame with three or fewer shapes in it',
      'Line up an edge in the scene with a rule-of-thirds line',
      'Make a photo that reads as abstract until you look twice'
    ]
  },
  {
    id: 'wear-and-decay',
    title: 'Wear & Decay',
    brief: 'Rust, cracks, and fading paint — photograph what time is doing.',
    concepts: ['texture-pattern', 'layers-depth'],
    challenges: [
      'Find something old beside something new in one frame',
      'Get close enough that rust or peeling paint becomes a landscape',
      'Shoot a repair — tape, patch, or weld — as the subject'
    ]
  },
  {
    id: 'transit-waiting',
    title: 'Transit & Waiting',
    brief: 'Stations, stops, and platforms — the in-between places people pass through.',
    concepts: ['leading-lines', 'motion-blur'],
    challenges: [
      'Use tracks, platform edges, or queue lines to lead the eye',
      'Contrast someone waiting still with something rushing past',
      'Shoot the moment of arrival or departure, not the ride'
    ]
  },
  {
    id: 'hands-at-work',
    title: 'Hands at Work',
    brief: 'Vendors, makers, gardeners — tell a story through hands, not faces.',
    concepts: ['shallow-dof', 'motion-blur'],
    challenges: [
      'Photograph hands mid-task, respectfully, in public',
      'Isolate the hands with a blurred background',
      'Include the tool or material, and let it explain the job'
    ]
  }
];

/** Every built-in mini-challenge, deduped, for the custom theme builder's picklist. */
export function allChallenges() {
  const seen = new Set();
  const list = [];
  for (const t of THEMES) {
    for (const c of t.challenges) {
      if (!seen.has(c)) { seen.add(c); list.push(c); }
    }
  }
  return list;
}

/** One concept card, shared by the walk explainer modal and the Analyze tab. */
export function renderConceptCard(key) {
  const c = CONCEPTS[key];
  if (!c) return '';
  return `<div class="concept-card">
    <div class="concept-art">${c.svg}</div>
    <h4>${escapeHtml(c.title)}</h4>
    <p>${escapeHtml(c.tip)}</p>
    <div class="concept-photos" data-concept="${escapeHtml(key)}"></div>
  </div>`;
}

// Themes that live or die on low, warm sun: worth steering toward in the late
// afternoon, and frustrating to hand someone after dark.
const LOW_SUN_THEMES = ['golden-hour', 'shadows-silhouettes'];

// Themes that only work after dark — pointless to suggest in daylight.
const NIGHT_THEMES = ['night-lights'];

function timeOfDayBucket(now) {
  const h = now.getHours();
  if (h >= 16 && h < 20) return 'golden';
  if (h >= 20 || h < 6) return 'dark';
  return 'day';
}

// Golden hour nudges toward low-sun themes by knocking this many walks off
// their practice count, rather than locking the pool to only them — a theme
// you've truly never walked can still win, so New Theme keeps some variety.
const GOLDEN_HOUR_DISCOUNT = 2;

/**
 * Picks the next theme with a reason the user can see: dark hours drop themes
 * that need light entirely, golden hour biases toward low-sun themes without
 * excluding the rest, and the least-practiced theme in what remains wins, so
 * the generator spreads practice instead of repeating.
 *
 * @param {string|null} excludeId theme to avoid (usually the one on screen)
 * @param {Record<string, number>} counts walks completed per theme id
 * @returns {{theme: object, reason: string}}
 */
export function suggestTheme(excludeId, counts = {}, now = new Date()) {
  const bucket = timeOfDayBucket(now);
  let pool = THEMES.filter((t) => t.id !== excludeId);
  if (bucket !== 'dark') {
    const daylight = pool.filter((t) => !NIGHT_THEMES.includes(t.id));
    if (daylight.length) pool = daylight;
  }

  let candidates = pool;
  if (bucket === 'dark') {
    const afterDark = pool.filter((t) => !LOW_SUN_THEMES.includes(t.id));
    if (afterDark.length) candidates = afterDark;
  }

  const effectiveCount = (t) => {
    const base = counts[t.id] || 0;
    return bucket === 'golden' && LOW_SUN_THEMES.includes(t.id)
      ? Math.max(0, base - GOLDEN_HOUR_DISCOUNT)
      : base;
  };

  const fewest = Math.min(...candidates.map(effectiveCount));
  const leastPracticed = candidates.filter((t) => effectiveCount(t) === fewest);
  const theme = leastPracticed[Math.floor(Math.random() * leastPracticed.length)];

  let reason;
  if (bucket === 'golden' && LOW_SUN_THEMES.includes(theme.id)) {
    reason = 'The sun is getting low — this is the window for it.';
  } else if (NIGHT_THEMES.includes(theme.id)) {
    reason = "It's dark out — the right window for this one.";
  } else {
    reason = (counts[theme.id] || 0) === 0
      ? "You haven't walked this theme yet."
      : 'One of your least-practiced themes.';
  }
  return { theme, reason };
}
