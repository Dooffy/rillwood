// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from '@jest/globals';
import { renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { ColorsContext, minTouch, palettes, radii, resolveScheme, type, useColors, type Scheme } from './theme';

describe('theme', () => {
  it.each(Object.entries(palettes))('%s uses 6-digit hex colours only', (_name, palette) => {
    for (const value of Object.values(palette)) {
      expect(value).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  it('keeps pure black / white backgrounds with opposite text', () => {
    expect(palettes.dark).toMatchObject({ background: '#000000', text: '#FFFFFF' });
    expect(palettes.light).toMatchObject({ background: '#FFFFFF', text: '#000000' });
  });

  it.each(Object.entries(palettes))('%s accent contrasts with its button text', (_name, palette) => {
    expect(palette.accent).not.toBe(palette.onAccent);
  });

  it('meets the 44pt minimum touch target', () => {
    expect(minTouch).toBeGreaterThanOrEqual(44);
  });

  it('keeps card radius within 8-14', () => {
    expect(radii.card).toBeGreaterThanOrEqual(8);
    expect(radii.card).toBeLessThanOrEqual(14);
  });

  it('uses 34/700 large titles and 20/700 section headers', () => {
    expect(type.largeTitle).toEqual({ fontSize: 34, fontWeight: '700' });
    expect(type.sectionHeader).toEqual({ fontSize: 20, fontWeight: '700' });
  });

  const cases: [Parameters<typeof resolveScheme>[0], Parameters<typeof resolveScheme>[1], Scheme][] = [
    ['system', 'light', 'light'],
    ['system', 'dark', 'dark'],
    ['system', null, 'dark'],
    ['dark', 'light', 'dark'],
    ['light', 'dark', 'light'],
  ];

  it.each(cases)('resolveScheme(%s, system %s) is %s', (appearance, system, expected) => {
    expect(resolveScheme(appearance, system)).toBe(expected);
  });

  it('useColors defaults to dark and follows the provider', async () => {
    expect((await renderHook(() => useColors())).result.current).toBe(palettes.dark);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ColorsContext.Provider value={palettes.light}>{children}</ColorsContext.Provider>
    );
    expect((await renderHook(() => useColors(), { wrapper })).result.current).toBe(palettes.light);
  });
});
