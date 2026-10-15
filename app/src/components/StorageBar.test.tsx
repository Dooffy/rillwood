// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { StorageBar, storageSummary } from './StorageBar';

describe('storageSummary', () => {
  it('without a limit: the account downloads vs free space', () => {
    expect(storageSummary({ used: 30e9, all: 40e9, free: 90e9, limit: 0 })).toEqual({
      text: 'Downloads 30 GB · 90 GB free',
      progress: 0.25,
      over: false,
    });
  });

  it('with a limit: every account of the limit, free = what is left under it', () => {
    expect(storageSummary({ used: 10e9, all: 12.3e9, free: 112e9, limit: 50 })).toEqual({
      text: 'Downloads 12.3 GB of 50 GB · 37.7 GB free',
      progress: 0.246,
      over: false,
    });
  });

  it('with a limit above the free space: free is the device, the bar fills against it', () => {
    expect(storageSummary({ used: 2e9, all: 2e9, free: 10e9, limit: 50 })).toEqual({
      text: 'Downloads 2 GB of 50 GB · 10 GB free',
      progress: 2 / 12,
      over: false,
    });
  });

  it('with a limit before free space is read: what is left under it', () => {
    expect(storageSummary({ used: 1e9, all: 1e9, limit: 5 }).text).toBe('Downloads 1 GB of 5 GB · 4 GB free');
  });

  it('over a lowered limit: says so, warning bar', () => {
    expect(storageSummary({ used: 54e9, all: 54e9, free: 100e9, limit: 50 })).toEqual({
      text: 'Downloads 54 GB of 50 GB · over the limit',
      progress: 1,
      over: true,
    });
  });
});

describe('StorageBar', () => {
  it('shows downloads against free space', async () => {
    await render(<StorageBar used={30e9} all={30e9} free={90e9} limit={0} onPress={() => {}} />);
    expect(screen.getByLabelText('Downloads 30 GB · 90 GB free')).toBeOnTheScreen();
    expect(screen.getByTestId('progress-fill')).toBeOnTheScreen();
  });

  it('shows only the downloads until free space is known', async () => {
    await render(<StorageBar used={4.2e9} all={4.2e9} limit={0} onPress={() => {}} />);
    expect(screen.getByLabelText('Downloads 4.2 GB')).toBeOnTheScreen();
    expect(screen.queryByTestId('progress-fill')).toBeNull();
  });

  it('opens the storage limit on tap', async () => {
    const onPress = jest.fn();
    await render(<StorageBar used={1e9} all={1e9} free={9e9} limit={0} onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Downloads 1 GB · 9 GB free' }));
    expect(onPress).toHaveBeenCalled();
  });
});
