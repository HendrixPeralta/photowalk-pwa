// The built-in walk themes and composition concepts. Generated once from the
// old app's js/concepts.js; edit here from now on.
//
// Strings are English translation keys wrapped in N(), which marks them for
// the i18n checker without translating. themes() and concept() in themes.ts
// hand out translated copies.

import { N } from "../i18n/core";

export interface RawTheme {
  id: string;
  title: string;
  brief: string;
  /** Concept keys, for the Live Walk theme tips. */
  concepts: string[];
  challenges: string[];
}

export const RAW_THEMES: readonly RawTheme[] = [
  {
    id: "shadows-silhouettes",
    title: N("Shadows & Silhouettes"),
    brief: N("Hunt for hard light, long shadows, and shapes stripped of detail."),
    concepts: ["silhouette","warm-light"],
    challenges: [
      N("Shoot when the sun is low and behind your subject"),
      N("Find a hard-edged shadow on a wall or sidewalk"),
      N("Turn a person or object into a pure silhouette"),
    ],
  },
  {
    id: "leading-lines",
    title: N("Leading Lines"),
    brief: N("Find lines in the environment that pull the eye through the frame."),
    concepts: ["leading-lines","thirds"],
    challenges: [
      N("Find a road, rail, or fence that leads into the frame"),
      N("Get low to exaggerate the line's pull"),
      N("Place your subject where the lines converge"),
    ],
  },
  {
    id: "reflections",
    title: N("Reflections"),
    brief: N("Puddles, glass, and still water double the world in interesting ways."),
    concepts: ["reflection","thirds"],
    challenges: [
      N("Find a puddle, window, or still water"),
      N("Try a low angle to fill the frame with the reflection"),
      N("Shoot one where the real subject is barely visible"),
    ],
  },
  {
    id: "urban-textures",
    title: N("Urban Textures"),
    brief: N("Peeling paint, brick, tile. Get close and let pattern be the subject."),
    concepts: ["texture-pattern","negative-space"],
    challenges: [
      N("Fill the frame with one repeating pattern"),
      N("Photograph a texture up close, with no context"),
      N("Look for a break or imperfection in a repetition"),
    ],
  },
  {
    id: "golden-hour",
    title: N("Golden Hour Glow"),
    brief: N("Time your walk around sunrise or sunset for warm, directional light."),
    concepts: ["warm-light","silhouette"],
    challenges: [
      N("Shoot 30 minutes before sunset"),
      N("Put the sun behind your subject and tap the sky to set exposure"),
      N("Capture a long shadow stretching across the frame"),
    ],
  },
  {
    id: "framing-doorways",
    title: N("Framing & Doorways"),
    brief: N("Use the environment itself to build a frame around your subject."),
    concepts: ["framing","layers-depth"],
    challenges: [
      N("Shoot through a doorway, window, or archway"),
      N("Use foliage or an object to frame the edges"),
      N("Add a second layer of depth behind the frame"),
    ],
  },
  {
    id: "color-pop",
    title: N("Color Pop"),
    brief: N("One bold color against a muted scene is an instant subject."),
    concepts: ["color-pop"],
    challenges: [
      N("Find one bright color against a muted background"),
      N("Shoot mostly grayscale, then find the one exception"),
      N("Try it with a person wearing a bold color"),
    ],
  },
  {
    id: "street-candid",
    title: N("Street Candid"),
    brief: N("Practice patience: wait for a moment to happen instead of chasing it."),
    concepts: ["layers-depth","negative-space"],
    challenges: [
      N("Capture a stranger in motion, respectfully, in public"),
      N("Wait in one spot for a moment to come to you"),
      N("Look for overlapping layers: foreground, subject, background"),
    ],
  },
  {
    id: "macro-details",
    title: N("Macro Details"),
    brief: N("Get close to something people usually walk past."),
    concepts: ["shallow-dof","texture-pattern"],
    challenges: [
      N("Get as close as your lens allows"),
      N("Isolate one small detail with a blurred background"),
      N("Photograph something people usually overlook"),
    ],
  },
  {
    id: "negative-space",
    title: N("Negative Space"),
    brief: N("Give your subject room to breathe in a mostly-empty frame."),
    concepts: ["negative-space","color-pop"],
    challenges: [
      N("Place your subject small in a large empty area"),
      N("Use a plain sky, wall, or floor as the space"),
      N("Leave more empty room than feels comfortable"),
    ],
  },
  {
    id: "motion-rhythm",
    title: N("Motion & Rhythm"),
    brief: N("Bikes, buses, birds: let the city move through your frame."),
    concepts: ["motion-blur","leading-lines"],
    challenges: [
      N("Capture something moving while the background stays sharp"),
      N("Pan with a moving subject so the background streaks instead"),
      N("Freeze a moment mid-motion: a step, a jump, a splash"),
    ],
  },
  {
    id: "look-up",
    title: N("Look Up"),
    brief: N("Everything above eye level: rooftops, wires, trees, sky."),
    concepts: ["low-angle","negative-space"],
    challenges: [
      N("Point the camera straight up and shoot what converges"),
      N("Frame a rooftop, wire, or branch against plain sky"),
      N("Shoot a tall subject from its base to exaggerate its height"),
    ],
  },
  {
    id: "ground-level",
    title: N("Ground Level"),
    brief: N("Drop the camera to your ankles and shoot the world from below."),
    concepts: ["low-angle","leading-lines"],
    challenges: [
      N("Shoot with the camera resting on the ground"),
      N("Use the pavement itself as a giant foreground"),
      N("Catch feet, wheels, or paws passing at their own eye level"),
    ],
  },
  {
    id: "sense-of-scale",
    title: N("Sense of Scale"),
    brief: N("Pair something tiny with something huge and let the contrast speak."),
    concepts: ["scale-contrast","negative-space"],
    challenges: [
      N("Photograph a person dwarfed by a building or landscape"),
      N("Include something familiar to make a big scene measurable"),
      N("Reverse it: shoot something tiny so it looks monumental"),
    ],
  },
  {
    id: "night-lights",
    title: N("Night Lights"),
    brief: N("After dark the light sources become the subjects."),
    concepts: ["night-glow","color-pop"],
    challenges: [
      N("Shoot a lit window, sign, or streetlamp against the dark"),
      N("Brace your phone on something solid and hold still"),
      N("Find two different colors of light in one frame"),
    ],
  },
  {
    id: "weather-mood",
    title: N("Weather & Mood"),
    brief: N("Rain, fog, wind, and heavy clouds do the atmosphere for you."),
    concepts: ["negative-space","layers-depth"],
    challenges: [
      N("Make the weather itself visible in the frame"),
      N("Shoot how the light changes under clouds or through fog"),
      N("Find someone or something reacting to the weather"),
    ],
  },
  {
    id: "signs-letters",
    title: N("Signs & Letters"),
    brief: N("Hunt for lettering: hand-painted, neon, worn, or accidental."),
    concepts: ["color-pop","texture-pattern"],
    challenges: [
      N("Photograph a sign so old it has become texture"),
      N("Isolate a single letter or number as the subject"),
      N("Find words that mean something new out of context"),
    ],
  },
  {
    id: "nature-in-city",
    title: N("Nature in the City"),
    brief: N("Find nature pushing back: weeds, roots, moss, and birds."),
    concepts: ["framing","shallow-dof"],
    challenges: [
      N("Photograph a plant growing where it should not"),
      N("Frame something man-made through leaves or branches"),
      N("Get close to one small living detail and blur the city behind it"),
    ],
  },
  {
    id: "curves-spirals",
    title: N("Curves & Spirals"),
    brief: N("Skip the straight lines. Hunt for arcs, bends, and coils instead."),
    concepts: ["golden","leading-lines"],
    challenges: [
      N("Find a staircase, ramp, or road that curves through the frame"),
      N("Let one arc carry the eye from a corner to your subject"),
      N("Shoot a spiral: a shell, a hose, or a stairwell from above or below"),
    ],
  },
  {
    id: "symmetry-hunt",
    title: N("Symmetry Hunt"),
    brief: N("Find scenes that mirror themselves, then decide whether to break them."),
    concepts: ["reflection","framing"],
    challenges: [
      N("Center a perfectly symmetrical scene, dead-on"),
      N("Use a reflection to complete the symmetry"),
      N("Break it: add one off-center element to a symmetrical frame"),
    ],
  },
  {
    id: "minimal-geometry",
    title: N("Minimal Geometry"),
    brief: N("Reduce the world to shapes: blocks of color, edges, and empty space."),
    concepts: ["negative-space","thirds"],
    challenges: [
      N("Shoot a frame with three or fewer shapes in it"),
      N("Line up an edge in the scene with a rule-of-thirds line"),
      N("Make a photo that reads as abstract until you look twice"),
    ],
  },
  {
    id: "wear-and-decay",
    title: N("Wear & Decay"),
    brief: N("Rust, cracks, and fading paint. Photograph what time leaves behind."),
    concepts: ["texture-pattern","layers-depth"],
    challenges: [
      N("Find something old beside something new in one frame"),
      N("Get close enough that rust or peeling paint becomes a landscape"),
      N("Make a repair the subject: tape, a patch, or a weld"),
    ],
  },
  {
    id: "transit-waiting",
    title: N("Transit & Waiting"),
    brief: N("Stations, stops, and platforms: the in-between places people pass through."),
    concepts: ["leading-lines","motion-blur"],
    challenges: [
      N("Use tracks, platform edges, or queue lines to lead the eye"),
      N("Contrast someone waiting still with something rushing past"),
      N("Shoot the moment of arrival or departure, not the ride"),
    ],
  },
  {
    id: "hands-at-work",
    title: N("Hands at Work"),
    brief: N("Vendors, makers, gardeners. Tell a story through hands, not faces."),
    concepts: ["shallow-dof","motion-blur"],
    challenges: [
      N("Photograph hands mid-task, respectfully, in public"),
      N("Isolate the hands with a blurred background"),
      N("Include the tool or material, and let it explain the job"),
    ],
  },
];

