// The photo open on the Analysis screen and everything measured from it.
// Kept outside the screen (and never saved), so leaving the tab and coming
// back only redraws instead of re-measuring.

import { create } from "zustand";
import { albumRecord } from "@/lib/analysis/album";
import { ALBUM_MAX_DIM, DEFAULT_PHOTO_URL, MAX_DIM, OVERLAY_TYPES } from "@/lib/analysis/constants";
import { computeHistogram, type Histogram } from "@/lib/analysis/histogram";
import { computePalette } from "@/lib/analysis/palette";
import { imageUrl, putImage } from "@/lib/db";
import { isHeif, readExif, type Exif } from "@/lib/exif";
import { t } from "@/lib/i18n/core";
import { canvasToBlob, drawToCanvas, loadImage, readFileAsDataUrl } from "@/lib/image";
import { computeScopes, type Rgb, type Scopes } from "@/lib/scopes/compute";
import { addFrame } from "@/lib/stats";
import { ToneCurveModel } from "@/lib/tonecurve/model";
import { uid } from "@/lib/util";
import { getData, update, warnIfStorageTight } from "@/state/appStore";
import type { AlbumItem, Overlay, OverlayType } from "@/state/types";
import { showToast } from "@/state/ui";

export type ScopeKey = "waveform" | "parade" | "vectorscope" | "cie" | "tonecurve";
export type ScopeView = ScopeKey | "all";

/** A photo and the numbers measured from its 640px sample. */
export interface Frame {
  /** Different for every photo opened, for UI that should start fresh per photo. */
  id: number;
  image: HTMLImageElement;
  hist: Histogram;
  palette: Rgb[];
  scopes: Scopes;
}

interface Session {
  frame: Frame | null;
  exif: Exif | null;
  /** Set when a saved reference is open: saving updates it instead of adding a copy. */
  albumItemId: string | null;
  overlay: Overlay;
  tags: string;
  /** A reference from the album shown beside the photo. */
  compare: { item: AlbumItem; image: HTMLImageElement; hist: Histogram } | null;
  scopeView: ScopeView;
  scopesOpen: boolean;
  /** Bumped whenever the tone curve changes, so what shows it redraws. */
  curveVersion: number;
}

const DEFAULT_OVERLAY: Overlay = { type: "thirds", flip: false, rotation: 0 };

export const useAnalysis = create<Session>(() => ({
  frame: null,
  exif: null,
  albumItemId: null,
  overlay: DEFAULT_OVERLAY,
  tags: "",
  compare: null,
  scopeView: "waveform",
  scopesOpen: false,
  curveVersion: 0,
}));

/** The tone curve belongs to the open photo; one instance, like the screen. */
export const toneCurve = new ToneCurveModel(() =>
  useAnalysis.setState((s) => ({ curveVersion: s.curveVersion + 1 })),
);

let frameIds = 0;

/** Every load takes a number; a load that finishes after a newer one started is dropped. */
let loadSeq = 0;
let defaultTried = false;

/** Measures a decoded image the way the screen reads it. Browser-only. */
export function measure(image: HTMLImageElement): Frame {
  const sample = drawToCanvas(image, MAX_DIM);
  const data = sample.getContext("2d")!.getImageData(0, 0, sample.width, sample.height);
  return { id: ++frameIds, image, hist: computeHistogram(data), palette: computePalette(data), scopes: computeScopes(data) };
}

interface ShowOptions {
  exif?: Exif | null;
  albumItemId?: string | null;
  /** A saved reference's guide and tags, put back as they were saved. */
  overlay?: Overlay | null;
  tags?: string[];
}

function show(image: HTMLImageElement, opts: ShowOptions = {}): void {
  const frame = measure(image);
  // A curve belongs to the photo it was drawn against, so a new photo starts
  // straight, over the new photo's histogram.
  toneCurve.clear();
  toneCurve.setHistogram(frame.hist.bins);
  useAnalysis.setState((s) => ({
    frame,
    exif: opts.exif ?? null,
    albumItemId: opts.albumItemId ?? null,
    // Keep the user's chosen guide across photos, unless a reference brings its own.
    overlay: opts.overlay ? normalizeOverlay(opts.overlay) : s.overlay,
    tags: opts.tags?.join(", ") ?? "",
    compare: null,
    curveVersion: s.curveVersion + 1,
  }));
}

function normalizeOverlay(o: Overlay): Overlay {
  return {
    type: OVERLAY_TYPES.includes(o.type) ? o.type : "thirds",
    flip: Boolean(o.flip),
    rotation: Number.isInteger(o.rotation) ? ((o.rotation % 4) + 4) % 4 : 0,
  };
}

/** A photo picked from the device. Counts toward "photos analyzed". */
export async function analyzeFile(file: File): Promise<void> {
  const seq = ++loadSeq;
  const exifPromise = readExif(file);
  let image: HTMLImageElement;
  try {
    image = await loadImage(await readFileAsDataUrl(file));
  } catch {
    // Safari is the only browser that decodes HEIC, the iPhone default, so
    // say which problem this is.
    showToast(await isHeif(file)
      ? t("This browser can't open HEIC photos. Save the photo as a JPEG and try again.")
      : t("That file could not be opened as an image."));
    return;
  }
  if (seq !== loadSeq) return;
  show(image);
  update((d) => { d.profile.photosAnalyzed += 1; });

  const exif = await exifPromise;
  // Another photo may have opened while the EXIF was being read.
  if (useAnalysis.getState().frame?.image === image) useAnalysis.setState({ exif });
}

