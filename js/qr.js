// Minimal QR Code encoder: byte mode, error-correction level M, versions 1-10.
// That covers ~213 bytes, far more than a room invite URL needs, and keeps the
// tables small enough to ship without a dependency or a build step.
// Reference: ISO/IEC 18004.

const MODE_BYTE = 0b0100;
const ECC_M_INDICATOR = 0b00;
const MAX_VERSION = 10;

// Index = version - 1. Block sizes are derived: data codewords split as evenly
// as possible, with the remainder going to the trailing (group 2) blocks.
const VERSIONS = [
  { total: 26, ecPerBlock: 10, blocks: 1 },
  { total: 44, ecPerBlock: 16, blocks: 1 },
  { total: 70, ecPerBlock: 26, blocks: 1 },
  { total: 100, ecPerBlock: 18, blocks: 2 },
  { total: 134, ecPerBlock: 24, blocks: 2 },
  { total: 172, ecPerBlock: 16, blocks: 4 },
  { total: 196, ecPerBlock: 18, blocks: 4 },
  { total: 242, ecPerBlock: 22, blocks: 4 },
  { total: 292, ecPerBlock: 22, blocks: 5 },
  { total: 346, ecPerBlock: 26, blocks: 5 }
];

const ALIGNMENT = [
  [], [6, 18], [6, 22], [6, 26], [6, 30],
  [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]
];

const MASKS = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0
];

/* ---------- GF(256) arithmetic, primitive polynomial 0x11D ---------- */

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(function initGaloisField() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11D;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

function gfMul(a, b) {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}

/** Coefficients of the monic generator polynomial, leading 1 omitted. */
function rsDivisor(degree) {
  const result = new Uint8Array(degree);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = gfMul(result[j], root);
      if (j + 1 < degree) result[j] ^= result[j + 1];
    }
    root = gfMul(root, 0x02);
  }
  return result;
}

function rsRemainder(data, divisor) {
  const result = new Uint8Array(divisor.length);
  for (const byte of data) {
    const factor = byte ^ result[0];
    result.copyWithin(0, 1);
    result[result.length - 1] = 0;
    for (let i = 0; i < result.length; i++) result[i] ^= gfMul(divisor[i], factor);
  }
  return result;
}

/* ---------- Encoding ---------- */

function dataCodewordCount(version) {
  const v = VERSIONS[version - 1];
  return v.total - v.ecPerBlock * v.blocks;
}

function countIndicatorBits(version) {
  return version < 10 ? 8 : 16;
}

function chooseVersion(byteLength) {
  for (let version = 1; version <= MAX_VERSION; version++) {
    const capacity = dataCodewordCount(version) * 8;
    if (4 + countIndicatorBits(version) + byteLength * 8 <= capacity) return version;
  }
  throw new Error('Text is too long for a version-10 QR code');
}

function buildCodewords(bytes, version) {
  const bits = [];
  const put = (value, length) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };

  put(MODE_BYTE, 4);
  put(bytes.length, countIndicatorBits(version));
  for (const b of bytes) put(b, 8);

  const capacity = dataCodewordCount(version) * 8;
  put(0, Math.min(4, capacity - bits.length));      // terminator
  put(0, (8 - (bits.length % 8)) % 8);              // pad to a byte boundary

  const codewords = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
    codewords.push(byte);
  }
  for (let pad = 0xEC; codewords.length < dataCodewordCount(version); pad ^= 0xEC ^ 0x11) {
    codewords.push(pad);
  }
  return codewords;
}

function interleave(codewords, version) {
  const { total, ecPerBlock, blocks } = VERSIONS[version - 1];
  const dataLen = total - ecPerBlock * blocks;
  const shortLen = Math.floor(dataLen / blocks);
  const longBlocks = dataLen % blocks;
  const divisor = rsDivisor(ecPerBlock);

  const dataBlocks = [];
  const ecBlocks = [];
  let cursor = 0;
  for (let i = 0; i < blocks; i++) {
    const len = shortLen + (i >= blocks - longBlocks ? 1 : 0);
    const block = codewords.slice(cursor, cursor + len);
    cursor += len;
    dataBlocks.push(block);
    ecBlocks.push(rsRemainder(block, divisor));
  }

  const out = [];
  for (let i = 0; i <= shortLen; i++) {
    dataBlocks.forEach((block) => { if (i < block.length) out.push(block[i]); });
  }
  for (let i = 0; i < ecPerBlock; i++) {
    ecBlocks.forEach((block) => out.push(block[i]));
  }
  return out;
}

