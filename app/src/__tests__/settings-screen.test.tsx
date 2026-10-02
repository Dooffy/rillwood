// SPDX-License-Identifier: GPL-3.0-or-later
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Storage } from 'expo-sqlite/kv-store';
import { Appearance as RNAppearance } from 'react-native';

import Settings from '@/app/settings';
import { setAppearance } from '@/settings';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

describe('Settings screen', () => {
  beforeEach(() => {
    Storage.clearSync();
    jest.spyOn(RNAppearance, 'setColorScheme').mockImplementation(() => {});
    setAppearance('system');
  });

  it('shows the current appearance', async () => {
    setAppearance('dark');
    await render(<Settings />);
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked();
  });

  it('saves and applies a new appearance', async () => {
    await render(<Settings />);
    expect(screen.getByRole('radio', { name: 'System' })).toBeChecked();
    await fireEvent.press(screen.getByRole('radio', { name: 'Light' }));
    expect(screen.getByRole('radio', { name: 'Light' })).toBeChecked();
    expect(Storage.getItemSync('settings.appearance')).toBe('light');
    expect(RNAppearance.setColorScheme).toHaveBeenLastCalledWith('light');
  });

  it('shows the download defaults and app version', async () => {
    await render(<Settings />);
    expect(screen.getByText('Wi-Fi only')).toBeOnTheScreen();
    expect(screen.getByText('After 7 days')).toBeOnTheScreen();
    expect(screen.getByText('Version')).toBeOnTheScreen();
  });
});
