// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { EpisodeRow } from './EpisodeRow';

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
});
