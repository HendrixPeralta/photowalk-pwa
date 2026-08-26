// Curated, procedurally-drawn diagrams for the "Concept Explainer" feature.
// The PRD flags real reference-photo licensing as an open question, so this
// demo illustrates each concept with original vector diagrams instead of
// sourced photography — no copyright risk, and it renders fully offline.

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
  }
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
  }
];

export function randomTheme(excludeId) {
  const pool = excludeId ? THEMES.filter((t) => t.id !== excludeId) : THEMES;
  return pool[Math.floor(Math.random() * pool.length)];
}
