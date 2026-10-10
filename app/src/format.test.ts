// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from '@jest/globals';

import { formatBytes, formatClock, formatDelay, formatEndsAt, formatRemaining, spokenRemaining } from './format';

describe('formatRemaining / spokenRemaining', () => {
  it.each([
    [540, '9m', '9 minutes'],
    [541, '10m', '10 minutes'],
    [30, '1m', '1 minute'],
    [3600, '1h', '1 hour'],
    [5520, '1h 32m', '1 hour 32 minutes'],
    [7260, '2h 1m', '2 hours 1 minute'],
  ])('%ps → %s / %s', (seconds, compact, spoken) => {
    expect(formatRemaining(seconds)).toBe(compact);
    expect(spokenRemaining(seconds)).toBe(spoken);
  });

  it.each([0, -5, Number.NaN, Number.POSITIVE_INFINITY])('is undefined for %p', (seconds) => {
    expect(formatRemaining(seconds)).toBeUndefined();
    expect(spokenRemaining(seconds)).toBeUndefined();
  });
});

describe('formatEndsAt', () => {
  it('adds the seconds to now, in the local clock format', () => {
    const now = new Date(2026, 9, 4, 21, 0);
    const expected = new Date(2026, 9, 4, 21, 45).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    expect(formatEndsAt(45 * 60, now)).toBe(`Ends at ${expected}`);
  });

  it.each([0, -5, Number.NaN])('is undefined for %p', (seconds) => {
    expect(formatEndsAt(seconds)).toBeUndefined();
  });
});

describe('formatClock', () => {
  it.each([
    [0, '0:00'],
    [5.9, '0:05'],
    [245, '4:05'],
    [3723, '1:02:03'],
    [-3, '0:00'],
    [Number.NaN, '0:00'],
  ])('%d s → %s', (seconds, text) => {
    expect(formatClock(seconds)).toBe(text);
  });
});

describe('formatDelay', () => {
  it('reads in sync, earlier or later', () => {
    expect(formatDelay(0)).toBe('In sync');
    expect(formatDelay(-0.3)).toBe('0.3 s earlier');
    expect(formatDelay(2)).toBe('2 s later');
  });
});

describe('formatBytes', () => {
  it.each([
    [0, '0 MB'],
    [820_400_000, '820 MB'],
    [999_000_000, '999 MB'],
    [999_700_000, '1 GB'],
    [4_230_000_000, '4.2 GB'],
    [12_000_000_000, '12 GB'],
    [128_400_000_000, '128 GB'],
    [-5, '0 MB'],
    [Number.NaN, '0 MB'],
  ])('%d bytes → %s', (bytes, text) => {
    expect(formatBytes(bytes)).toBe(text);
  });
});
