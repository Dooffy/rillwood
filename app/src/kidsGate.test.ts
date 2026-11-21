// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from '@jest/globals';

import { ANSWER_DIGITS, isAnswer, newSum, sumLabel, sumQuestion } from './kidsGate';

/** A `random` that returns these values in turn. */
const seq = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe('newSum', () => {
  it('numbers up to 20 (the first 10-20, the second 2-20), so the answer always has two digits', () => {
    expect(newSum(seq(0, 0))).toEqual({ a: 10, b: 2 });
    expect(newSum(seq(0.999, 0.999))).toEqual({ a: 20, b: 20 });
    for (let i = 0; i < 300; i++) {
      const { a, b } = newSum();
      expect(a >= 10 && a <= 20 && b >= 2 && b <= 20).toBe(true);
      expect(String(a + b)).toHaveLength(ANSWER_DIGITS);
    }
  });

  it('never repeats the question just shown', () => {
    // 10 + 2 again first, then 15 + 2.
    expect(newSum(seq(0, 0, 0.5, 0), { a: 10, b: 2 })).toEqual({ a: 15, b: 2 });
  });
});

describe('sumQuestion / sumLabel / isAnswer', () => {
  it('shows a formula, speaks it in words', () => {
    expect(sumQuestion({ a: 15, b: 2 })).toBe('15 + 2 = ?');
    expect(sumLabel({ a: 20, b: 11 })).toBe('What is 20 plus 11?');
  });

  it('takes the sum, two digits only', () => {
    expect(isAnswer({ a: 15, b: 2 }, '17')).toBe(true);
    expect(isAnswer({ a: 15, b: 2 }, '18')).toBe(false);
    expect(isAnswer({ a: 15, b: 2 }, '1')).toBe(false);
    expect(isAnswer({ a: 15, b: 2 }, '017')).toBe(false);
  });
});
