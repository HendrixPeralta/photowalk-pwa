// Reference material for the "?" buttons next to each Analysis tool: what the
// tool actually measures, a good and a bad example to calibrate against, and
// somewhere to read more. Written for someone who has never used any of this
// before, not for someone who already knows the vocabulary. Content only;
// rendering reuses js/modal.js.
import { openModal } from './modal.js';

export const TOOL_HELP = {
  gamut: {
    title: 'Main Colors',
    what: "Picks out the main colors in your photo and checks whether they naturally go well together: colors sitting opposite each other on a color wheel (called complementary), colors sitting close together (analogous), or the photo just being shades of one color (monochrome).",
    good: "A sunset photo with a warm orange sky and cool blue water. Those two colors sit on opposite sides of the color wheel, so together they look bold and pleasing rather than clashing.",
    bad: "A photo taken under mixed indoor lighting comes back showing four or five colors that all look like slightly different shades of murky green. That's not a color choice. It's just the lighting confusing the camera.",
    refs: [
      { text: 'Johannes Itten, "The Art of Color"', note: 'a gentle, classic introduction to how colors relate to each other' },
      { text: 'Josef Albers, "Interaction of Color"', note: "short and visual, showing how colors change depending on what's next to them" },
      { text: 'Wikipedia: Color scheme', url: 'https://en.wikipedia.org/wiki/Color_scheme', note: 'a quick reference for the harmony names (complementary, analogous, etc.)' }
    ]
  },
  histogram: {
    title: 'Brightness Chart',
    what: "A simple chart of how bright or dark your photo is. It sorts every pixel from pure black to pure white and counts how many land at each brightness, like a bar chart of light.",
    good: "The chart fills the width smoothly with no tall spike jammed against either edge, meaning you can still see detail in both the darkest shadows and the brightest highlights.",
    bad: "A tall spike pressed flat against the right edge (parts of the photo are pure white with nothing left to see) or the left edge (parts are pure black, same problem). Once it hits the wall like that, the detail is gone for good.",
    refs: [
      { text: 'Ansel Adams, "The Negative"', note: 'the classic book on understanding how light and dark map onto a photo' },
      { text: 'Wikipedia: Image histogram', url: 'https://en.wikipedia.org/wiki/Image_histogram', note: 'a short explainer with example charts' }
    ]
  },
  tonalkey: {
    title: 'Tonal Key',
    what: "Looks at that brightness chart and gives your photo a plain-language label: mostly bright (\"high-key\"), mostly dark (\"low-key\"), or a balanced mix, plus a note if a chunk of detail got lost in solid black or white.",
    good: "A bright, airy portrait that's meant to be mostly light tones, with just a touch of dark for contrast. It gets labelled high-key, and a low \"lost detail\" number confirms nothing important got crushed away.",
    bad: "A photo that's just accidentally too dark gets the same \"low-key\" label as a photo that's moodily dark on purpose. The label alone can't tell you which one you've got, so check the brightness chart alongside it to be sure.",
    refs: [
      { text: 'Wikipedia: Zone system', url: 'https://en.wikipedia.org/wiki/Zone_system', note: 'the classic system this idea of "keys" and tone ranges comes from' }
    ]
  },
  waveform: {
    title: 'Waveform',
    what: "Similar to the brightness chart above, but instead of just counting pixels, it shows you where in the photo, left to right, the bright and dark areas actually are.",
    good: "The line rises and falls where you'd expect it to. For example, a bump where a lit face sits, without flattening out along the very top of the chart.",
    bad: "A flat line stuck at the very top across a big stretch of the photo. That's usually a sign that a sky or window has turned into solid, featureless white with nothing hiding underneath it.",
    refs: [
      { text: 'Blain Brown, "Cinematography: Theory and Practice"', note: 'covers this tool the way film crews actually use it' },
      { text: 'Wikipedia: Waveform monitor', url: 'https://en.wikipedia.org/wiki/Waveform_monitor', note: 'background on where this tool comes from (video production)' }
    ]
  },
  parade: {
    title: 'RGB Parade',
    what: "The same left-to-right brightness view as the Waveform, but split into three separate lines: one for red, one for green, one for blue, so you can spot when one color is out of balance with the others.",
    good: "The three colored lines rise and fall together in roughly the same shape, just shifted a little to match the photo's real colors, like warm skin showing a touch more red than blue.",
    bad: "One line, often blue under warm indoor lighting, sits much higher or lower than the other two across the whole photo. That's an unwanted color tint, not a brightness problem, and usually means the white balance needs fixing.",
    refs: [
      { text: 'Wikipedia: RGB color model', url: 'https://en.wikipedia.org/wiki/RGB_color_model', note: 'the basics of how red, green and blue combine to make every color on screen' }
    ]
  },
  vectorscope: {
    title: 'Vectorscope',
    what: "A circular chart of every color in your photo. Which direction a dot sits tells you which color (hue) it is; how far it sits from the center tells you how strong or vivid (saturated) that color is.",
    good: "The dots cluster in a way that matches what you were going for, without pushing hard against the outer edge of the circle.",
    bad: "Color pushed all the way out to the edge of the circle in one direction. That's a sign of oversaturated, clipped color, common with the punchy processing some phone cameras apply automatically.",
    refs: [
      { text: 'Wikipedia: Vectorscope', url: 'https://en.wikipedia.org/wiki/Vectorscope', note: 'a short explainer with example charts' }
    ]
  },
  cie: {
    title: 'CIE Chromaticity',
    what: "A map of every color your photo actually contains, laid out so you can see the full range of color used, separate from how bright or how strong those colors are.",
    good: "The colors form a clear, tight group in one part of the map. For instance, a photo that feels almost black-and-white clustering near the middle, or a colorful photo grouping into a few clear color families.",
    bad: "Colors scattered evenly all over the map with no real grouping. That's usually a sign of noise or a compression glitch scrambling the colors, not an actual rich, varied photo.",
    refs: [
      { text: 'Wikipedia: CIE 1931 color space', url: 'https://en.wikipedia.org/wiki/CIE_1931_color_space', note: 'more than you need, but the diagram itself is worth a look' }
    ]
  },
  tonecurve: {
    title: 'Tone Curve',
    what: "A line you can bend to control brightness and contrast. \"Measured\" shows how your photo's tones are actually spread out right now; \"Adjust\" lets you reshape that line yourself, the same way most photo-editing apps let you tweak contrast.",
    good: "A gentle S-shaped curve: darks pulled down a little, lights pushed up a little, and the middle barely touched. It adds a bit of punch without losing detail.",
    bad: "A curve bent into an extreme S, or one with a flat, level section in the middle. A flat section squashes a whole range of different tones into looking identical, quietly destroying detail there even though nothing looks obviously \"blown out.\"",
    refs: [
      { text: 'Michael Freeman, "The Photographer\'s Eye"', note: 'explains this kind of contrast control in plain, visual terms' }
    ]
  }
};

function refHtml(ref) {
  const label = ref.url
    ? `<a href="${ref.url}" target="_blank" rel="noopener">${ref.text}</a>`
    : ref.text;
  return `<li>${label}${ref.note ? `: ${ref.note}` : ''}</li>`;
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
