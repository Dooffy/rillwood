// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { PlayButton } from './PlayButton';

const fillWidth = () => StyleSheet.flatten(screen.getByTestId('play-progress-fill').props.style).width;

describe('PlayButton', () => {
  it('says Play with nothing watched, no progress track', async () => {
    const onPress = jest.fn();
    await render(<PlayButton onPress={onPress} />);
    expect(screen.getByText('Play')).toBeOnTheScreen();
    expect(screen.queryByTestId('play-progress')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Play' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('carries the progress and time left instead of the word Resume', async () => {
    await render(<PlayButton progress={0.4} remainingSeconds={3780} onPress={() => {}} />);
    expect(screen.queryByText('Resume')).toBeNull();
    expect(screen.getByText('1h 3m left')).toBeOnTheScreen();
    expect(fillWidth()).toBe('40%');
    expect(screen.getByRole('button', { name: 'Resume, 1 hour 3 minutes left' })).toBeOnTheScreen();
  });

  it('names what it plays, spoken in full', async () => {
    await render(<PlayButton label="S1, E4" spokenLabel="Season 1, Episode 4" onPress={() => {}} />);
    expect(screen.getByText('S1, E4')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Play Season 1, Episode 4' })).toBeOnTheScreen();
  });

  it('shows no bare "left" when nothing is left', async () => {
    await render(<PlayButton progress={1} remainingSeconds={0} onPress={() => {}} />);
    expect(screen.queryByText(/left$/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Resume' })).toBeOnTheScreen();
  });

  it('is disabled until there is something to play', async () => {
    await render(<PlayButton label="Episode" />);
    expect(screen.getByRole('button', { name: 'Play Episode' })).toBeDisabled();
  });
});
