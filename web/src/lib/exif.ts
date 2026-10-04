// Minimal, dependency-free EXIF reader for JPEG files.
// Only handles the tags PhotoEYE's reference album cares about.
// Returns null when the file isn't a JPEG or carries no EXIF block (very
// common for screenshots, PNGs, and images re-saved by messaging apps), which
// is exactly the "Data Extraction" limitation called out in the PRD.

export interface Exif {
  make?: string;
  model?: string;
  /** Raw f-number, e.g. 2.8. */
  fNumber?: number;
  /** Display form, e.g. "f/2.8". */
  aperture?: string;
  /** Display form, e.g. "1/250s" or "2.0s". */
  shutter?: string;
  /** Display form, e.g. "ISO 400". */
  iso?: string;
  /** Raw focal length in millimetres. */
  focalMm?: number;
  /** Display form, e.g. "35mm". */
  focalLength?: string;
  /** As written by the camera: "YYYY:MM:DD HH:MM:SS". */
  dateTaken?: string;
  lat?: number;
  lon?: number;
}

const TAG_MAKE = 0x010f;
const TAG_MODEL = 0x0110;
const TAG_EXIF_IFD = 0x8769;
const TAG_GPS_IFD = 0x8825;
const TAG_FNUMBER = 0x829d;
const TAG_EXPOSURE_TIME = 0x829a;
const TAG_ISO = 0x8827;
const TAG_FOCAL_LENGTH = 0x920a;
const TAG_DATE_TAKEN = 0x9003;

const GPS_LAT_REF = 0x0001;
const GPS_LAT = 0x0002;
const GPS_LON_REF = 0x0003;
const GPS_LON = 0x0004;

const HEIF_BRANDS = ["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs", "mif1", "msf1"];

/**
 * True for HEIC/HEIF files. Every browser except Safari refuses to decode them,
 * so the UI can say why instead of showing a generic failure.
 */
export async function isHeif(file: Blob): Promise<boolean> {
  try {
    const head = await file.slice(0, 12).arrayBuffer();
    const view = new DataView(head);
    if (view.byteLength < 12) return false;
    const read4 = (o: number) =>
      String.fromCharCode(view.getUint8(o), view.getUint8(o + 1), view.getUint8(o + 2), view.getUint8(o + 3));
    return read4(4) === "ftyp" && HEIF_BRANDS.includes(read4(8));
  } catch {
    return false;
  }
}

export async function readExif(file: Blob | null | undefined): Promise<Exif | null> {
  try {
    if (!file || !file.type || !file.type.includes("jpeg")) return null;
    const head = await file.slice(0, 128 * 1024).arrayBuffer();
    const view = new DataView(head);
    if (view.getUint16(0) !== 0xffd8) return null;

    let offset = 2;
    while (offset < view.byteLength - 4) {
      if (view.getUint8(offset) !== 0xff) { offset++; continue; }
      const marker = view.getUint16(offset);
      if (marker === 0xffd8 || (marker >= 0xffd0 && marker <= 0xffd9)) { offset += 2; continue; }
      if (marker === 0xffda) break; // start of scan: no more metadata ahead
      const length = view.getUint16(offset + 2);
      if (marker === 0xffe1 && length >= 8) {
        const exifStart = offset + 4;
        if (view.getUint32(exifStart) === 0x45786966) { // "Exif"
          return parseTiff(view, exifStart + 6);
        }
      }
      offset += 2 + length;
    }
    return null;
  } catch {
    return null;
  }
}

interface IfdEntry { type: number; count: number; entryOffset: number; valueOffset: number }
type Ifd = Record<number, IfdEntry>;

