// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from '@jest/globals';

import { positionAt, seekTarget, shouldClose } from './controls';
import { createProgress } from './progress';

describe('shouldClose', () => {
  it.each([
    [60, 0, false],
    [121, 0, true],
    [40, 900, true], // flick
    [20, 2000, false], // too short even when fast
  ])('dy %d, vy %d → %s', (dy, vy, close) => {
    expect(shouldClose(dy, vy)).toBe(close);
  });
});

describe('seekTarget', () => {
  it('clamps into the file; unknown duration only at 0', () => {
    expect(seekTarget(-5, 100)).toBe(0);
    expect(seekTarget(150, 100)).toBe(100);
    expect(seekTarget(42, 100)).toBe(42);
    expect(seekTarget(500, 0)).toBe(500);
  });
});

describe('positionAt', () => {
  it('maps x on the track to seconds, clamped; 0 before layout', () => {
    expect(positionAt(150, 300, 9000)).toBe(4500);
    expect(positionAt(-20, 300, 9000)).toBe(0);
    expect(positionAt(400, 300, 9000)).toBe(9000);
    expect(positionAt(150, 0, 9000)).toBe(0);
  });
});

describe('createProgress', () => {
  it('merges updates and notifies subscribers', () => {
    const store = createProgress(40);
    const seen: number[] = [];
    const off = store.subscribe(() => seen.push(store.get().position));
    store.set({ duration: 900 });
    store.set({ position: 41 });
    off();
    store.set({ position: 42 });
    expect(store.get()).toEqual({ position: 42, duration: 900 });
    expect(seen).toEqual([40, 41]);
  });

  it('an unchanged progress tick notifies nobody', () => {
    const store = createProgress(5);
    let calls = 0;
    store.subscribe(() => calls++);
    store.set({ position: 5 });
    expect(calls).toBe(0);
  });
});
