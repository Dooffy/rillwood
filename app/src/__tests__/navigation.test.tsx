// SPDX-License-Identifier: GPL-3.0-or-later
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import Accounts from '@/app/(auth)/accounts';
import Login from '@/app/(auth)/login';
import Home from '@/app/(tabs)/home';
import Player from '@/app/player';
import Settings from '@/app/settings';
import { palettes } from '@/theme';
import { ToastProvider } from '@/components/Toast';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('expo-status-bar', () => ({ StatusBar: jest.fn(() => null) }));

const { router } = jest.requireMock<{ router: { push: jest.Mock; back: jest.Mock } }>('expo-router');
const { StatusBar } = jest.requireMock<{ StatusBar: jest.Mock }>('expo-status-bar');

async function renderScreen(ui: ReactElement) {
  await render(<ToastProvider>{ui}</ToastProvider>);
}

describe('navigation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    ['Home', <Home key="home" />, 'Settings', '/settings'],
    ['Settings', <Settings key="settings" />, 'Accounts', '/accounts'],
    ['Accounts', <Accounts key="accounts" />, 'Add server', '/server'],
    ['Login', <Login key="login" />, 'Use Quick Connect', '/quick-connect'],
  ])('%s pushes its route', async (_name, ui, button, route) => {
    await renderScreen(ui);
    await fireEvent.press(screen.getByRole('button', { name: button }));
    expect(router.push).toHaveBeenCalledWith(route);
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
