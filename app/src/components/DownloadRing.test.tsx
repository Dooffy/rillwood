// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { DownloadRing } from './DownloadRing';

const rotation = (testID: string) =>
  (StyleSheet.flatten(screen.getByTestId(testID).props.style) as { transform: { rotate: string }[] }).transform[0]
    .rotate;

describe('DownloadRing', () => {
  it('draws a quarter with the right half only', async () => {
    await render(<DownloadRing progress={0.25} />);
    expect(rotation('ring-right')).toBe('90deg');
    expect(screen.queryByTestId('ring-left')).toBeNull();
  });

  it('fills the right half and rotates the left half past 50%', async () => {
    await render(<DownloadRing progress={0.75} />);
    expect(rotation('ring-right')).toBe('180deg');
    expect(rotation('ring-left')).toBe('90deg');
  });

  it('draws no arc at 0%', async () => {
    await render(<DownloadRing progress={0} />);
    expect(screen.queryByTestId('ring-right')).toBeNull();
  });

  it('shows a stop square while downloading; a press opens its menu', async () => {
    const onPress = jest.fn();
    await render(<DownloadRing progress={0.4} onPress={onPress} />);
    expect(screen.getByTestId('ring-stop', { includeHiddenElements: true })).toBeOnTheScreen();
    const button = screen.getByRole('button', { name: 'Downloading' });
    expect(button.props.accessibilityHint).toBe('Pause or cancel');
    expect(button).toHaveAccessibilityValue({ now: 40, text: '40%' });
    await fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('says paused, resume or cancel, when paused', async () => {
    await render(<DownloadRing progress={0.4} paused onPress={() => {}} />);
    expect(screen.getByRole('button', { name: 'Download paused' }).props.accessibilityHint).toBe('Resume or cancel');
    expect(screen.queryByTestId('ring-stop', { includeHiddenElements: true })).toBeNull();
  });

  it('is a display-only progress bar without onPress', async () => {
    await render(<DownloadRing progress={0.4} paused />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('progressbar', { name: 'Download paused' })).toHaveAccessibilityValue({ now: 40 });
  });
});
