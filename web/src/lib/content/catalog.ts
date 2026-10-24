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

// Challenges that fit more than one theme, written once so the wording (and
// its translation key) can't drift between them.
const SUN_BEHIND = N("Stand so the sun is behind the person or thing you're photographing");
const DARK_CUTOUT = N("Make someone a dark cutout: put them in front of a bright sky, then tap the sky on your screen");
const LINE_AT_BOTTOM = N("Crouch down so a line starts right at the bottom edge of your photo");
const PUDDLE_LOW = N("Crouch close to a puddle so the reflection fills most of the photo");
const PATTERN_FILL = N("Fill the whole photo with one repeating pattern: bricks, tiles, windows");
const SURFACE_CLOSE = N("Get so close to a rough surface that you can't tell what it is");
const LEAF_FRAME = N("Use leaves or branches around the edges like a picture frame");
const NEAR_MIDDLE_FAR = N("Put something close, your subject in the middle, and something else far behind");
const SMALL_IN_SPACE = N("Make your subject small, with lots of empty space around it");
const ALONE_IN_SKY = N("Find one bird, person or tree alone against the sky");
const STILL_AND_RUSHING = N("Catch someone standing still while something rushes past");
const MOVING_LIGHTS = N("Photograph moving lights at night, like cars or bikes");
const TINY_WORLD = N("Find a tiny world on the ground: a bug, or a flower in a crack");

