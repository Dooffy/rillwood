// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from '@jest/globals';

import { qrCode, qrVersion, rsGenerator, rsRemainder, utf8 } from './qr';

// Checked 2026-11-15: module for module against a reference encoder (segno 1.6.6, every mask, versions 1-10) and
// decoded by OpenCV's QR reader. The reference pads one more zero byte when the data ends on a byte boundary; we pad as
// ISO/IEC 18004 7.4.10 says (both read the same).
const GITHUB = [
  '#######..###.###..###.#######',
  '#.....#.....######..#.#.....#',
  '#.###.#.####.#.#..###.#.###.#',
  '#.###.#.###.#.##.#.#..#.###.#',
  '#.###.#.#.##...##.###.#.###.#',
  '#.....#.##.......#..#.#.....#',
  '#######.#.#.#.#.#.#.#.#######',
  '........##.##.#.#.###........',
  '#.#####..##......#.#..#####..',
  '...###..#..#.###.#.##.###...#',
  '#.#.#.###.##.###..#.....#....',
  '.##.......##.#.##...#....#.#.',
  '.#..#.####....##.##......##..',
  '#..#.#.#..###...###.#####...#',
  '##..#.###.###..###..##..###..',
  '#..##..#..##..#.#..######..#.',
  '..##.####........#.#.#.#.##..',
  '#...#...#..#.##.#..#.####.#.#',
  '#..#.##...##.######.#.###.#..',
  '#.#.##.##.##.#..#.#.###....#.',
  '#.#.#.#..#....#..#.######.###',
  '........###.....###.#...#####',
  '#######...#.#..##.###.#.###..',
  '#.....#.#.#.#.#.#..##...#..##',
  '#.###.#.#.###..###..#####.##.',
  '#.###.#.####.##.#####....####',
  '#.###.#.##.#...#...#########.',
  '#.....#...#..#.##.#.##.#.#.#.',
  '#######.##...#...#.#..###.#..',
];

const draw = (rows: boolean[][]) => rows.map((r) => r.map((dark) => (dark ? '#' : '.')).join(''));

describe('qrCode', () => {
  it('a link: the known code (version 3, 29 modules)', () => {
    expect(draw(qrCode('https://github.com/Dooffy/rillwood'))).toEqual(GITHUB);
  });

  it('finders in three corners, timing lines between them', () => {
    const rows = draw(qrCode('https://dooffy.github.io/rillwood/privacy'));
    const n = rows.length;
    for (const [x, y] of [
      [0, 0],
      [n - 7, 0],
      [0, n - 7],
    ]) {
      expect(rows.slice(y, y + 7).map((r) => r.slice(x, x + 7))).toEqual([
        '#######',
        '#.....#',
        '#.###.#',
        '#.###.#',
        '#.###.#',
        '#.....#',
        '#######',
      ]);
    }
    expect(rows[6].slice(8, n - 8)).toMatch(/^(#\.)*#$/);
  });

  it('Reed-Solomon: the standard HELLO WORLD 1-M example', () => {
    const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
    expect(rsRemainder(data, rsGenerator(10))).toEqual([196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
  });

  it('the smallest version that fits; past version 10 it throws', () => {
    expect(qrVersion(14)).toBe(1);
    expect(qrVersion(15)).toBe(2);
    expect(qrVersion(213)).toBe(10);
    expect(qrVersion(214)).toBeUndefined();
    expect(qrCode('x'.repeat(213))).toHaveLength(57);
    expect(() => qrCode('x'.repeat(214))).toThrow('too long');
  });

  it('text as UTF-8', () => {
    expect(utf8('Aé✓😀')).toEqual([0x41, 0xc3, 0xa9, 0xe2, 0x9c, 0x93, 0xf0, 0x9f, 0x98, 0x80]);
  });
});
