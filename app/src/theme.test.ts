// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from '@jest/globals';

import { colors, minTouch, radii, type } from './theme';

describe('theme', () => {
  it('uses 6-digit hex colours only', () => {
    for (const value of Object.values(colors)) {
      expect(value).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  it('keeps the pure black background and white primary text', () => {
    expect(colors.background).toBe('#000000');
    expect(colors.text).toBe('#FFFFFF');
  });

  it('meets the 44pt minimum touch target', () => {
    expect(minTouch).toBeGreaterThanOrEqual(44);
  });

  it('keeps card radius within 8-14 and button radius at 12', () => {
    expect(radii.card).toBeGreaterThanOrEqual(8);
    expect(radii.card).toBeLessThanOrEqual(14);
    expect(radii.button).toBe(12);
  });

  it('uses 34/700 large titles and 20/700 section headers', () => {
    expect(type.largeTitle).toEqual({ fontSize: 34, fontWeight: '700' });
    expect(type.sectionHeader).toEqual({ fontSize: 20, fontWeight: '700' });
  });
});
