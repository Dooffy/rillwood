// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { PHONE, resetDevice, setDevice, TABLET_PORTRAIT } from '@/testDevice';

import { EPISODE_ROW_STILL, EpisodeRow, WIDE_EPISODE_ROW_STILL } from './EpisodeRow';

describe('EpisodeRow', () => {
  it('reads show, episode line and progress, and opens on press', async () => {
    const onPress = jest.fn();
    await render(
      <EpisodeRow
        title="Test Show"
        subtitle="S1:E2 · Pilot"
        runtimeSeconds={2700}
        progress={0.5}
        remainingSeconds={1350}
        onPress={onPress}
      />,
    );
    expect(screen.getByText('45m')).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('button', { name: 'Test Show, S1:E2 · Pilot, 50% watched, 23 minutes left, 45 minutes' }),
    );
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('has a bigger still on tablets', async () => {
    const width = () => StyleSheet.flatten(screen.getByTestId('episode-row-still').props.style).width;
    await setDevice(...PHONE);
    await render(<EpisodeRow title="Test Show" subtitle="S1:E2 · Pilot" onPress={() => {}} />);
    expect(width()).toBe(EPISODE_ROW_STILL);
    await setDevice(...TABLET_PORTRAIT);
    expect(width()).toBe(WIDE_EPISODE_ROW_STILL);
    resetDevice();
  });
});