/* ---------- Matrix layout ---------- */

function formatBits(mask) {
  const data = (ECC_M_INDICATOR << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

function versionInfoBits(version) {
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
  return (version << 12) | rem;
}

function buildFunctionPatterns(version) {
  const size = version * 4 + 17;
  const modules = Array.from({ length: size }, () => new Array(size).fill(false));
  const reserved = Array.from({ length: size }, () => new Array(size).fill(false));

  const set = (r, c, dark) => {
    if (r < 0 || c < 0 || r >= size || c >= size) return;
    modules[r][c] = dark;
    reserved[r][c] = true;
  };

  // Finder patterns plus their separators (Chebyshev rings: dark at 0,1,3).
  [[0, 0], [0, size - 7], [size - 7, 0]].forEach(([r0, c0]) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const ring = Math.max(Math.abs(dr - 3), Math.abs(dc - 3));
        set(r0 + dr, c0 + dc, ring !== 2 && ring <= 3);
      }
    }
  });

  // Timing patterns.
  for (let i = 8; i < size - 8; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }

  // Alignment patterns, skipping the three that collide with finder patterns.
  const positions = ALIGNMENT[version - 1];
  positions.forEach((r0) => positions.forEach((c0) => {
    const collides = (r0 === 6 && c0 === 6)
      || (r0 === 6 && c0 === size - 7)
      || (r0 === size - 7 && c0 === 6);
    if (collides) return;
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        set(r0 + dr, c0 + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
      }
    }
  }));

  // Format information is written after masking; reserve its cells now.
  for (let i = 0; i < 9; i++) {
    reserved[8][i] = true;
    reserved[i][8] = true;
  }
  for (let i = 0; i < 8; i++) {
    reserved[8][size - 1 - i] = true;
    reserved[size - 1 - i][8] = true;
  }

  if (version >= 7) {
    const bits = versionInfoBits(version);
    for (let i = 0; i < 18; i++) {
      const dark = ((bits >>> i) & 1) === 1;
      const far = size - 11 + (i % 3);
      const near = Math.floor(i / 3);
      set(far, near, dark);
      set(near, far, dark);
    }
  }

  return { size, modules, reserved };
}

function placeData(modules, reserved, size, data) {
  let bit = 0;
  const totalBits = data.length * 8;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // column 6 is the vertical timing pattern
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const col = right - j;
        const upward = ((right + 1) & 2) === 0;
        const row = upward ? size - 1 - vert : vert;
        if (reserved[row][col] || bit >= totalBits) continue;
        modules[row][col] = ((data[bit >>> 3] >>> (7 - (bit & 7))) & 1) === 1;
        bit++;
      }
    }
  }
}

function drawFormat(modules, size, mask) {
  const bits = formatBits(mask);
  const bit = (i) => ((bits >>> i) & 1) === 1;

  // First copy: down column 8 beside the top-left finder, then left along row 8.
  for (let i = 0; i <= 5; i++) modules[i][8] = bit(i);
  modules[7][8] = bit(6);
  modules[8][8] = bit(7);
  modules[8][7] = bit(8);
  for (let i = 9; i < 15; i++) modules[8][14 - i] = bit(i);

  // Second copy: along row 8 from the right edge, then down column 8 at the bottom.
  for (let i = 0; i < 8; i++) modules[8][size - 1 - i] = bit(i);
  for (let i = 8; i < 15; i++) modules[size - 15 + i][8] = bit(i);

  modules[size - 8][8] = true; // always-dark module
}

// The 1:1:3:1:1 dark/light run that mimics a finder pattern. It only scores if
// a 4-module light area sits on one side of it; running off the edge of the
// symbol counts as light, since the quiet zone is there.
const FINDER_LIKE = [true, false, true, true, true, false, true];