export const RAW_THEMES: readonly RawTheme[] = [
  {
    id: "shadows-silhouettes",
    title: N("Shadows & Silhouettes"),
    brief: N("Hunt for hard light, long shadows, and shapes stripped of detail."),
    concepts: ["silhouette","warm-light"],
    challenges: [
      SUN_BEHIND,
      DARK_CUTOUT,
      N("Find a shadow with sharp edges on a wall or the ground"),
      N("Photograph just a shadow, without the thing that's making it"),
      N("Make your own shadow part of the photo"),
      N("Find light coming through a fence, blinds or leaves that makes stripes or spots"),
    ],
  },
  {
    id: "leading-lines",
    title: N("Leading Lines"),
    brief: N("Find lines in the environment that pull the eye through the frame."),
    concepts: ["leading-lines","thirds"],
    challenges: [
      N("Find a road, railway or fence that runs from the front of the photo into the distance"),
      LINE_AT_BOTTOM,
      N("Put your subject where the lines meet"),
      N("Use stairs or a handrail to point at something"),
      N("Follow lines painted on the ground, like a crosswalk or parking lines"),
      N("Stand in the middle of a hallway, tunnel or path and shoot straight down it"),
    ],
  },
  {
    id: "reflections",
    title: N("Reflections"),
    brief: N("Puddles, glass, and still water double the world in interesting ways."),
    concepts: ["reflection","thirds"],
    challenges: [
      N("Find a puddle, window or calm water with a reflection in it"),
      PUDDLE_LOW,
      N("Take a photo of only the reflection, not the real thing"),
      N("Use a shop window to show what's inside and what's reflected at the same time"),
      N("Find a reflection in something shiny: a car, a spoon, sunglasses"),
      N("Line up a reflection so the top and bottom halves match"),
    ],
  },
  {
    id: "urban-textures",
    title: N("Urban Textures"),
    brief: N("Peeling paint, brick, tile. Get close and let pattern be the subject."),
    concepts: ["texture-pattern","negative-space"],
    challenges: [
      PATTERN_FILL,
      SURFACE_CLOSE,
      N("Find a pattern with one piece that's different: a missing tile, an odd window"),
      N("Put two textures side by side, like smooth glass next to rough stone"),
      N("Find a wall where light from the side makes the bumps stand out"),
      N("Get so close to rust or peeling paint that it looks like a landscape"),
    ],
  },
  {
    id: "golden-hour",
    title: N("Golden Hour Glow"),
    brief: N("Time your walk around sunrise or sunset for warm, directional light."),
    concepts: ["warm-light","silhouette"],
    challenges: [
      N("Photograph something lit by warm light in the hour before sunset"),
      SUN_BEHIND,
      DARK_CUTOUT,
      N("Find a long shadow stretching across the ground"),
      N("Photograph a face or building lit by orange light from the side"),
      N("Catch sunlight glowing through leaves, hair or grass"),
    ],
  },
  {
    id: "framing-doorways",
    title: N("Framing & Doorways"),
    brief: N("Use the environment itself to build a frame around your subject."),
    concepts: ["framing","layers-depth"],
    challenges: [
      N("Take a photo through a doorway, window or arch"),
      LEAF_FRAME,
      NEAR_MIDDLE_FAR,
      N("Use the gap between two buildings as a frame"),
      N("Find a frame inside a frame, like a window seen through a doorway"),
      N("Use a mirror or a car's side mirror as a frame"),
    ],
  },
  {
    id: "color-pop",
    title: N("Color Pop"),
    brief: N("One bold color against a muted scene is an instant subject."),
    concepts: ["color-pop"],
    challenges: [
      N("Find one bright color on a dull, gray background"),
      N("Find a scene that's almost all gray with one colorful thing in it"),
      N("Photograph a person wearing a bright color"),
      N("Find two colors that look great together"),
      N("Fill the whole photo with a single color"),
      N("Find a brightly painted door, bike or sign"),
    ],
  },
  {
    id: "street-candid",
    title: N("Street Candid"),
    brief: N("Practice patience: wait for a moment to happen instead of chasing it."),
    concepts: ["layers-depth","negative-space"],
    challenges: [
      N("Photograph a stranger walking by, from a respectful distance in a public place"),
      N("Pick a nice spot and wait for someone to walk into it"),
      NEAR_MIDDLE_FAR,
      N("Catch a funny or surprising moment"),
      N("Photograph people from behind so the scene tells the story"),
      SMALL_IN_SPACE,
    ],
  },
  {
    id: "macro-details",
    title: N("Macro Details"),
    brief: N("Get close to something people usually walk past."),
    concepts: ["shallow-dof","texture-pattern"],
    challenges: [
      N("Get as close as your phone can still focus"),
      N("Photograph one small thing with a blurry background (try Portrait mode)"),
      N("Photograph something people walk past without noticing"),
      N("Find water drops on a leaf, car or window"),
      N("Photograph a flower from the side instead of from above"),
      SURFACE_CLOSE,
    ],
  },
  {
    id: "negative-space",
    title: N("Negative Space"),
    brief: N("Give your subject room to breathe in a mostly-empty frame."),
    concepts: ["negative-space","color-pop"],
    challenges: [
      SMALL_IN_SPACE,
      N("Use a plain sky, wall or floor as the empty part"),
      N("Leave more empty space than feels normal"),
      N("Put your subject near the edge of the photo, not in the middle"),
      ALONE_IN_SKY,
      N("Photograph a single object on a plain surface"),
    ],
  },
  {
    id: "motion-rhythm",
    title: N("Motion & Rhythm"),
    brief: N("Bikes, buses, birds: let the city move through your frame."),
    concepts: ["motion-blur","leading-lines"],
    challenges: [
      N("Photograph something moving and let it blur while the background stays sharp"),
      N("Follow a moving bike or car with your phone while you take the photo"),
      N("Freeze a moment: a jump, a step, a splash"),
      STILL_AND_RUSHING,
      N("Photograph moving water: a fountain, a river, rain off a roof"),
      MOVING_LIGHTS,
    ],
  },
  {
    id: "look-up",
    title: N("Look Up"),
    brief: N("Everything above eye level: rooftops, wires, trees, sky."),
    concepts: ["low-angle","negative-space"],
    challenges: [
      N("Point your phone straight up and photograph what's above you"),
      N("Photograph a roof, wire or branch against a plain sky"),
      N("Stand at the bottom of something tall and shoot up so it looks even taller"),
      N("Find something interesting on a ceiling or under a bridge"),
      ALONE_IN_SKY,
      N("Photograph clouds with the edge of a building in the photo"),
    ],
  },
  {
    id: "ground-level",
    title: N("Ground Level"),
    brief: N("Drop the camera to your ankles and shoot the world from below."),
    concepts: ["low-angle","leading-lines"],
    challenges: [
      N("Put your phone on the ground and take the photo from there"),
      N("Crouch so the ground fills the bottom half of your photo"),
      N("Photograph feet, wheels or paws at their own height"),
      LINE_AT_BOTTOM,
      PUDDLE_LOW,
      TINY_WORLD,
    ],
  },
  {
    id: "night-lights",
    title: N("Night Lights"),
    brief: N("After dark the light sources become the subjects."),
    concepts: ["night-glow","color-pop"],
    challenges: [
      N("Photograph a lit window, sign or street lamp in the dark"),
      N("Rest your phone on something steady and hold still while you take the photo"),
      N("Find two different colors of light in one photo"),
      N("Tap the brightest light on your screen so it doesn't turn white"),
      N("Find lights reflected in a wet street or a puddle"),
      MOVING_LIGHTS,
    ],
  },
  {
    id: "nature-in-city",
    title: N("Nature in the City"),
    brief: N("Find nature pushing back: weeds, roots, moss, and birds."),
    concepts: ["framing","shallow-dof"],
    challenges: [
      N("Photograph a plant growing somewhere it shouldn't, like a crack or a wall"),
      LEAF_FRAME,
      N("Get close to a small living thing and let the city blur behind it"),
      N("Photograph a bird or animal in the city"),
      N("Put a tree and a building side by side"),
      TINY_WORLD,
    ],
  },
  {
    id: "minimal-geometry",
    title: N("Minimal Geometry"),
    brief: N("Reduce the world to shapes: blocks of color, edges, and empty space."),
    concepts: ["negative-space","thirds"],
    challenges: [
      N("Take a photo with only 2 or 3 simple shapes in it"),
      N("Turn on your camera's grid and line up a roofline or the horizon with one of its lines"),
      N("Make a photo that looks abstract until you look twice"),
      N("Find one simple shape, like a circle or triangle, and make it the star"),
      N("Fill the photo with blocks of color: walls, doors, shadows"),
      PATTERN_FILL,
    ],
  },
  {
    id: "transit-waiting",
    title: N("Transit & Waiting"),
    brief: N("Stations, stops, and platforms: the in-between places people pass through."),
    concepts: ["leading-lines","motion-blur"],
    challenges: [
      N("Use train tracks, platform edges or a line of people to lead the eye"),
      STILL_AND_RUSHING,
      N("Photograph the moment someone arrives or leaves, not the ride"),
      N("Photograph people waiting, from a respectful distance"),
      N("Take a photo through a train or bus window"),
      N("Photograph a timetable, ticket gate or platform sign up close"),
    ],
  },
  {
    id: "hands-at-work",
    title: N("Hands at Work"),
    brief: N("Vendors, makers, gardeners. Tell a story through hands, not faces."),
    concepts: ["shallow-dof","motion-blur"],
    challenges: [
      N("Photograph hands doing something, respectfully (ask first if you're close)"),
      N("Make the hands sharp and the background blurry (try Portrait mode)"),
      N("Include the tool or material so it shows what the job is"),
      N("Photograph food being made at a stall or shop window"),
      N("Photograph your own hands doing something"),
      N("Photograph worn tools or gloves, without the hands"),
    ],
  },
];

export const RAW_CONCEPTS: Readonly<Record<string, { title: string; tip: string }>> = {
  "thirds": { title: N("Rule of Thirds"), tip: N("Place key subjects along the grid lines or their intersections instead of dead center.") },
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
  "night-glow": { title: N("Night Glow"), tip: N("After dark, lights become the subject. Hold your phone steady and tap on the lights so they don't blow out.") },
};
