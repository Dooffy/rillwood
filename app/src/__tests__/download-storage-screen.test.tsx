// SPDX-License-Identifier: GPL-3.0-or-later
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Storage } from 'expo-sqlite/kv-store';

import DownloadStorage from '@/app/download-storage';
import { getDownloadLimit, setDownloadLimit } from '@/settings';

jest.mock('expo-file-system', () => ({ Paths: { totalDiskSpace: 128e9 } }));
// Two downloads: 4.2 GB + 8 GB (one still downloading - counted at full size).
jest.mock('@/downloads', () => {
  const list = [{ total: 4.2e9 }, { total: 8e9 }];
  return {
    useDownloadList: () => list,
    downloadsSize: (ds: { total: number }[]) => ds.reduce((sum, d) => sum + d.total, 0),
  };
});

const slider = () => screen.getByRole('adjustable', { name: 'Download storage limit' });

describe('Download storage screen', () => {
  beforeEach(() => {
    Storage.clearSync();
    setDownloadLimit(0);
  });

  it('shows no limit at the end and what downloads take', async () => {
    await render(<DownloadStorage />);
    expect(slider()).toHaveAccessibilityValue({ text: 'No limit' });
    expect(screen.getByText(/Downloads take 12.2 GB/)).toBeOnTheScreen();
  });

  it('saves a stop: one less than no limit is the biggest that fits the disk', async () => {
    await render(<DownloadStorage />);
    await fireEvent.press(screen.getByRole('button', { name: 'Less' }));
    // 128 GB disk: stops up to 100 GB (90% = 115 GB).
    expect(getDownloadLimit()).toBe(100);
    expect(slider()).toHaveAccessibilityValue({ text: '100 GB' });
  });

  it('shows a limit saved on a bigger phone as it is; picking its nearest stop sets that', async () => {
    await act(() => setDownloadLimit(500));
    await render(<DownloadStorage />);
    expect(slider()).toHaveAccessibilityValue({ text: '500 GB' });
    // 128 GB disk: 500 GB sits on the 100 GB stop (stop 9 of 0-10, the last before No limit).
    const track = screen.getByTestId('step-slider');
    await fireEvent(track, 'layout', { nativeEvent: { layout: { width: 320, height: 44 } } });
    await fireEvent(track, 'responderGrant', { nativeEvent: { locationX: 300 } });
    await fireEvent(track, 'responderRelease', { nativeEvent: { locationX: 300 } });
    expect(getDownloadLimit()).toBe(100);
  });
});
