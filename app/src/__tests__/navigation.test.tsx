// SPDX-License-Identifier: GPL-3.0-or-later
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import Accounts from '@/app/(auth)/accounts';
import Home from '@/app/(tabs)/home';
import Settings from '@/app/settings';
import * as session from '@/session';
import { ItemMenuProvider } from '@/components/ItemMenu';
import { ToastProvider } from '@/components/Toast';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const { router } = jest.requireMock<{ router: { push: jest.Mock } }>('expo-router');

const anna: session.Account = {
  id: 'srv.a',
  server: { id: 'srv', url: 'https://jf.example.com', name: 'Home server', version: '12.1.0' },
  userId: 'a',
  userName: 'anna',
  deviceId: 'dev',
};

async function renderScreen(ui: ReactElement) {
  await render(
    <ToastProvider>
      <ItemMenuProvider>{ui}</ItemMenuProvider>
    </ToastProvider>,
  );
}

describe('navigation', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it.each([
    ['Home', <Home key="home" />, 'Settings', '/settings'],
    ['Settings (nothing saved)', <Settings key="settings" />, 'Add account', '/server'],
    ['Accounts (nothing saved)', <Accounts key="accounts" />, 'Add account', '/server'],
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
});
