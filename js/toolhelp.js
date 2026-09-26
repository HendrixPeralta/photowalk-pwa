// Reference material for the "?" buttons next to each Analysis tool: what the
// tool actually measures, a good and a bad example to calibrate against, and
// somewhere to read more. Content only — rendering reuses js/modal.js.
import { openModal } from './modal.js';

export const TOOL_HELP = {
  gamut: {
    title: 'Colour Gamut Extraction',
    what: "Pulls the frame's dominant colours into swatches and checks whether they form a classical harmony — analogous, complementary, triadic, or monochrome.",
    good: 'A golden-hour landscape returning warm oranges and cool blues split roughly opposite each other on the colour wheel: a complementary pairing that reads as vivid without clashing.',
    bad: 'A snapshot under mixed fluorescent and window light returning four or five near-identical greenish-grey swatches — not a harmony, just an uncorrected colour cast.',
    refs: [
      'Johannes Itten, "The Art of Color"',
      'Josef Albers, "Interaction of Color"',
      { text: 'Wikipedia: Color scheme', url: 'https://en.wikipedia.org/wiki/Color_scheme' }
    ]
  },
  histogram: {
    title: 'Luminance Spectrum',
    what: "Plots how many pixels sit at each brightness level, from pure black to pure white.",
    good: "A full spread with a gentle peak in the midtones and no hard wall at either edge — detail is preserved in both shadows and highlights.",
    bad: "A spike slammed flat against the right edge (blown highlights) or the left edge (crushed shadows) — a wall means that detail is gone, not just dark or bright.",
    refs: [
      'Ansel Adams, "The Negative"',
      { text: 'Wikipedia: Image histogram', url: 'https://en.wikipedia.org/wiki/Image_histogram' }
    ]
  },
  tonalkey: {
    title: 'Tonal Key',
    what: "Reads the histogram's shape to call the frame high-key, low-key, or mid-key, and reports how much is clipped.",
    good: "A deliberately high-key portrait: bright overall with only a few dark accents for shape, and a low clip percentage confirming the shadows and highlights are intact rather than crushed.",
    bad: "A muddy, underexposed frame that gets called low-key not by choice but because it's simply too dark — the tag alone can't tell the difference, so check the histogram alongside it.",
    refs: [
      { text: 'Wikipedia: Zone system', url: 'https://en.wikipedia.org/wiki/Zone_system' }
    ]
  },
  waveform: {
    title: 'Waveform',
    what: "The same brightness information as the histogram, but plotted against horizontal position — so you can see exactly where in the frame the highlights and shadows fall.",
    good: "A trace that stays inside the 0–100% range with a shape that matches the key light — a bright hump where a lit subject sits, without pinning the ceiling.",
    bad: "A flat line pinned at the very top across a wide stretch of the frame — a blown-out sky or window with no recoverable detail underneath it.",
    refs: [
      'Blain Brown, "Cinematography: Theory and Practice"',
      { text: 'Wikipedia: Waveform monitor', url: 'https://en.wikipedia.org/wiki/Waveform_monitor' }
    ]
  },
  parade: {
    title: 'RGB Parade',
    what: "The waveform split into separate red, green and blue traces side by side — reveals colour casts a single combined waveform can hide.",
    good: "Red, green and blue traces roughly tracking each other's shape, offset only by the scene's real colour — e.g. warm skin tones sitting slightly higher in red than in blue.",
    bad: "One channel — commonly blue, under tungsten light — sitting well above or below the other two across the whole frame: a colour cast that needs a white-balance fix, not a tonal one.",
    refs: [
      { text: 'Wikipedia: RGB color model', url: 'https://en.wikipedia.org/wiki/RGB_color_model' }
    ]
  },
  vectorscope: {
    title: 'Vectorscope',
    what: "Plots hue as an angle and saturation as distance from the centre — shows what colours are present and how intense they are, independent of brightness.",
    good: "Traces that reach toward a consistent, intentional palette without pinning against the outer edge of the graticule.",
    bad: "A trace slammed against the outer edge in one direction — colour that's clipping in at least one channel, common with aggressive phone-camera colour processing.",
    refs: [
      { text: 'Wikipedia: Vectorscope', url: 'https://en.wikipedia.org/wiki/Vectorscope' }
    ]
  },
  cie: {
    title: 'CIE Chromaticity',
    what: "Plots which real-world colours the frame actually contains on the CIE 1931 chromaticity diagram — gamut coverage independent of brightness or saturation.",
    good: "A tight, deliberate cluster near a clear target — a monochrome scene clustering near the white point, or a colourful scene spreading toward a few clear hue families.",
    bad: "Points scattered evenly across the whole diagram with no discernible cluster — often heavy noise or a compression artifact scrambling colour, not a genuinely varied palette.",
    refs: [
      { text: 'Wikipedia: CIE 1931 color space', url: 'https://en.wikipedia.org/wiki/CIE_1931_color_space' }
    ]
  },
  tonecurve: {
    title: 'Tone Curve',
    what: "Measured mode plots how this frame's tones are actually distributed along an input-to-output curve; Adjust mode lets you push contrast the same way a raw editor does.",
    good: "A gentle S-curve — shadows pulled down slightly, highlights pushed up slightly, midtones left close to the diagonal — adds contrast without crushing detail.",
    bad: "An extreme S, or a curve with a flat plateau in the middle: a flat section maps a whole range of input tones to one output tone, destroying detail there even though nothing looks traditionally \"clipped.\"",
    refs: [
      'Michael Freeman, "The Photographer\'s Eye"'
    ]
  }
};

function refHtml(ref) {
  if (typeof ref === 'string') return `<li>${ref}</li>`;
  return `<li><a href="${ref.url}" target="_blank" rel="noopener">${ref.text}</a></li>`;
}

function openToolHelp(key) {
  const info = TOOL_HELP[key];
  if (!info) return;
  openModal(`
    <h3>${info.title}</h3>
    <p class="muted card-text">${info.what}</p>
    <p class="card-text"><strong>Good:</strong> ${info.good}</p>
    <p class="card-text"><strong>Bad:</strong> ${info.bad}</p>
    <ul class="tool-help-refs">${info.refs.map(refHtml).join('')}</ul>
  `);
}

export function initToolHelp() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.tool-help-btn');
    if (!btn) return;
    // Several of these buttons sit inside a <summary>; without this, opening
    // the modal would also toggle the enclosing <details> open/closed.
    e.preventDefault();
    e.stopPropagation();
    openToolHelp(btn.dataset.toolHelp);
  });
}
