// SPDX-License-Identifier: GPL-3.0-or-later
// QR codes for links shown on Apple TV (Settings → About: no browser there, a phone scans the code). Our own encoder
// (no dependency, decided 2026-11-15): byte mode, error correction level M, versions 1-10 (up to 213 bytes - plenty
// for a URL), the mask with the lowest penalty (ISO/IEC 18004). Pure: text in, module grid out.

/** Error-correction codewords per block, and the blocks as [count, data codewords each] - level M, versions 1-10. */
const VERSIONS: { ec: number; blocks: [number, number][] }[] = [
  { ec: 10, blocks: [[1, 16]] },
  { ec: 16, blocks: [[1, 28]] },
  { ec: 26, blocks: [[1, 44]] },
  { ec: 18, blocks: [[2, 32]] },
  { ec: 24, blocks: [[2, 43]] },
  { ec: 16, blocks: [[4, 27]] },
  { ec: 18, blocks: [[4, 31]] },
  {
    ec: 22,
    blocks: [
      [2, 38],
      [2, 39],
    ],
  },
  {
    ec: 22,
    blocks: [
      [3, 36],
      [2, 37],
    ],
  },
  {
    ec: 26,
    blocks: [
      [4, 43],
      [1, 44],
    ],
  },
];

/** Centres of the alignment patterns, per version (both axes). */
const ALIGNMENT: number[][] = [
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
];

/** Level M in the format bits. */
const LEVEL_M = 0b00;

/** `text` as UTF-8 bytes. */
export function utf8(text: string): number[] {
  const out: number[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
  }
  return out;
}

// GF(256) with the QR polynomial x^8 + x^4 + x^3 + x^2 + 1.
function gfMultiply(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

/** Reed-Solomon generator polynomial of `degree` (coefficients, highest first, the leading 1 left out). */
export function rsGenerator(degree: number): number[] {
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = gfMultiply(result[j], root);
      if (j + 1 < degree) result[j] ^= result[j + 1];
    }
    root = gfMultiply(root, 0x02);
  }
  return result;
}

/** The error-correction codewords for `data`. */
export function rsRemainder(data: number[], generator: number[]): number[] {
  const result = new Array<number>(generator.length).fill(0);
  for (const b of data) {
    const factor = b ^ result.shift()!;
    result.push(0);
    generator.forEach((g, i) => (result[i] ^= gfMultiply(g, factor)));
  }
  return result;
}

const dataCapacity = (version: number) => VERSIONS[version - 1].blocks.reduce((sum, [n, k]) => sum + n * k, 0);
const countBits = (version: number) => (version < 10 ? 8 : 16);

/** The smallest version that holds `length` bytes; undefined past version 10. */
export function qrVersion(length: number): number | undefined {
  for (let v = 1; v <= VERSIONS.length; v++) {
    if (4 + countBits(v) + 8 * length <= dataCapacity(v) * 8) return v;
  }
  return undefined;
}

/** Data codewords: mode, count, bytes, terminator, padding. */
function dataCodewords(bytes: number[], version: number): number[] {
  const bits: number[] = [];
  const put = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  const capacity = dataCapacity(version) * 8;
  put(0b0100, 4);
  put(bytes.length, countBits(version));
  bytes.forEach((b) => put(b, 8));
  put(0, Math.min(4, capacity - bits.length));
  put(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) put(pad, 8);
  const out: number[] = [];
  for (let i = 0; i < bits.length; i += 8) out.push(bits.slice(i, i + 8).reduce((acc, bit) => (acc << 1) | bit, 0));
  return out;
}

/** Splits into blocks, adds each block's error correction, interleaves. */
function withErrorCorrection(data: number[], version: number): number[] {
  const { ec, blocks } = VERSIONS[version - 1];
  const generator = rsGenerator(ec);
  const split: { data: number[]; ec: number[] }[] = [];
  let at = 0;
  for (const [count, length] of blocks) {
    for (let i = 0; i < count; i++) {
      const part = data.slice(at, at + length);
      at += length;
      split.push({ data: part, ec: rsRemainder(part, generator) });
    }
  }
  const out: number[] = [];
  const longest = Math.max(...split.map((b) => b.data.length));
  for (let i = 0; i < longest; i++) split.forEach((b) => i < b.data.length && out.push(b.data[i]));
  for (let i = 0; i < ec; i++) split.forEach((b) => out.push(b.ec[i]));
  return out;
}

const MASKS: ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

class Grid {
  readonly version: number;
  readonly size: number;
  readonly dark: boolean[][];
  /** Finder, timing, alignment, format and version modules: no data, never masked. */
  readonly fixed: boolean[][];