export const RAW_CONCEPTS: Readonly<Record<string, { title: string; tip: string }>> = {
  "thirds": { title: N("Rule of Thirds"), tip: N("Place key subjects along the grid lines or their intersections instead of dead center.") },
  "golden": { title: N("Golden Ratio"), tip: N("A softer take on the rule of thirds. The spiral leads the eye naturally toward the subject.") },
  "leading-lines": { title: N("Leading Lines"), tip: N("Use roads, rails, or fences that draw the eye toward your subject.") },
  "reflection": { title: N("Reflections & Symmetry"), tip: N("Still water, glass, and mirrors let you double a subject for a neat, balanced look.") },
  "framing": { title: N("Natural Framing"), tip: N("Shoot through doorways, arches, or branches to add depth and draw focus inward.") },
  "silhouette": { title: N("Silhouette"), tip: N("Tap the bright background to set exposure, so your subject turns into a dark, solid shape.") },
  "texture-pattern": { title: N("Texture & Pattern"), tip: N("Fill the whole frame with a repeating pattern, then look for the one break in it.") },
  "negative-space": { title: N("Negative Space"), tip: N("Let empty sky, wall, or floor dominate the frame so the small subject reads clearly.") },
  "warm-light": { title: N("Golden Hour Light"), tip: N("Shoot when the sun is low for warm color and long, dramatic shadows.") },
  "layers-depth": { title: N("Layers & Depth"), tip: N("Combine a foreground, subject, and background so the frame reads in three dimensions.") },
  "color-pop": { title: N("Color Pop"), tip: N("One saturated color against a muted scene reads instantly as the subject.") },
  "shallow-dof": { title: N("Shallow Depth of Field"), tip: N("A wide aperture (a small f-number like f/1.8) or your phone's Portrait mode blurs the background so one sharp subject stands out.") },
  "motion-blur": { title: N("Motion & Blur"), tip: N("Let moving things blur while something still stays sharp, or move the camera along with the motion.") },
  "low-angle": { title: N("Change Your Angle"), tip: N("Shoot from your knees or point straight up. Unusual angles make familiar places look new.") },
  "scale-contrast": { title: N("Sense of Scale"), tip: N("A tiny figure beside something huge tells the viewer exactly how big the scene is.") },
  "night-glow": { title: N("Night Glow"), tip: N("After dark, lights become the subject. Hold your phone steady and tap on the lights so they don't blow out.") },
};
