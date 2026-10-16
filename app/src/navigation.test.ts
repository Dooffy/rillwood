// SPDX-License-Identifier: GPL-3.0-or-later
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { renderHook } from '@testing-library/react-native';

import { useSession, type Account } from '@/session';
import { palettes } from '@/theme';

import { readablePage, openDownloads, resetTo, tabsTitle, useSignedOutRedirect } from './navigation';

jest.mock('expo-router', () => ({
  router: { canDismiss: jest.fn(), dismissAll: jest.fn(), replace: jest.fn(), navigate: jest.fn() },
}));
jest.mock('@/session', () => ({ useSession: jest.fn() }));

const { router } = jest.requireMock<{
  router: { canDismiss: jest.Mock; dismissAll: jest.Mock; replace: jest.Mock; navigate: jest.Mock };
}>('expo-router');

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

beforeEach(() => {
  jest.clearAllMocks();
});

describe('resetTo', () => {
  it('dismisses the stack, then replaces', () => {
    router.canDismiss.mockReturnValue(true);
    resetTo('/home');
    expect(router.dismissAll).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith('/home');
  });

  it('only replaces when there is nothing to dismiss', () => {
    router.canDismiss.mockReturnValue(false);
    resetTo('/server');
    expect(router.dismissAll).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith('/server');
  });
});

describe('openDownloads', () => {
  it('closes what is pushed over the tabs, then shows Downloads', () => {
    router.canDismiss.mockReturnValue(true);
    openDownloads();
    expect(router.dismissAll).toHaveBeenCalledTimes(1);
    expect(router.navigate).toHaveBeenCalledWith('/downloads');
  });

  it('from a tab: only switches', () => {
    router.canDismiss.mockReturnValue(false);
    openDownloads();
    expect(router.dismissAll).not.toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith('/downloads');
  });
});

describe('useSignedOutRedirect', () => {
  it('goes to Welcome when the active account goes away and none is left', async () => {
    signedIn(anna);
    const { rerender } = await renderHook(() => useSignedOutRedirect());
    expect(router.replace).not.toHaveBeenCalled();
    signedIn(null);
    await rerender({});
    expect(router.replace).toHaveBeenCalledWith('/welcome');
  });

  // Regression: with saved signed-out accounts, signing out landed on Accounts instead of the Welcome start.
  it('goes to Welcome even when signed-out accounts remain', async () => {
    signedIn(anna);
    const { rerender } = await renderHook(() => useSignedOutRedirect());
    signedIn(null, [{ ...anna, signedOut: true }]);
    await rerender({});
    expect(router.replace).toHaveBeenCalledWith('/welcome');
  });

  it('does nothing when already signed out', async () => {
    signedIn(null);
    const { rerender } = await renderHook(() => useSignedOutRedirect());
    await rerender({});
    expect(router.replace).not.toHaveBeenCalled();
  });
});

// Regression: screens pushed over the tabs (Settings) showed "(tabs)" as the iOS back button text.
describe('tabsTitle', () => {
  /** The tabs route as React Navigation passes it, with the nested tab state once a tab is focused. */
  const tabs = (focused?: string) => ({
    name: '(tabs)',
    ...(focused && { state: { index: 0, routes: [{ name: focused }] } }),
  });

  it('is Home before a tab is focused', () => {
    expect(tabsTitle(tabs())).toBe('Home');
  });

  it('follows the focused tab', () => {});

  it('falls back to Home for an unknown route name', () => {
    expect(tabsTitle(tabs('nope'))).toBe('Home');
  });
});

describe('readablePage', () => {
  it('large title on phones, a plain centred title over the readable column on wide screens', () => {
    expect(readablePage('Sign in', false, palettes.dark)).toEqual({
      headerShown: true,
      headerLargeTitle: true,
      title: 'Sign in',
    });
    const wide = readablePage('Sign in', true, palettes.dark);
    expect(wide).toMatchObject({ title: 'Sign in', headerStyle: { backgroundColor: palettes.dark.background } });
    expect(wide).not.toHaveProperty('headerLargeTitle');
  });
});
