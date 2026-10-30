// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { PHONE, resetDevice, setDevice, TABLET_LANDSCAPE, TABLET_PORTRAIT } from '@/testDevice';

import { DetailHero } from './DetailHero';

afterEach(resetDevice);

describe('DetailHero', () => {
  // Phones: 4:5 of the width. Tablets: a 16:9 strip, at most 60% of the window's height (4:5 would pass the screen).
  it('is a landscape strip on tablets, the title left-aligned', async () => {
    const size = () => {
      // The art's height is the hero's least: text that needs more room grows it.
      const { width, minHeight } = StyleSheet.flatten(screen.getByTestId('detail-hero').props.style);
      return [width, minHeight];
    };
    const centred = () => StyleSheet.flatten(screen.getByRole('header').props.style)?.textAlign === 'center';
    await setDevice(...PHONE);
    await render(<DetailHero title="Sintel" subtitle="" />);
    expect([size(), centred()]).toEqual([[390, 487.5], true]);
    for (const [[w, h], expected] of [
      [TABLET_PORTRAIT, [834, 469]],
      [TABLET_LANDSCAPE, [1194, 500]],
    ] as const) {
      await setDevice(w, h);
      expect([size(), centred()]).toEqual([expected, false]);
    }
  });

  it('shows the text title, subtitle and art', async () => {
    await render(<DetailHero art="https://jf/a.jpg" title="Sintel" subtitle="Movie · Animation" />);
    expect(screen.getByRole('header', { name: 'Sintel' })).toBeOnTheScreen();
    expect(screen.getByText('Movie · Animation')).toBeOnTheScreen();
    expect(screen.getByTestId('detail-backdrop')).toBeOnTheScreen();
  });

  it('uses the logo as the title when given, and hides an empty subtitle', async () => {
    await render(<DetailHero logo="https://jf/l.png" title="Sintel" subtitle="" />);
    expect(screen.getByTestId('detail-logo')).toHaveProp('accessibilityLabel', 'Sintel');
    expect(screen.queryByText('Sintel')).toBeNull();
    expect(screen.queryByTestId('detail-backdrop')).toBeNull();
  });

  it('links to the parent series', async () => {
    const onPress = jest.fn();
    await render(<DetailHero title="Episode 2" subtitle="S1:E2" parent={{ name: 'Test Show', onPress }} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Test Show' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
