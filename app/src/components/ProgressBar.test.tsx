// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';

import { onArtwork, palettes } from '@/theme';

import { clamp01, ProgressBar } from './ProgressBar';

describe('ProgressBar', () => {
  it('fills to the progress; with a label it reports it as a percentage', async () => {
    await render(<ProgressBar progress={0.4} label="Watched" />);
    expect(screen.getByTestId('progress-fill')).toHaveStyle({ width: '40%', backgroundColor: palettes.dark.text });
    expect(screen.getByRole('progressbar', { name: 'Watched' })).toHaveAccessibilityValue({
      min: 0,
      max: 100,
      now: 40,
    });
  });

  it('without a label it is hidden from screen readers (its card or button says it)', async () => {
    await render(<ProgressBar progress={0.4} />);
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.getByTestId('progress-bar')).toBeOnTheScreen();
  });

  it('uses white on a translucent track over artwork', async () => {
    await render(<ProgressBar progress={0.5} overArtwork />);
    expect(screen.getByTestId('progress-fill')).toHaveStyle({ backgroundColor: onArtwork.fill });
    expect(screen.getByTestId('progress-bar')).toHaveStyle({ backgroundColor: onArtwork.track });
  });

  it.each([
    [-1, 0],
    [2, 1],
    [Number.NaN, 0],
    [0.25, 0.25],
  ])('clamps %p to %p', (input, expected) => {
    expect(clamp01(input)).toBe(expected);
  });
});