export interface StoredPhoto extends ShowOptions {
  imageId: string;
}

/** A photo already in storage: a walk's frame, a room photo or an album reference. */
export async function analyzeStored({ imageId, ...opts }: StoredPhoto): Promise<boolean> {
  const seq = ++loadSeq;
  const url = await imageUrl(imageId);
  if (!url) {
    showToast(t("This photo is missing from storage."));
    return false;
  }
  let image: HTMLImageElement;
  try {
    image = await loadImage(url);
  } catch {
    showToast(t("Could not open this photo."));
    return false;
  }
  if (seq !== loadSeq) return false;
  show(image, opts);
  return true;
}

/**
 * The bundled sample photo, so every tool on the screen has something to read
 * on a first visit. Once per session, and only while nothing else is open or
 * on its way: it never lands on top of a photo the user chose, and "Choose
 * Another Photo" stays a way out rather than a loop back here.
 */
export async function loadDefaultPhoto(): Promise<boolean> {
  if (defaultTried || loadSeq > 0 || useAnalysis.getState().frame) return false;
  defaultTried = true;
  const seq = ++loadSeq;
  try {
    const [image, exif] = await Promise.all([
      loadImage(DEFAULT_PHOTO_URL),
      fetch(DEFAULT_PHOTO_URL).then((res) => (res.ok ? res.blob().then(readExif) : null)),
    ]);
    if (seq !== loadSeq) return false;
    // Not counted as analyzed: the app opened it, the user didn't.
    show(image, { exif });
    return true;
  } catch (err) {
    console.warn("PhotoEYE: could not load the sample photo.", err);
    return false;
  }
}

/** Choose Another Photo: back to the empty screen. */
export function resetSession(): void {
  ++loadSeq;
  toneCurve.clear();
  useAnalysis.setState((s) => ({
    frame: null,
    exif: null,
    albumItemId: null,
    overlay: DEFAULT_OVERLAY,
    tags: "",
    compare: null,
    curveVersion: s.curveVersion + 1,
  }));
}

/* ---------- Guides ---------- */

export function setOverlayType(type: OverlayType): void {
  useAnalysis.setState((s) => ({ overlay: { ...s.overlay, type } }));
}

/** Golden Triangles mirrored are the Harmonious Triangles. */
export function flipOverlay(): void {
  useAnalysis.setState((s) => ({ overlay: { ...s.overlay, flip: !s.overlay.flip } }));
}

/** The spirals can start from any corner. */
export function rotateOverlay(): void {
  useAnalysis.setState((s) => ({ overlay: { ...s.overlay, rotation: (s.overlay.rotation + 1) % 4 } }));
}

export function resetOverlay(): void {
  useAnalysis.setState((s) => ({ overlay: { ...s.overlay, flip: false, rotation: 0 } }));
}

/* ---------- Compare ---------- */

/** Opens a saved reference beside the photo, with the same guide and its own histogram. */
export async function enterCompare(item: AlbumItem): Promise<void> {
  const url = await imageUrl(item.imageId);
  if (!url) {
    showToast(t("This reference is missing from storage."));
    return;
  }
  let image: HTMLImageElement;
  try {
    image = await loadImage(url);
  } catch {
    showToast(t("Could not open that reference."));
    return;
  }
  const sample = drawToCanvas(image, MAX_DIM);
  const hist = computeHistogram(sample.getContext("2d")!.getImageData(0, 0, sample.width, sample.height));
  useAnalysis.setState({ compare: { item, image, hist } });
}

export function exitCompare(): void {
  useAnalysis.setState({ compare: null });
}

/* ---------- Saving ---------- */

const parseTags = (text: string) => text.split(",").map((tag) => tag.trim()).filter(Boolean);

/**
 * Saves the photo to the Reference Album at a size worth studying later, with
 * its guide and tags. A reference opened from the album is updated in place.
 */
export async function saveToAlbum(): Promise<void> {
  const { frame, exif, albumItemId, overlay, tags } = useAnalysis.getState();
  if (!frame) return;
  const tagList = parseTags(tags);

  if (albumItemId) {
    if (getData().album.some((i) => i.id === albumItemId)) {
      update((d) => {
        const item = d.album.find((i) => i.id === albumItemId)!;
        item.tags = tagList;
        item.overlay = { ...overlay };
      });
      showToast(t("Reference updated."));
      return;
    }
    // Deleted while it was open: save it as a new reference instead.
    useAnalysis.setState({ albumItemId: null });
  }

  try {
    const full = drawToCanvas(frame.image, ALBUM_MAX_DIM);
    const imageId = uid();
    await putImage(imageId, await canvasToBlob(full, "image/jpeg", 0.85));
    const record = albumRecord({
      imageId,
      width: full.width,
      height: full.height,
      avgLum: frame.hist.avgLum,
      palette: frame.palette,
      exif,
      tags: tagList,
      overlay: { ...overlay },
      themeId: getData().activeWalk?.themeId ?? null,
    });
    update((d) => {
      d.album.unshift(record);
      addFrame(d);
    });
    useAnalysis.setState({ tags: "" });
    showToast(t("Saved to your Reference Album."));
    void warnIfStorageTight();
  } catch (err) {
    console.warn("PhotoEYE: could not save the reference.", err);
    showToast(t("Couldn't save this reference. Your device may be out of storage."));
  }
}
