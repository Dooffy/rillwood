// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from '@jest/globals';

import { formatRemaining, spokenRemaining } from './format';

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
