// Reference material for the "Learn more" buttons next to each Analysis tool: what the
// tool actually measures, how to read it, a good and a bad example to
// calibrate against, and somewhere to read more. Written for someone who has
// never used any of this before, not for someone who already knows the
// vocabulary. Content only.
//
// Ported from the old app's js/toolhelp.js. Strings wrapped in N() are
// translation keys; book titles are left as written. toolHelp() returns a
// translated copy.

import { getLang, N, t } from "@/lib/i18n/core";

export type ToolKey = "composition" | "gamut" | "histogram" | "tonalkey" | "waveform" | "parade" | "vectorscope" | "cie" | "tonecurve";

/** A link, optionally with a Japanese version used when Japanese is on. */
type RawUrl = string | { en: string; ja: string };

interface RawRef { text: string; url?: RawUrl; note?: string }

interface RawHelp {
  title: string;
  what: string;
  read: string;
  /** Named items explained under "How to read it", like the guide types. */
  list?: [string, string][];
  good: string;
  bad: string;
  extra?: string;
  refs: RawRef[];
}

export interface HelpRef { text: string; url?: string; note?: string }
export interface ToolHelp extends Omit<RawHelp, "refs"> { refs: HelpRef[] }

const RAW: Record<ToolKey, RawHelp> = {
  composition: {
    title: N('Composition Guides'),
    what: N("Lines drawn over your photo to show where the main subject sits. They're based on layouts that painters and photographers have used for centuries because they tend to feel balanced and lead the eye."),
    read: N("Pick a guide from the menu and see whether the important parts of your photo (a face, the horizon, a tree, the brightest spot) land on or near the lines, especially where lines cross. Close is good enough. These are ways of looking, not rules to obey."),
    list: [
      [N('Rule of Thirds'), N('two lines each way, splitting the photo into nine equal boxes. Put your subject on a line or where two cross, and the horizon along the top or bottom line. The easiest one to start with.')],
      [N('Golden Ratio'), N('like the rule of thirds, but the lines sit a little closer to the middle. It often feels a bit more natural.')],
      [N('Golden Triangles'), N('one diagonal corner to corner, plus two shorter lines meeting it at right angles. Good for photos with slanted lines, like a road, a slope or a leaning shadow. Flip mirrors it for diagonals that run the other way.')],
      [N('Spiral Section'), N('the photo divided into ever-smaller squares, the frame the golden spiral is built on. Put your subject in the smallest box.')],
      [N('Golden Spiral'), N('a curve that winds in toward one point. Place your subject where the spiral tightens, and let curved lines in the scene follow it. Rotate turns it to start from another corner.')]
    ],
    good: N("A portrait where the person's eyes sit on the top third line and their face sits just off center, with space in front of them in the direction they are looking."),
    bad: N("Everything lined up dead center with the horizon cutting the photo exactly in half, when nothing about the scene is symmetrical. It isn't wrong, but it often feels static. Centered works best for scenes that really are symmetrical, like a reflection or a doorway."),
    extra: N("Reset puts Flip and Rotate back to how they started. Compare opens a photo from your Reference Album side by side with yours, with the same guide on both."),
    refs: [
      { text: 'Michael Freeman, "The Photographer\'s Eye"', note: N('the go-to book on composition, full of clear examples') },
      { text: N('Wikipedia: Rule of thirds'), url: { en: 'https://en.wikipedia.org/wiki/Rule_of_thirds', ja: 'https://ja.wikipedia.org/wiki/三分割法' }, note: N('examples of the simplest guide in use') },
      { text: N('Wikipedia: Golden ratio'), url: { en: 'https://en.wikipedia.org/wiki/Golden_ratio', ja: 'https://ja.wikipedia.org/wiki/黄金比' }, note: N('where the spiral and golden lines come from') }
    ]
  },
  gamut: {
    title: N('Main Colors'),
    what: N("Finds the handful of colors that fill most of your photo, shows how much space each one takes up, and tells you whether they work together as a color scheme."),
    read: N("The bar is your photo's colors lined up by size: a wider block means more of the photo is that color. Tap a block to copy its color code. Above the bar, Color Harmony names the scheme. Complementary means colors from opposite sides of the color wheel, like orange and blue. Analogous means neighbors, like yellow, orange and red. Monochrome means one color plus grays."),
    good: N("A sunset with a warm orange sky over cool blue water comes back as Complementary. Opposite colors make each other stand out, which is why this pairing is so common in photos and film posters."),
    bad: N("A photo taken under mixed indoor lights comes back with four or five murky, slightly different greens and yellows, labeled Mixed. That isn't a color choice. The camera was confused by the lighting. Setting white balance, or shooting near a window, usually fixes it."),
    refs: [
      { text: 'Johannes Itten, "The Art of Color"', note: N('a gentle, classic introduction to how colors relate to each other') },
      { text: 'Josef Albers, "Interaction of Color"', note: N("short and visual, showing how colors change depending on what's next to them") },
      { text: 'Wikipedia: Color scheme', url: 'https://en.wikipedia.org/wiki/Color_scheme', note: N('a quick guide to the scheme names (complementary, analogous and so on)') }
    ]
  },
  histogram: {
    title: N('Brightness Chart'),
    what: N("Shows how much of your photo is dark, how much is bright, and how much sits in between. Photographers call this a histogram, and most cameras and editing apps can show one."),
    read: N("Left is black, right is white, and the middle is everything in between. The taller the chart at a spot, the more of the photo has that brightness. There's no single right shape: a snowy scene should lean right and a night scene should lean left. What matters is the two edges."),
    good: N("The chart fades down to almost nothing before it reaches either edge. That means even the darkest shadows and brightest highlights still have detail you can see and edit."),
    bad: N("A tall spike pressed against the right edge means part of the photo is pure white, often a sky or window, with nothing left to recover. A spike against the left edge means the same for pure black. On your next shot, tap the bright or dark area on your phone screen before shooting so the camera exposes for it."),
    refs: [
      { text: 'Ansel Adams, "The Negative"', note: N('the classic book on how light and dark map onto a photo') },
      { text: 'Wikipedia: Image histogram', url: 'https://en.wikipedia.org/wiki/Image_histogram', note: N('a short explainer with example charts') }
    ]
  },
  tonalkey: {
    title: N('Tonal Key'),
    what: N("Reads the brightness chart for you and sums up the overall mood of your photo in a few words: mostly bright (high-key), mostly dark (low-key), high contrast, low contrast, or balanced."),
    read: N("The title is the verdict and the tag beside it is the mood it usually gives (Airy, Moody, Punchy, Soft or Even). Open it to see how much of the photo is dark or bright, and how much is pure black or pure white. Anything above about 1% pure white or pure black is detail you've lost."),
    good: N("A bright, airy portrait you meant to keep light comes back as High-key with almost 0% pure white. The label matches your plan and no detail was lost."),
    bad: N("A photo that is just too dark by accident gets the same Low-key label as one that is dark on purpose. The tool can't read your mind, so treat the label as a description, not a grade. If it doesn't match what you were going for, that's your cue to adjust exposure next time."),
    refs: [
      { text: 'Wikipedia: High-key lighting', url: 'https://en.wikipedia.org/wiki/High-key_lighting', note: N('examples of bright, low-shadow photos') },
      { text: 'Wikipedia: Low-key lighting', url: 'https://en.wikipedia.org/wiki/Low-key_lighting', note: N('examples of dark, dramatic photos') }
    ]
  },
  waveform: {
    title: N('Waveform'),
    what: N("A brightness chart that keeps its place in the photo. Instead of piling every pixel into one heap, it shows how bright each part of the photo is from left to right. Film and video crews use it to check exposure."),
    read: N("Left to right on the chart matches left to right in your photo. Higher up means brighter: the top line is pure white and the bottom line is pure black. So a bright window on the right side of your photo shows up as a high patch on the right side of the chart."),
    good: N("The shape rises where you expect light, like a bump where a sunlit face is, but stays just under the top line. The brightest parts are bright and still have detail."),
    bad: N("A flat, solid band pressed against the top line across a wide stretch. That's usually a sky or window that has turned into plain white with nothing left in it. Try tapping that part of the screen before you shoot so your camera exposes for it."),
    refs: [
      { text: 'Blain Brown, "Cinematography: Theory and Practice"', note: N('covers this tool the way film crews actually use it') },
      { text: 'Wikipedia: Waveform monitor', url: 'https://en.wikipedia.org/wiki/Waveform_monitor', note: N('background on where this tool comes from (video production)') }
    ]
  },
  parade: {
    title: N('RGB Parade'),
    what: N("Three waveforms side by side: one for red, one for green, one for blue. Every color on a screen is a mix of those three, so comparing them shows whether your photo has an unwanted color tint."),
    read: N("Compare the bottoms of the three panels, then the tops. Something white or gray in real life should have red, green and blue at the same height. If one panel sits clearly higher than the others, that color is tinting the photo."),
    good: N("The three panels have roughly the same shape and line up at the top and bottom, with small differences where the scene really is colorful, like a little extra red over a warm face."),
    bad: N("The blue panel sits well below the other two across the whole photo, which happens a lot under warm indoor bulbs. The whole photo looks orange. That's a white balance problem, and the temperature or white balance slider in most editing apps fixes it."),
    refs: [
      { text: 'Wikipedia: Color balance', url: 'https://en.wikipedia.org/wiki/Color_balance', note: N('what a color tint is and how people correct it') },
      { text: N('Wikipedia: RGB color model'), url: { en: 'https://en.wikipedia.org/wiki/RGB_color_model', ja: 'https://ja.wikipedia.org/wiki/RGB' }, note: N('how red, green and blue combine to make every color on screen') }
    ]
  },
  vectorscope: {
    title: N('Vectorscope'),
    what: N("A round chart that shows which colors are in your photo and how strong they are, ignoring brightness completely."),
    read: N("Think of it as a color wheel. The direction a dot sits in tells you its color (reds one way, blues the opposite way). The distance from the center tells you how vivid it is: the center is gray, and the farther out, the stronger the color. The dashed line is where skin tones fall, for every skin color."),
    good: N("Most dots stay in the inner part of the circle, leaning toward the colors you actually saw. If there's a person in the photo, their skin sits on or near the dashed line."),
    bad: N("A streak shooting out to the edge of the circle means that color is overdone, which often happens with heavy filters or a saturation slider pushed too far. Skin that lands well away from the dashed line usually looks too orange, too pink or slightly green."),
    refs: [
      { text: 'Wikipedia: Vectorscope', url: 'https://en.wikipedia.org/wiki/Vectorscope', note: N('a short explainer with example charts') },
      { text: 'Wikipedia: Colorfulness', url: 'https://en.wikipedia.org/wiki/Colorfulness', note: N('what saturation means, in plain terms') }
    ]
  },
  cie: {
    title: N('CIE Chromaticity'),
    what: N("A map of every color your photo uses, drawn over a map of all the colors people can see. It shows the range of colors in the photo and whether the overall light leans warm or cool."),
    read: N("The horseshoe is every color the human eye can see. The triangle inside it is the smaller set of colors a normal screen can show. Your photo's colors appear as a cloud. The white cross (D65) marks normal daylight: if the cloud's average sits near it, the light looks natural. Toward orange means warmer, toward blue means cooler."),
    good: N("A colorful street scene spreads its cloud across a good part of the triangle. A foggy morning stays in a small cloud near the white cross. Both are right for their scene."),
    bad: N("The whole cloud has slid off toward orange or blue when the scene didn't look that way to you. The camera's white balance got it wrong. Correcting white balance in an editing app moves the cloud back toward the cross."),
    refs: [
      { text: 'Wikipedia: CIE 1931 color space', url: 'https://en.wikipedia.org/wiki/CIE_1931_color_space', note: N('more than you need, but the horseshoe diagram is worth a look') },
      { text: N('Wikipedia: Color temperature'), url: { en: 'https://en.wikipedia.org/wiki/Color_temperature', ja: 'https://ja.wikipedia.org/wiki/色温度' }, note: N('why candlelight looks orange and shade looks blue') }
    ]
  },
  tonecurve: {
    title: N('Tone Curve'),
    what: N("The tool most editing apps use to fine-tune brightness and contrast. Here you can see how your photo's tones are spread, then try bending the curve to preview a change."),
    read: N("Measured shows your photo as it is: the line climbs from dark on the left to bright on the right, and a steep stretch means lots of the photo sits in that range of tones. Switch to Adjust to edit. The straight line means no change. Tap to add a point, drag it up to brighten those tones or down to darken them, and double-tap a point to remove it."),
    good: N("A gentle S-shape: the dark end pulled down a little and the bright end pushed up a little. It adds punch and makes the photo feel crisper without losing detail."),
    bad: N("A steep, extreme S, or a section of the line pushed flat and level. A flat section turns a whole range of different tones into the same shade, so detail quietly disappears there, even if nothing looks obviously overexposed."),
    refs: [
      { text: 'Michael Freeman, "The Photographer\'s Eye"', note: N('explains contrast and tone in plain, visual terms') },
      { text: 'Wikipedia: Curve (tonality)', url: 'https://en.wikipedia.org/wiki/Curve_(tonality)', note: N('a short explainer with examples') }
    ]
  }
};

/** The help for one tool, translated, with links resolved for the current language. */
export function toolHelp(key: ToolKey): ToolHelp {
  const raw = RAW[key];
  const ja = getLang() === "ja";
  return {
    title: t(raw.title),
    what: t(raw.what),
    read: t(raw.read),
    list: raw.list?.map(([name, text]) => [t(name), t(text)] as [string, string]),
    good: t(raw.good),
    bad: t(raw.bad),
    extra: raw.extra ? t(raw.extra) : undefined,
    refs: raw.refs.map((ref) => ({
      // Untranslated titles (books) fall back to themselves.
      text: t(ref.text),
      url: typeof ref.url === "object" ? (ja ? ref.url.ja : ref.url.en) : ref.url,
      note: ref.note ? t(ref.note) : undefined,
    })),
  };
}

export const TOOL_KEYS = Object.keys(RAW) as ToolKey[];
