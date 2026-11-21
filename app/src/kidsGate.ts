// SPDX-License-Identifier: GPL-3.0-or-later
// Kids mode grown-up gate (pure, docs/context/kids.md "Grown-up gate"): an addition with numbers up to 20, shown as a
// formula ("15 + 2 = ?") - nothing to remember (no PIN), quick for a grown-up, out of reach for little ones. The first
// number 10-20, the second 2-20, so every answer (12-40) has two digits (the keypad's two boxes).
export type Sum = { a: number; b: number };

const FIRST = [10, 20] as const;
const SECOND = [2, 20] as const;

/** Digits a grown-up types: every answer (12-40) has two. */
export const ANSWER_DIGITS = 2;

const pick = (random: () => number, [low, high]: readonly [number, number]) =>
  low + Math.floor(random() * (high - low + 1));

/** A new sum, never the one just shown (a wrong answer gets a fresh question). */
export function newSum(random: () => number = Math.random, previous?: Sum): Sum {
  for (;;) {
    const sum = { a: pick(random, FIRST), b: pick(random, SECOND) };
    if (!previous || sum.a !== previous.a || sum.b !== previous.b) return sum;
  }
}

/** "15 + 2 = ?" */
export function sumQuestion({ a, b }: Sum): string {
  return `${a} + ${b} = ?`;
}

/** Spoken: "What is 15 plus 2?" (VoiceOver reads "+" and "?" poorly). */
export function sumLabel({ a, b }: Sum): string {
  return `What is ${a} plus ${b}?`;
}

/** Whether the typed digits are the answer. */
export function isAnswer({ a, b }: Sum, digits: string): boolean {
  return digits.length === ANSWER_DIGITS && Number(digits) === a + b;
}
