// The starter reference library PhotoWalk ships with.
//
// An empty Album makes the whole tab look broken: six filter dropdowns with
// nothing to filter, and an empty state that asks the user to go do work
// before the feature will show them anything. So a new profile is handed a
// small library of frames, once — the same bargain backstory.js strikes when
// it gives a new profile three months of practice to stand on.
//
// From that point on these are ordinary album items. They can be analyzed,
// re-saved, tagged and deleted, and deleting one is permanent: the seed only
// ever runs while `state.seededAlbum` is unset.
//
// Import direction is one-way (this module reads analysis.js, never the
// reverse), so nothing here can pull analysis.js into a cycle.

import { state, save } from './store.js';
import { putImage, deleteImage } from './db.js';
import { readExif } from './exif.js';
import { loadImage, uid } from './util.js';
import { albumRecord, measureForAlbum } from './analysis.js';

const DIR = './photos/';

// Listed in the order the album should read them, newest first. Chosen for
// spread rather than quality: the set has to put something in every filter
// bucket — bright and dark, landscape and portrait, wide and long, colour and
// near-monochrome — or the Album tab's dropdowns look broken on first open.
const BUNDLED = [
  'a_1.jpg',
  'dr-3474.jpg',
  'a_49.jpg',
  's.jpg',
  'a.jpg',
  'a_9.jpg',
  'a_31.jpg',
  'a_32.jpg',
  'a_25.jpg'
];

/**
 * Fetches one bundled frame, measures it, and files its pixels in IndexedDB.
 * Returns the album record, or null if that one photo could not be read — a
 * missing file costs its own thumbnail and nothing else.
 */
async function buildRecord(name) {
  const url = DIR + name;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const [img, exif] = await Promise.all([loadImage(url), readExif(blob)]);

    // The bundled files are already capped at ALBUM_MAX_DIM, so the blob goes
    // to storage as-is rather than through a re-encode that would only cost
    // quality.
    const imageId = uid();
    await putImage(imageId, blob);

    const { avgLum, palette } = measureForAlbum(img);
    return {
      ...albumRecord({
        imageId,
        width: img.naturalWidth,
        height: img.naturalHeight,
        avgLum,
        palette,
        exif
      }),
      // Marks it as ours, so `?photos=clear` can take back exactly what the
      // seed put in and leave the user's own references alone.
      seeded: true
    };
  } catch (err) {
    console.warn(`PhotoWalk: could not seed ${name}.`, err);
    return null;
  }
}

/**
 * Writes the whole starter library. Sequential on purpose: nine 1600px decodes
 * at once spikes memory on a phone, and this runs while the rest of the app is
 * still booting.
 */
export async function seedBundledPhotos() {
  const records = [];
  for (const name of BUNDLED) {
    const record = await buildRecord(name);
    if (record) records.push(record);
  }
  if (!records.length) {
    console.warn('PhotoWalk: no bundled photos could be read; the starter album was not seeded.');
    return null;
  }

  // Spread keeps the listed order at the front of the album, ahead of anything
  // the user has saved themselves.
  state.album.unshift(...records);
  state.seededAlbum = { count: records.length, seededAt: Date.now() };
  if (!save()) console.warn('PhotoWalk: the starter album could not be written to storage.');
  window.dispatchEvent(new CustomEvent('photowalk:stats-changed'));

  return { count: records.length, requested: BUNDLED.length };
}

/** Seeds only a profile that has never been seeded before. */
export async function maybeSeedBundledPhotos() {
  if (state.seededAlbum) return null;
  return seedBundledPhotos();
}

/**
 * Takes the starter library back out, pixels included, and clears the flag so
 * a reload seeds it fresh. References the user saved themselves are untouched.
 */
export async function clearBundledPhotos() {
  const mine = state.album.filter((item) => item.seeded);
  state.album = state.album.filter((item) => !item.seeded);
  state.seededAlbum = null;
  save();
  window.dispatchEvent(new CustomEvent('photowalk:stats-changed'));

  for (const item of mine) {
    if (item.imageId) await deleteImage(item.imageId).catch(() => {});
  }
  return { removed: mine.length };
}

/**
 * Console handle: photowalkPhotos.seed() writes the library again,
 * .clear() removes it, .status() reports what is currently seeded.
 */
export function installPhotoHooks() {
  window.photowalkPhotos = {
    seed: seedBundledPhotos,
    ensure: maybeSeedBundledPhotos,
    clear: clearBundledPhotos,
    status: () => ({
      ...(state.seededAlbum || { count: 0, seededAt: null }),
      bundled: BUNDLED.length,
      inAlbum: state.album.filter((item) => item.seeded).length,
      albumTotal: state.album.length
    })
  };
}
