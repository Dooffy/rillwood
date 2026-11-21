// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from '@jest/globals';

import { ANSWER_DIGITS, isAnswer, newSum, sumQuestion } from './kidsGate';

/** A `random` that returns these values in turn. */
const seq = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe('newSum', () => {
  it('picks both numbers from 6 to 9', () => {
    expect(newSum(seq(0, 0.999))).toEqual({ a: 6, b: 9 });
    for (let i = 0; i < 200; i++) {
      const { a, b } = newSum();
      expect([a, b].every((n) => n >= 6 && n <= 9)).toBe(true);
      expect(String(a * b)).toHaveLength(ANSWER_DIGITS);
    }
  });

  it('never repeats the question just shown', () => {
    // 7 x 8 again first, then 9 x 6.
    expect(newSum(seq(0.25, 0.5, 0.75, 0), { a: 7, b: 8 })).toEqual({ a: 9, b: 6 });
  });
});

describe('sumQuestion / isAnswer', () => {
  it('asks in words', () => {
    expect(sumQuestion({ a: 7, b: 8 })).toBe('What is seven times eight?');
  });

  it('takes the product, two digits only', () => {
    expect(isAnswer({ a: 7, b: 8 }, '56')).toBe(true);
    expect(isAnswer({ a: 7, b: 8 }, '54')).toBe(false);
    expect(isAnswer({ a: 7, b: 8 }, '5')).toBe(false);
    expect(isAnswer({ a: 7, b: 8 }, '056')).toBe(false);
  });
});
