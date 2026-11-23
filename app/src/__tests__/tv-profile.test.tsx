// SPDX-License-Identifier: GPL-3.0-or-later
// Apple TV profile tab: who's signed in, Switch Account / Settings, Sign Out after asking.
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';

import type { AuthenticationResult } from '@/api';
import Profile from '@/app/(tabs)/profile';
import { TvMenuHost } from '@/components/tv/TvMenu';
import { addAccount, getSession, removeAccount, type Server } from '@/session';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const { router } = jest.requireMock<{ router: { push: jest.Mock } }>('expo-router');
const home: Server = { id: 'srv', url: 'https://jf.example.com', name: 'Home server', version: '12.1.0' };
const auth = (name: string): AuthenticationResult => ({
  User: { Id: `srv-${name}`, Name: name },
  AccessToken: `tok-${name}`,
  ServerId: 'srv',
});

const isTV = Object.getOwnPropertyDescriptor(Platform, 'isTV')!;
beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(Platform, 'isTV', { get: () => true, configurable: true });
});
afterEach(async () => {
  Object.defineProperty(Platform, 'isTV', isTV);
  for (const a of getSession().accounts) await act(() => removeAccount(a.id));
});

const renderTv = () =>
  render(
    <TvMenuHost>
      <Profile />
    </TvMenuHost>,
  );

describe('Profile tab on Apple TV', () => {
  it("shows who's signed in and where", async () => {
    await addAccount(home, auth('Alex'), 'd1');
    await renderTv();
    expect(screen.getByRole('header')).toHaveTextContent('Alex');
    expect(screen.getByText('Home server')).toBeOnTheScreen();
  });

  it("opens Who's Watching and Settings; nothing focused on open", async () => {
    await addAccount(home, auth('Alex'), 'd1');
    await renderTv();
    const switchAccount = screen.getByRole('button', { name: 'Switch Account' });
    expect(switchAccount.props.hasTVPreferredFocus).toBeFalsy();
    await fireEvent.press(switchAccount);
    expect(router.push).toHaveBeenCalledWith('/accounts');
    await fireEvent.press(screen.getByRole('button', { name: 'Settings' }));
    expect(router.push).toHaveBeenCalledWith('/settings');
  });

  it('signs out only after asking', async () => {
    const alex = await addAccount(home, auth('Alex'), 'd1');
    await renderTv();
    await fireEvent.press(screen.getByRole('button', { name: 'Sign Out' }));
    expect(getSession().accounts.find((a) => a.id === alex.id)?.signedOut).toBeFalsy();
    expect(screen.getByText('Sign out of Alex on Home server?')).toBeOnTheScreen();
    const buttons = screen.getAllByRole('button', { name: 'Sign Out' });
    await fireEvent.press(buttons[buttons.length - 1]);
    expect(getSession().accounts.find((a) => a.id === alex.id)?.signedOut).toBe(true);
  });
});
