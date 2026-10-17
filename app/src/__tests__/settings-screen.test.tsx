// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Storage } from 'expo-sqlite/kv-store';
import { Appearance as RNAppearance } from 'react-native';

import Settings from '@/app/settings';
import { ToastProvider } from '@/components/Toast';
import { useSession, type Account } from '@/session';
import {
  setAppearance,
  setDownloadLimit,
  setDownloadNetwork,
  setOffloadDays,
  setOffloadWatched,
  setSubtitleScale,
} from '@/settings';
import { resetDevice, setDevice, TABLET_LANDSCAPE, TABLET_PORTRAIT } from '@/testDevice';

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

const ben: Account = { ...anna, id: 'srv.b', userId: 'b', userName: 'ben', signedOut: true };

/** Settings uses the toast (switching says so). */
const renderSettings = () =>
  render(
    <ToastProvider>
      <Settings />
    </ToastProvider>,
  );

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
    setOffloadDays(90);
    setOffloadWatched(0);
  });

  it('shows the current appearance and opens its list', async () => {
    setAppearance('dark');
    await renderSettings();
    expect(screen.getByRole('button', { name: 'Appearance' })).toHaveAccessibilityValue({ text: 'Dark' });
    await fireEvent.press(screen.getByRole('button', { name: 'Appearance' }));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/option/[key]', params: { key: 'appearance' } });
  });

  it('follows an appearance change made in its list', async () => {
    await renderSettings();
    await act(() => setAppearance('light'));
    expect(screen.getByRole('button', { name: 'Appearance' })).toHaveAccessibilityValue({ text: 'Light' });
  });

  it('lists the accounts on top: tap the active one for its details', async () => {
    signedIn(anna, [ben]);
    await renderSettings();
    expect(screen.getByRole('header', { name: 'ACCOUNTS' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'anna, Home server' })).toHaveAccessibilityValue({ text: 'Active' });
    expect(screen.getByRole('button', { name: 'ben, Home server' })).toHaveAccessibilityValue({ text: 'Signed out' });
    await fireEvent.press(screen.getByRole('button', { name: 'anna, Home server' }));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/account', params: { id: 'srv.a' } });
  });

  it('offers Add account when signed out with nothing saved', async () => {
    await renderSettings();
    await fireEvent.press(screen.getByRole('button', { name: 'Add account' }));
    expect(router.push).toHaveBeenCalledWith('/server');
  });

  it('shows the subtitle size and colour and opens Subtitles', async () => {
    setSubtitleScale(1.25);
    await renderSettings();
    expect(screen.getByRole('button', { name: 'Subtitles' })).toHaveAccessibilityValue({ text: 'Large, White' });
    await fireEvent.press(screen.getByRole('button', { name: 'Subtitles' }));
    expect(router.push).toHaveBeenCalledWith('/subtitles');
  });

  it('shows the download defaults and app version', async () => {
    await renderSettings();
    expect(screen.getByRole('button', { name: 'Network' })).toHaveAccessibilityValue({ text: 'Wi-Fi only' });
    expect(screen.getByRole('button', { name: 'Storage limit' })).toHaveAccessibilityValue({ text: 'No limit' });
    expect(screen.getByRole('button', { name: 'Remove downloads' })).toHaveAccessibilityValue({ text: '90 days' });
    expect(screen.queryByRole('button', { name: 'Remove watched' })).toBeNull();
    expect(screen.getByText('Version')).toBeOnTheScreen();
  });

  it('opens the download network list and the storage limit', async () => {
    setDownloadNetwork('any');
    setDownloadLimit(50);
    await renderSettings();
    expect(screen.getByRole('button', { name: 'Network' })).toHaveAccessibilityValue({ text: 'Any network' });
    expect(screen.getByRole('button', { name: 'Storage limit' })).toHaveAccessibilityValue({ text: '50 GB' });
    await fireEvent.press(screen.getByRole('button', { name: 'Network' }));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/option/[key]', params: { key: 'download-network' } });
    await fireEvent.press(screen.getByRole('button', { name: 'Storage limit' }));
    expect(router.push).toHaveBeenCalledWith('/download-storage');
  });

  it('opens the auto-remove page', async () => {
    setOffloadDays(30);
    await renderSettings();
    expect(screen.getByRole('button', { name: 'Remove downloads' })).toHaveAccessibilityValue({ text: '30 days' });
    await fireEvent.press(screen.getByRole('button', { name: 'Remove downloads' }));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/option/[key]', params: { key: 'offload-days' } });
  });

  describe('on a tablet in landscape: split view', () => {
    beforeEach(async () => {
      await setDevice(...TABLET_LANDSCAPE);
      signedIn(anna, [ben]);
    });
    afterEach(resetDevice);

    const row = (name: string) => screen.getByRole('button', { name });

    it("shows the active account's details beside the list, its row selected", async () => {
      await renderSettings();
      expect(screen.getByText('Active on Home server')).toBeOnTheScreen();
      expect(row('anna, Home server')).toBeSelected();
      expect(row('Subtitles')).not.toBeSelected();
    });

    it('opens a row in the pane, not a new screen', async () => {
      await renderSettings();
      await fireEvent.press(row('Storage limit'));
      expect(router.push).not.toHaveBeenCalled();
      expect(screen.getByRole('header', { name: 'Storage limit' })).toBeOnTheScreen();
      expect(screen.getByRole('adjustable', { name: 'Download storage limit' })).toBeOnTheScreen();
      expect(row('Storage limit')).toBeSelected();
      expect(screen.queryByText('Active on Home server')).toBeNull();
    });

    it('a page opened from the pane goes over it with a back button; a list row starts over', async () => {
      await renderSettings();
      await fireEvent.press(row('Subtitles'));
      await fireEvent.press(row('Size'));
      expect(router.push).not.toHaveBeenCalled();
      expect(screen.getByRole('header', { name: 'Size' })).toBeOnTheScreen();
      // The list keeps Subtitles selected.
      expect(row('Subtitles')).toBeSelected();
      await fireEvent.press(row('Back to Subtitles'));
      expect(screen.getByRole('header', { name: 'Subtitles' })).toBeOnTheScreen();
      await fireEvent.press(row('Size'));
      await fireEvent.press(row('Appearance'));
      expect(screen.getByRole('header', { name: 'Appearance' })).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: /^Back to/ })).toBeNull();
    });

    it('(i) on another account shows its details', async () => {
      await renderSettings();
      await fireEvent.press(row('ben on Home server, details'));
      expect(screen.getByText('Signed out of Home server')).toBeOnTheScreen();
      expect(row('ben, Home server')).toBeSelected();
    });

    it('an account gone while shown: back to the active one', async () => {
      const view = await renderSettings();
      await fireEvent.press(row('ben on Home server, details'));
      signedIn(anna);
      await view.rerender(
        <ToastProvider>
          <Settings />
        </ToastProvider>,
      );
      expect(screen.getByText('Active on Home server')).toBeOnTheScreen();
    });

    it('portrait keeps one column: rows open their screen', async () => {
      await setDevice(...TABLET_PORTRAIT);
      await renderSettings();
      await fireEvent.press(row('Subtitles'));
      expect(router.push).toHaveBeenCalledWith('/subtitles');
    });
  });
});
