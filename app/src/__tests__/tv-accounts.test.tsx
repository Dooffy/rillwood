// SPDX-License-Identifier: GPL-3.0-or-later
// Apple TV Who's Watching (screen draft 03): accounts across servers, click switches, hold for Sign Out / Remove.
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';

import type { AuthenticationResult } from '@/api';
import Accounts from '@/app/(auth)/accounts';
import { TvMenuHost } from '@/components/tv/TvMenu';
import { launchHref } from '@/navigation';
import { addAccount, getSession, removeAccount, signOut, switchAccount, type Account, type Server } from '@/session';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/navigation', () => ({
  ...jest.requireActual<typeof import('@/navigation')>('@/navigation'),
  resetTo: jest.fn(),
}));

const { router } = jest.requireMock<{ router: { push: jest.Mock } }>('expo-router');
const { resetTo } = jest.requireMock<{ resetTo: jest.Mock }>('@/navigation');
const home: Server = { id: 'srv', url: 'https://jf.example.com', name: 'Home server', version: '12.1.0' };
const cabin: Server = { id: 'cab', url: 'http://192.168.1.9:8096', name: 'Cabin', version: '12.1.0' };

function auth(name: string, serverId = 'srv'): AuthenticationResult {
  return { User: { Id: `${serverId}-${name}`, Name: name }, AccessToken: `tok-${name}`, ServerId: serverId };
}

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
      <Accounts />
    </TvMenuHost>,
  );

describe("Who's Watching on Apple TV", () => {
  it('shows every account with its server, focus on the active one, then Add', async () => {
    await addAccount(home, auth('Alex'), 'd1');
    const sam = await addAccount(home, auth('Sam'), 'd2');
    await addAccount(cabin, auth('Alex', 'cab'), 'd3');
    switchAccount(sam.id);
    await renderTv();
    expect(screen.getByRole('header')).toHaveTextContent("Who's watching?");
    expect(screen.getByRole('button', { name: 'Alex, Home server' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Alex, Cabin' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Sam, Home server' }).props.hasTVPreferredFocus).toBe(true);
    expect(screen.getByRole('button', { name: 'Alex, Home server' }).props.hasTVPreferredFocus).toBe(false);
    expect(screen.getByRole('button', { name: 'Add Account' })).toBeOnTheScreen();
  });

  it('switches on click and goes Home', async () => {
    const alex = await addAccount(home, auth('Alex'), 'd1');
    await addAccount(home, auth('Sam'), 'd2');
    await renderTv();
    await fireEvent.press(screen.getByRole('button', { name: 'Alex, Home server' }));
    expect(getSession().active?.id).toBe(alex.id);
    expect(resetTo).toHaveBeenCalledWith('/home');
  });

  it('opens Sign in for a signed-out account', async () => {
    const alex = await addAccount(home, auth('Alex'), 'd1');
    await addAccount(home, auth('Sam'), 'd2');
    await act(() => signOut(alex.id));
    await renderTv();
    await fireEvent.press(screen.getByRole('button', { name: 'Alex, Home server · Signed out' }));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/login', params: { url: home.url, userName: 'Alex' } });
    expect(resetTo).not.toHaveBeenCalled();
  });

  it('signs out from the hold menu', async () => {
    const alex = await addAccount(home, auth('Alex'), 'd1');
    await addAccount(home, auth('Sam'), 'd2');
    await renderTv();
    await fireEvent(screen.getByRole('button', { name: 'Alex, Home server' }), 'longPress');
    expect(screen.getByText('Alex on Home server')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Sign Out' }));
    expect(getSession().accounts.find((a) => a.id === alex.id)?.signedOut).toBe(true);
    expect(screen.getByRole('button', { name: 'Alex, Home server · Signed out' })).toBeOnTheScreen();
  });

  it('asks before removing, then forgets the account', async () => {
    await addAccount(home, auth('Alex'), 'd1');
    await addAccount(home, auth('Sam'), 'd2');
    await renderTv();
    await fireEvent(screen.getByRole('button', { name: 'Alex, Home server' }), 'longPress');
    await fireEvent.press(screen.getByRole('button', { name: 'Remove' }));
    expect(screen.getByText(/Remove Alex\? You'll need to sign in again/)).toBeOnTheScreen();
    expect(getSession().accounts).toHaveLength(2);
    await fireEvent.press(screen.getByRole('button', { name: 'Remove' }));
    expect(getSession().accounts.map((a) => a.userName)).toEqual(['Sam']);
    expect(screen.queryByRole('button', { name: 'Alex, Home server' })).toBeNull();
  });

  it('adds an account on a saved server or a new one', async () => {
    await addAccount(home, auth('Alex'), 'd1');
    await renderTv();
    await fireEvent.press(screen.getByRole('button', { name: 'Add Account' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Home server, jf.example.com' }));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/login', params: { url: home.url } });
    await fireEvent.press(screen.getByRole('button', { name: 'Add Account' }));
    await fireEvent.press(screen.getByRole('button', { name: 'New server' }));
    expect(router.push).toHaveBeenLastCalledWith('/welcome');
  });

  it('opens Settings from the gear', async () => {
    await addAccount(home, auth('Alex'), 'd1');
    await renderTv();
    await fireEvent.press(screen.getByRole('button', { name: 'Settings' }));
    expect(router.push).toHaveBeenCalledWith('/settings');
  });
});

describe('launchHref', () => {
  const account = (id: string, signedOut = false): Account => ({
    id,
    server: home,
    userId: id,
    userName: id,
    deviceId: id,
    signedOut,
  });

  it("is Who's Watching on TV with two or more signed-in accounts only", () => {
    const a = account('a');
    expect(launchHref({ accounts: [a, account('b')], active: a }, true)).toBe('/accounts');
    expect(launchHref({ accounts: [a, account('b', true)], active: a }, true)).toBe('/home');
    expect(launchHref({ accounts: [a, account('b')], active: a }, false)).toBe('/home');
    expect(launchHref({ accounts: [account('b', true)], active: null }, true)).toBe('/welcome');
  });
});
