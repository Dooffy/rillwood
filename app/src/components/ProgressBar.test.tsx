// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';

import { onArtwork, palettes } from '@/theme';

import { clamp01, ProgressBar } from './ProgressBar';

describe('ProgressBar', () => {
  it('fills to the progress and reports it as a percentage', async () => {
    await render(<ProgressBar progress={0.4} />);
    expect(screen.getByTestId('progress-fill')).toHaveStyle({ width: '40%', backgroundColor: palettes.dark.text });
    expect(screen.getByRole('progressbar')).toHaveAccessibilityValue({ min: 0, max: 100, now: 40 });
  });

  it('uses white on a translucent track over artwork', async () => {
    await render(<ProgressBar progress={0.5} overArtwork />);
    expect(screen.getByTestId('progress-fill')).toHaveStyle({ backgroundColor: onArtwork.fill });
    expect(screen.getByRole('progressbar')).toHaveStyle({ backgroundColor: onArtwork.track });
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
