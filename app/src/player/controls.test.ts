// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from '@jest/globals';

import {
  clampDelay,
  delayAt,
  delayFraction,
  positionAt,
  seekTarget,
  shouldClose,
  subtitleScaleFor,
  upNextCountdown,
  videoFrame,
  zoomAfterPinch,
} from './controls';
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

describe('subtitleScaleFor', () => {
  it('a step larger in portrait, as chosen in landscape', () => {
    expect(subtitleScaleFor(1, true)).toBe(1.25);
    expect(subtitleScaleFor(1.5, true)).toBe(1.875);
    expect(subtitleScaleFor(1.5, false)).toBe(1.5);
  });
});

describe('upNextCountdown', () => {
  it('in the last 30 s: whole seconds left and the ring fill; nothing before or without a duration', () => {
    expect(upNextCountdown(1369, 1400)).toBeUndefined();
    expect(upNextCountdown(1370, 1400)).toEqual({ left: 30, fill: 0 });
    expect(upNextCountdown(1388.2, 1400)).toEqual({ left: 12, fill: expect.closeTo(0.607) });
    expect(upNextCountdown(1385, 1400)?.fill).toBeCloseTo(0.5);
    expect(upNextCountdown(1400, 1400)).toEqual({ left: 0, fill: 1 });
    expect(upNextCountdown(1405, 1400)).toEqual({ left: 0, fill: 1 });
    expect(upNextCountdown(0, 0)).toBeUndefined();
  });
});

describe('zoomAfterPinch', () => {
  it('apart = fill, together = fit, a small pinch keeps the zoom', () => {
    expect(zoomAfterPinch(1.4, 'fit')).toBe('fill');
    expect(zoomAfterPinch(0.6, 'fill')).toBe('fit');
    expect(zoomAfterPinch(1.05, 'fit')).toBe('fit');
    expect(zoomAfterPinch(0.95, 'fill')).toBe('fill');
  });
});

describe('videoFrame', () => {
  // iPhone with a Dynamic Island, turned left: island on the left, home indicator at the bottom.
  const landscape = { top: 0, bottom: 21, left: 59, right: 0 };
  const portrait = { top: 59, bottom: 34, left: 0, right: 0 };

  it('fit: clear of the notch on both long sides, centred', () => {
    expect(videoFrame(landscape, true, 'fit')).toEqual({ top: 0, bottom: 0, left: 59, right: 59 });
    expect(videoFrame(portrait, false, 'fit')).toEqual({ top: 59, bottom: 59, left: 0, right: 0 });
  });

  it('fill: edge to edge', () => {
    expect(videoFrame(landscape, true, 'fill')).toEqual({ top: 0, bottom: 0, left: 0, right: 0 });
  });
});

describe('clampDelay', () => {
  it('snaps to 0.1 s without float drift, inside ±10 s', () => {
    expect(clampDelay(0.1 + 0.2)).toBe(0.3);
    expect(clampDelay(1.26)).toBe(1.3);
    expect(clampDelay(-0.04)).toBe(0);
    expect(Object.is(clampDelay(-0.04), -0)).toBe(false);
    expect(clampDelay(12)).toBe(10);
    expect(clampDelay(-10.1)).toBe(-10);
  });
});

describe('delayAt', () => {
  it('middle = in sync, left edge = 10 s earlier, right edge = 10 s later', () => {
    expect(delayAt(150, 300)).toBe(0);
    expect(delayAt(0, 300)).toBe(-10);
    expect(delayAt(300, 300)).toBe(10);
    expect(delayAt(225, 300)).toBe(5);
    expect(delayAt(-20, 300)).toBe(-10);
    expect(delayAt(40, 0)).toBe(0);
  });
});

describe('delayFraction', () => {
  it('in sync in the middle, the range ends at the edges, clamped past them', () => {
    expect(delayFraction(0)).toBe(0.5);
    expect(delayFraction(-10)).toBe(0);
    expect(delayFraction(5)).toBe(0.75);
    expect(delayFraction(20)).toBe(1);
  });
});