function finderLikePenalty(get, size) {
  const anyDark = (from, to) => {
    for (let i = from; i < to; i++) if (get(i)) return true;
    return false;
  };

  let score = 0;
  let i = 0;
  while (i + 7 <= size) {
    let matched = true;
    for (let k = 0; k < 7; k++) {
      if (get(i + k) !== FINDER_LIKE[k]) { matched = false; break; }
    }
    if (!matched) { i++; continue; }

    const after = i + 7;
    const clearBefore = !anyDark(Math.max(i - 4, 0), i);
    const clearAfter = !anyDark(after, Math.min(after + 4, size));
    if (clearBefore || clearAfter) {
      score += 40;
      i = after;
    } else {
      // Overlapping matches can only restart at the pattern's middle dark run.
      i += 4;
    }
  }
  return score;
}

function penalty(modules, size) {
  let score = 0;

  const runScore = (get) => {
    let run = 1;
    let total = 0;
    for (let i = 1; i < size; i++) {
      if (get(i) === get(i - 1)) {
        run++;
      } else {
        if (run >= 5) total += run - 2;
        run = 1;
      }
    }
    return total + (run >= 5 ? run - 2 : 0);
  };
  for (let i = 0; i < size; i++) {
    score += runScore((j) => modules[i][j]);
    score += runScore((j) => modules[j][i]);
  }

  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const v = modules[r][c];
      if (v === modules[r][c + 1] && v === modules[r + 1][c] && v === modules[r + 1][c + 1]) score += 3;
    }
  }

  for (let i = 0; i < size; i++) {
    score += finderLikePenalty((k) => modules[i][k], size);
    score += finderLikePenalty((k) => modules[k][i], size);
  }

  let dark = 0;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (modules[r][c]) dark++;
  const total = size * size;
  score += Math.floor(Math.abs(dark * 20 - total * 10) / total) * 10;

  return score;
}

/** Returns the QR modules as a size×size array of booleans (true = dark). */
export function qrMatrix(text, forcedVersion = null, forcedMask = null) {
  const bytes = new TextEncoder().encode(String(text));
  const version = forcedVersion || chooseVersion(bytes.length);
  if (4 + countIndicatorBits(version) + bytes.length * 8 > dataCodewordCount(version) * 8) {
    throw new Error(`Text is too long for a version-${version} QR code`);
  }
  const data = interleave(buildCodewords(bytes, version), version);
  const { size, modules, reserved } = buildFunctionPatterns(version);

  placeData(modules, reserved, size, data);

  let best = null;
  const candidates = forcedMask === null ? [0, 1, 2, 3, 4, 5, 6, 7] : [forcedMask];
  for (const mask of candidates) {
    const masked = modules.map((row, r) => row.map((v, c) => (reserved[r][c] ? v : v !== MASKS[mask](r, c))));
    drawFormat(masked, size, mask);
    const score = candidates.length === 1 ? 0 : penalty(masked, size);
    if (!best || score < best.score) best = { score, masked, mask };
  }
  return best.masked;
}

/**
 * Renders `text` as a standalone SVG string. Colours are fixed to black on
 * white rather than themed, because scanners need the contrast.
 */
export function qrSvg(text, { moduleSize = 4, quiet = 4 } = {}) {
  const matrix = qrMatrix(text);
  const size = matrix.length;
  const dim = (size + quiet * 2) * moduleSize;

  let path = '';
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!matrix[r][c]) continue;
      const x = (c + quiet) * moduleSize;
      const y = (r + quiet) * moduleSize;
      path += `M${x} ${y}h${moduleSize}v${moduleSize}h-${moduleSize}z`;
    }
  }

  return `<svg viewBox="0 0 ${dim} ${dim}" width="${dim}" height="${dim}" role="img" `
    + `aria-label="QR code for the room invite link" xmlns="http://www.w3.org/2000/svg">`
    + `<rect width="${dim}" height="${dim}" fill="#ffffff"/>`
    + `<path d="${path}" fill="#000000"/></svg>`;
}
