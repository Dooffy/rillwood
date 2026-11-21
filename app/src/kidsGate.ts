// SPDX-License-Identifier: GPL-3.0-or-later
// Kids mode grown-up gate (pure, docs/context/kids.md "Grown-up gate"): a multiplication in words - nothing to
// remember (no PIN), easy for a grown-up, out of reach for a young kid. Both numbers 6-9, so every answer has two digits.
export type Sum = { a: number; b: number };

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const LOW = 6;
const HIGH = 9;

/** Digits a grown-up types: every answer (36-81) has two. */
export const ANSWER_DIGITS = 2;

const pick = (random: () => number) => LOW + Math.floor(random() * (HIGH - LOW + 1));

/** A new sum, never the one just shown (a wrong answer gets a fresh question). */
export function newSum(random: () => number = Math.random, previous?: Sum): Sum {
  for (;;) {
    const sum = { a: pick(random), b: pick(random) };
    if (!previous || sum.a !== previous.a || sum.b !== previous.b) return sum;
  }
}

/** "What is seven times eight?" */
export function sumQuestion({ a, b }: Sum): string {
  return `What is ${WORDS[a]} times ${WORDS[b]}?`;
}

/** Whether the typed digits are the answer. */
export function isAnswer({ a, b }: Sum, digits: string): boolean {
  return digits.length === ANSWER_DIGITS && Number(digits) === a * b;
}