function parseTiff(view: DataView, tiffStart: number): Exif | null {
  const little = view.getUint16(tiffStart) === 0x4949;
  const get16 = (o: number) => view.getUint16(o, little);
  const get32 = (o: number) => view.getUint32(o, little);

  function readString(entry: IfdEntry): string {
    const start = entry.count <= 4 ? entry.entryOffset + 8 : tiffStart + entry.valueOffset;
    let out = "";
    for (let i = 0; i < entry.count - 1; i++) {
      const code = view.getUint8(start + i);
      if (code === 0) break;
      out += String.fromCharCode(code);
    }
    return out.trim();
  }

  function readRational(o: number): number {
    const num = get32(o);
    const den = get32(o + 4);
    return den ? num / den : 0;
  }

  function readShort(entry: IfdEntry): number {
    const start = entry.count <= 2 ? entry.entryOffset + 8 : tiffStart + entry.valueOffset;
    return get16(start);
  }

  function parseIFD(ifdOffset: number): Ifd {
    const count = get16(ifdOffset);
    const tags: Ifd = {};
    for (let i = 0; i < count; i++) {
      const entryOffset = ifdOffset + 2 + i * 12;
      tags[get16(entryOffset)] = {
        type: get16(entryOffset + 2),
        count: get32(entryOffset + 4),
        entryOffset,
        valueOffset: get32(entryOffset + 8),
      };
    }
    return tags;
  }

  /** Degrees/minutes/seconds triplet to signed decimal degrees. */
  function readCoordinate(entry: IfdEntry | undefined, refEntry: IfdEntry | undefined, negativeRef: string): number | null {
    if (!entry || entry.count < 3) return null;
    const base = tiffStart + entry.valueOffset;
    const value = readRational(base) + readRational(base + 8) / 60 + readRational(base + 16) / 3600;
    if (!Number.isFinite(value)) return null;
    const ref = refEntry ? readString(refEntry).toUpperCase() : "";
    return ref.startsWith(negativeRef) ? -value : value;
  }

  const firstIFDOffset = get32(tiffStart + 4);
  const ifd0 = parseIFD(tiffStart + firstIFDOffset);
  const result: Exif = {};

  if (ifd0[TAG_MAKE]) result.make = readString(ifd0[TAG_MAKE]);
  if (ifd0[TAG_MODEL]) result.model = readString(ifd0[TAG_MODEL]);

  if (ifd0[TAG_EXIF_IFD]) {
    const exifIFD = parseIFD(tiffStart + ifd0[TAG_EXIF_IFD].valueOffset);
    if (exifIFD[TAG_FNUMBER]) {
      const f = readRational(tiffStart + exifIFD[TAG_FNUMBER].valueOffset);
      if (f) {
        result.fNumber = f;
        result.aperture = "f/" + Math.round(f * 10) / 10;
      }
    }
    if (exifIFD[TAG_EXPOSURE_TIME]) {
      const time = readRational(tiffStart + exifIFD[TAG_EXPOSURE_TIME].valueOffset);
      if (time) result.shutter = time < 1 ? "1/" + Math.round(1 / time) + "s" : time.toFixed(1) + "s";
    }
    if (exifIFD[TAG_ISO]) {
      const iso = readShort(exifIFD[TAG_ISO]);
      if (iso) result.iso = "ISO " + iso;
    }
    if (exifIFD[TAG_FOCAL_LENGTH]) {
      const fl = readRational(tiffStart + exifIFD[TAG_FOCAL_LENGTH].valueOffset);
      if (fl) {
        result.focalMm = fl;
        result.focalLength = Math.round(fl) + "mm";
      }
    }
    if (exifIFD[TAG_DATE_TAKEN]) result.dateTaken = readString(exifIFD[TAG_DATE_TAKEN]);
  }

  if (ifd0[TAG_GPS_IFD]) {
    const gpsIFD = parseIFD(tiffStart + ifd0[TAG_GPS_IFD].valueOffset);
    const lat = readCoordinate(gpsIFD[GPS_LAT], gpsIFD[GPS_LAT_REF], "S");
    const lon = readCoordinate(gpsIFD[GPS_LON], gpsIFD[GPS_LON_REF], "W");
    // An all-zero GPS block means "tag present, never populated", not Null Island.
    if (lat !== null && lon !== null && (lat !== 0 || lon !== 0)) {
      result.lat = lat;
      result.lon = lon;
    }
  }

  return Object.keys(result).length ? result : null;
}