  constructor(version: number) {
    this.version = version;
    this.size = version * 4 + 17;
    this.dark = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false));
    this.fixed = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false));
  }

  setFixed(x: number, y: number, dark: boolean) {
    this.dark[y][x] = dark;
    this.fixed[y][x] = true;
  }

  drawPatterns() {
    const { size } = this;
    for (let i = 0; i < size; i++) {
      this.setFixed(6, i, i % 2 === 0);
      this.setFixed(i, 6, i % 2 === 0);
    }
    this.drawFinder(3, 3);
    this.drawFinder(size - 4, 3);
    this.drawFinder(3, size - 4);
    const centres = ALIGNMENT[this.version - 1];
    const last = centres.length - 1;
    centres.forEach((cx, i) =>
      centres.forEach((cy, j) => {
        // The three corners hold the finders.
        if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) this.setFixed(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }),
    );
    // Reserved now, the real bits once the mask is picked.
    this.drawFormat(0);
    this.drawVersion();
  }

  /** A finder with its light separator, cut at the grid's edge. */
  private drawFinder(cx: number, cy: number) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        const ring = Math.max(Math.abs(dx), Math.abs(dy));
        if (x >= 0 && x < this.size && y >= 0 && y < this.size) this.setFixed(x, y, ring !== 2 && ring !== 4);
      }
    }
  }

  drawFormat(mask: number) {
    const data = (LEVEL_M << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;
    const bit = (i: number) => ((bits >>> i) & 1) !== 0;
    const { size } = this;
    // Around the top-left finder.
    for (let i = 0; i <= 5; i++) this.setFixed(8, i, bit(i));
    this.setFixed(8, 7, bit(6));
    this.setFixed(8, 8, bit(7));
    this.setFixed(7, 8, bit(8));
    for (let i = 9; i < 15; i++) this.setFixed(14 - i, 8, bit(i));
    // The copy by the other two finders, and the one always-dark module.
    for (let i = 0; i < 8; i++) this.setFixed(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) this.setFixed(8, size - 15 + i, bit(i));
    this.setFixed(8, size - 8, true);
  }

  /** Versions 7 and up: their number, twice, by the top-right and bottom-left finders. */
  private drawVersion() {
    if (this.version < 7) return;
    let rem = this.version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (this.version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const dark = ((bits >>> i) & 1) !== 0;
      const a = this.size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      this.setFixed(a, b, dark);
      this.setFixed(b, a, dark);
    }
  }

  /** Data in the zigzag: two columns at a time from the right, up then down, skipping the vertical timing line. */
  drawCodewords(codewords: number[]) {
    const { size } = this;
    let i = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      const upward = ((right + 1) & 2) === 0;
      for (let vert = 0; vert < size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const y = upward ? size - 1 - vert : vert;
          if (this.fixed[y][x] || i >= codewords.length * 8) continue;
          this.dark[y][x] = ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0;
          i++;
        }
      }
    }
  }

  /** XORs the mask over the data modules (twice undoes it). */
  applyMask(mask: number) {
    const test = MASKS[mask];
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) if (!this.fixed[y][x] && test(x, y)) this.dark[y][x] = !this.dark[y][x];
    }
  }

  /** ISO/IEC 18004 penalty: runs, 2×2 blocks, finder-like patterns, dark balance. Lower reads better. */
  penalty(): number {
    const { size, dark } = this;
    let score = 0;
    const lines = (get: (a: number, b: number) => boolean) => {
      for (let a = 0; a < size; a++) {
        let run = 1;
        for (let b = 1; b <= size; b++) {
          if (b < size && get(a, b) === get(a, b - 1)) run++;
          else {
            if (run >= 5) score += 3 + run - 5;
            run = 1;
          }
        }
        // 1:1:3:1:1 with four light modules on one side.
        for (let b = 0; b + 10 < size; b++) {
          const p = Array.from({ length: 11 }, (_, k) => get(a, b + k));
          const core = p[0] && !p[1] && p[2] && p[3] && p[4] && !p[5] && p[6];
          const before = core && !p[7] && !p[8] && !p[9] && !p[10];
          const q = p.slice(4);
          const after = !p[0] && !p[1] && !p[2] && !p[3] && q[0] && !q[1] && q[2] && q[3] && q[4] && !q[5] && q[6];
          if (before) score += 40;
          if (after) score += 40;
        }
      }
    };
    lines((y, x) => dark[y][x]);
    lines((x, y) => dark[y][x]);
    let darkCount = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (dark[y][x]) darkCount++;
        if (x + 1 < size && y + 1 < size) {
          const c = dark[y][x];
          if (c === dark[y][x + 1] && c === dark[y + 1][x] && c === dark[y + 1][x + 1]) score += 3;
        }
      }
    }
    const total = size * size;
    score += Math.floor(Math.abs(darkCount * 20 - total * 10) / total) * 10;
    return score;
  }
}

/**
 * The QR code for `text`: rows of modules, true = dark, no quiet zone (the view adds it). `mask` forces one (tests);
 * by default the one with the lowest penalty. Throws past version 10 (over 213 bytes).
 */
export function qrCode(text: string, mask?: number): boolean[][] {
  const bytes = utf8(text);
  const version = qrVersion(bytes.length);
  if (version === undefined) throw new Error(`QR code: ${bytes.length} bytes is too long`);
  const grid = new Grid(version);
  grid.drawPatterns();
  grid.drawCodewords(withErrorCorrection(dataCodewords(bytes, version), version));
  let best = mask;
  if (best === undefined) {
    let lowest = Infinity;
    for (let m = 0; m < MASKS.length; m++) {
      grid.applyMask(m);
      grid.drawFormat(m);
      const score = grid.penalty();
      if (score < lowest) [lowest, best] = [score, m];
      grid.applyMask(m);
    }
  }
  grid.applyMask(best!);
  grid.drawFormat(best!);
  return grid.dark;
}
