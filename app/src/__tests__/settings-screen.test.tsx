// SPDX-License-Identifier: GPL-3.0-or-later
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Storage } from 'expo-sqlite/kv-store';
import { Appearance as RNAppearance } from 'react-native';

import Settings from '@/app/settings';
import { useAccounts, type Account } from '@/auth';
import { setAppearance } from '@/settings';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/auth', () => ({ useAccounts: jest.fn() }));

const { router } = jest.requireMock<{ router: { push: jest.Mock } }>('expo-router');

const anna: Account = {
  id: 'a',
  server: { url: 'https://jf.example.com', name: 'Home server', version: '12.1.0' },
  userName: 'anna',
};

function signedIn(active: Account | null) {
  jest.mocked(useAccounts).mockReturnValue({ accounts: active ? [active] : [], activeId: active?.id ?? null, active });
}

describe('Settings screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    signedIn(null);
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

  it('shows the current user card and opens Account', async () => {
    signedIn(anna);
    await render(<Settings />);
    expect(screen.getByText('anna')).toBeOnTheScreen();
    expect(screen.getByText('Home server')).toBeOnTheScreen();
    expect(screen.getByText('A', { includeHiddenElements: true })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'anna, Home server' }));
    expect(router.push).toHaveBeenCalledWith('/account');
  });

  it('offers Sign in when signed out', async () => {
    await render(<Settings />);
    expect(screen.getByText('Add a Jellyfin server')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    expect(router.push).toHaveBeenCalledWith('/server');
  });

  it('shows the download defaults and app version', async () => {
    await render(<Settings />);
    expect(screen.getByText('Wi-Fi only')).toBeOnTheScreen();
    expect(screen.getByText('After 7 days')).toBeOnTheScreen();
    expect(screen.getByText('Version')).toBeOnTheScreen();
  });
});
