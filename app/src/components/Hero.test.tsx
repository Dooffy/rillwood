// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, renderHook, screen } from '@testing-library/react-native';
import { Dimensions } from 'react-native';

import { PHONE, resetDevice, setDevice, TABLET_LANDSCAPE, TABLET_PORTRAIT } from '@/testDevice';
import { isWideLandscape } from '@/theme';

import { Hero, useHeroAspect, WIDE_HERO_RATIO } from './Hero';

describe('Hero', () => {
  afterEach(resetDevice);

  it('phones: reads eyebrow, title and progress under the art, and opens on press', async () => {
    const onPress = jest.fn();
    await setDevice(...PHONE);
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

  // Tablets (both ways up): the text and the play button on the cropped art, the progress in the button.
  it('tablets: title and play button on the art, the button plays', async () => {
    const onPress = jest.fn();
    const onPlay = jest.fn();
    for (const device of [TABLET_PORTRAIT, TABLET_LANDSCAPE]) {
      await setDevice(device[0], device[1]);
      await render(
        <Hero
          eyebrow="Continue Watching"
          title="Sintel"
          subtitle="2010"
          progress={0.25}
          remainingSeconds={600}
          onPress={onPress}
          onPlay={onPlay}
        />,
      );
      expect(screen.getByText('CONTINUE WATCHING')).toBeOnTheScreen();
      expect(screen.getByText('10m left')).toBeOnTheScreen();
      // No bar on the art: the button carries the progress.
      expect(screen.queryByTestId('progress-bar')).toBeNull();
      await fireEvent.press(screen.getByRole('button', { name: 'Resume, 10 minutes left' }));
    }
    expect(onPlay).toHaveBeenCalledTimes(2);
    expect(onPress).not.toHaveBeenCalled();
  });
});

// Regression: a full-width 16:9 hero took ~40% of a 13" iPad.
describe('useHeroAspect', () => {
  it('crops wider on wide screens, both ways up; 16:9 on phones', async () => {
    const size = jest.spyOn(Dimensions, 'get');
    for (const [width, height, expected] of [
      [390, 844, 16 / 9],
      [834, 1194, WIDE_HERO_RATIO],
      [1194, 834, WIDE_HERO_RATIO],
    ] as const) {
      size.mockReturnValue({ width, height, scale: 2, fontScale: 1 });
      const { result } = await renderHook(() => useHeroAspect());
      expect(result.current).toBe(expected);
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
