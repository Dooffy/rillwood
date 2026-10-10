// SPDX-License-Identifier: GPL-3.0-or-later
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Storage } from 'expo-sqlite/kv-store';
import { Appearance as RNAppearance } from 'react-native';

import Settings from '@/app/settings';
import { useSession, type Account } from '@/session';
import { setAppearance, setDownloadLimit, setDownloadNetwork, setSubtitleScale } from '@/settings';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/session', () => ({ useSession: jest.fn() }));

const { router } = jest.requireMock<{ router: { push: jest.Mock } }>('expo-router');

const anna: Account = {
  id: 'srv.a',
  server: { id: 'srv', url: 'https://jf.example.com', name: 'Home server', version: '12.1.0' },
  userId: 'a',
  userName: 'anna',
  deviceId: 'dev',
};

/** Session with `active` signed in plus any signed-out `others`. */
function signedIn(active: Account | null, others: Account[] = []) {
  jest.mocked(useSession).mockReturnValue({ accounts: [...(active ? [active] : []), ...others], active });
}

describe('Settings screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    signedIn(null);
    Storage.clearSync();
    jest.spyOn(RNAppearance, 'setColorScheme').mockImplementation(() => {});
    setAppearance('system');
    setSubtitleScale(1);
    setDownloadNetwork('wifi');
    setDownloadLimit(0);
  });

  it('shows the current appearance and opens its list', async () => {
    setAppearance('dark');
    await render(<Settings />);
    expect(screen.getByRole('button', { name: 'Appearance' })).toHaveAccessibilityValue({ text: 'Dark' });
    await fireEvent.press(screen.getByRole('button', { name: 'Appearance' }));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/option/[key]', params: { key: 'appearance' } });
  });

  it('follows an appearance change made in its list', async () => {
    await render(<Settings />);
    await act(() => setAppearance('light'));
    expect(screen.getByRole('button', { name: 'Appearance' })).toHaveAccessibilityValue({ text: 'Light' });
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
    expect(router.push).toHaveBeenCalledWith({ pathname: '/server', params: { onboarding: '1' } });
  });

  it('shows the subtitle size and colour and opens Subtitles', async () => {
    setSubtitleScale(1.25);
    await render(<Settings />);
    expect(screen.getByRole('button', { name: 'Subtitles' })).toHaveAccessibilityValue({ text: 'Large, White' });
    await fireEvent.press(screen.getByRole('button', { name: 'Subtitles' }));
    expect(router.push).toHaveBeenCalledWith('/subtitles');
  });

  it('shows the download defaults and app version', async () => {
    await render(<Settings />);
    expect(screen.getByRole('button', { name: 'Network' })).toHaveAccessibilityValue({ text: 'Wi-Fi only' });
    expect(screen.getByRole('button', { name: 'Storage limit' })).toHaveAccessibilityValue({ text: 'No limit' });
    expect(screen.getByText('After 7 days')).toBeOnTheScreen();
    expect(screen.getByText('Version')).toBeOnTheScreen();
  });

  it('opens the download network list and the storage limit', async () => {
    setDownloadNetwork('any');
    setDownloadLimit(50);
    await render(<Settings />);
    expect(screen.getByRole('button', { name: 'Network' })).toHaveAccessibilityValue({ text: 'Any network' });
    expect(screen.getByRole('button', { name: 'Storage limit' })).toHaveAccessibilityValue({ text: '50 GB' });
    await fireEvent.press(screen.getByRole('button', { name: 'Network' }));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/option/[key]', params: { key: 'download-network' } });
    await fireEvent.press(screen.getByRole('button', { name: 'Storage limit' }));
    expect(router.push).toHaveBeenCalledWith('/download-storage');
  });
});
