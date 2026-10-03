// SPDX-License-Identifier: GPL-3.0-or-later
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import Accounts from '@/app/(auth)/accounts';
import Home from '@/app/(tabs)/home';
import Player from '@/app/player';
import Settings from '@/app/settings';
import * as session from '@/session';
import { palettes } from '@/theme';
import { ToastProvider } from '@/components/Toast';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('expo-status-bar', () => ({ StatusBar: jest.fn(() => null) }));

const { router } = jest.requireMock<{ router: { push: jest.Mock; back: jest.Mock } }>('expo-router');
const { StatusBar } = jest.requireMock<{ StatusBar: jest.Mock }>('expo-status-bar');

const anna: session.Account = {
  id: 'srv.a',
  server: { id: 'srv', url: 'https://jf.example.com', name: 'Home server', version: '12.1.0' },
  userId: 'a',
  userName: 'anna',
  deviceId: 'dev',
};

async function renderScreen(ui: ReactElement) {
  await render(<ToastProvider>{ui}</ToastProvider>);
}

describe('navigation', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it.each([
    ['Home', <Home key="home" />, 'Settings', '/settings'],
    [
      'Settings (signed out)',
      <Settings key="settings" />,
      'Sign in',
      { pathname: '/server', params: { onboarding: '1' } },
    ],
    ['Accounts', <Accounts key="accounts" />, 'Add server', '/server'],
  ])('%s pushes its route', async (_name, ui, button, route) => {
    await renderScreen(ui);
    await fireEvent.press(screen.getByRole('button', { name: button }));
    expect(router.push).toHaveBeenCalledWith(route);
  });

  it('Home shows the active user as the Settings button', async () => {
    jest.spyOn(session, 'useSession').mockReturnValue({ accounts: [anna], active: anna });
    await renderScreen(<Home />);
    expect(screen.getByRole('button', { name: 'Settings' })).toBeOnTheScreen();
    expect(screen.getByText('A', { includeHiddenElements: true })).toBeOnTheScreen();
  });

  it('Player Close goes back', async () => {
    await renderScreen(<Player />);
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  // Regression: the always-black player kept the root status bar style, so light mode drew black icons on black.
  it('Player forces light status bar icons and the dark palette', async () => {
    await renderScreen(<Player />);
    expect(StatusBar).toHaveBeenLastCalledWith({ style: 'light' }, undefined);
    expect(screen.getByText('Close')).toHaveStyle({ color: palettes.dark.text });
  });
});
