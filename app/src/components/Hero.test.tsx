// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Dimensions, StyleSheet } from 'react-native';

import { isWideLandscape } from '@/theme';

import { Hero, HERO_SIDE_ART } from './Hero';

describe('Hero', () => {
  it('reads eyebrow, title and progress, and opens on press', async () => {
    const onPress = jest.fn();
    await render(
      <Hero
        eyebrow="Continue Watching"
        title="Sintel"
        subtitle="2010"
        image="https://jf.example.com/bd.jpg"
        progress={0.25}
        remainingSeconds={600}
        onPress={onPress}
      />,
    );
    expect(screen.getByText('Continue Watching')).toBeOnTheScreen();
    expect(screen.getByText('10m')).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('button', { name: 'Continue Watching, Sintel, 2010, 25% watched, 10 minutes left' }),
    );
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('shows the artwork placeholder without an image', async () => {
    await render(<Hero eyebrow="Up Next" title="Test Show" onPress={() => {}} />);
    expect(screen.getByTestId('artwork-placeholder')).toBeOnTheScreen();
  });

  // Regression: full-width 16:9 filled a tablet's screen in landscape.
  it('puts the text beside the artwork on a tablet in landscape only', async () => {
    const artWidth = () => StyleSheet.flatten(screen.getByTestId('hero-art').props.style).width;
    const size = jest.spyOn(Dimensions, 'get');
    for (const [width, height, expected] of [
      [390, 844, '100%'],
      [834, 1194, '100%'],
      [1194, 834, HERO_SIDE_ART],
    ] as const) {
      size.mockReturnValue({ width, height, scale: 2, fontScale: 1 });
      await render(<Hero eyebrow="Up Next" title="Test Show" onPress={() => {}} />);
      expect(artWidth()).toBe(expected);
    }
    size.mockRestore();
  });
});

describe('isWideLandscape', () => {
  it('is a wide window wider than tall', () => {
    expect(isWideLandscape(1194, 834)).toBe(true);
    expect(isWideLandscape(834, 1194)).toBe(false);
    expect(isWideLandscape(440, 300)).toBe(false);
  });
});
