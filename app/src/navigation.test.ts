// SPDX-License-Identifier: GPL-3.0-or-later
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { renderHook } from '@testing-library/react-native';

import { useSession, type Account } from '@/session';

import { resetTo, useSignedOutRedirect } from './navigation';

jest.mock('expo-router', () => ({
  router: { canDismiss: jest.fn(), dismissAll: jest.fn(), replace: jest.fn() },
}));
jest.mock('@/session', () => ({ useSession: jest.fn() }));

const { router } = jest.requireMock<{
  router: { canDismiss: jest.Mock; dismissAll: jest.Mock; replace: jest.Mock };
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

describe('useSignedOutRedirect', () => {
  it('goes to Welcome when the active account goes away and none is left', async () => {
    signedIn(anna);
    const { rerender } = await renderHook(() => useSignedOutRedirect());
    expect(router.replace).not.toHaveBeenCalled();
    signedIn(null);
    await rerender({});
    expect(router.replace).toHaveBeenCalledWith('/welcome');
  });

  it('goes to the saved accounts when signed-out accounts remain', async () => {
    signedIn(anna);
    const { rerender } = await renderHook(() => useSignedOutRedirect());
    signedIn(null, [{ ...anna, signedOut: true }]);
    await rerender({});
    expect(router.replace).toHaveBeenCalledWith('/accounts');
  });

  it('does nothing when already signed out', async () => {
    signedIn(null);
    const { rerender } = await renderHook(() => useSignedOutRedirect());
    await rerender({});
    expect(router.replace).not.toHaveBeenCalled();
  });
});
