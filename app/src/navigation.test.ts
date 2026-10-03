// SPDX-License-Identifier: GPL-3.0-or-later
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { renderHook } from '@testing-library/react-native';

import { useAccounts, type Account } from '@/auth';

import { resetTo, useSignedOutRedirect } from './navigation';

jest.mock('expo-router', () => ({
  router: { canDismiss: jest.fn(), dismissAll: jest.fn(), replace: jest.fn() },
}));
jest.mock('@/auth', () => ({ useAccounts: jest.fn() }));

const { router } = jest.requireMock<{
  router: { canDismiss: jest.Mock; dismissAll: jest.Mock; replace: jest.Mock };
}>('expo-router');

const anna: Account = {
  id: 'a',
  server: { url: 'https://jf.example.com', name: 'Home server', version: '12.1.0' },
  userName: 'anna',
};

function signedIn(active: Account | null) {
  jest.mocked(useAccounts).mockReturnValue({ accounts: active ? [active] : [], activeId: active?.id ?? null, active });
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
  it('goes to Add server when the active account goes away', async () => {
    signedIn(anna);
    const { rerender } = await renderHook(() => useSignedOutRedirect());
    expect(router.replace).not.toHaveBeenCalled();
    signedIn(null);
    await rerender({});
    expect(router.replace).toHaveBeenCalledWith('/server');
  });

  it('does nothing when already signed out', async () => {
    signedIn(null);
    const { rerender } = await renderHook(() => useSignedOutRedirect());
    await rerender({});
    expect(router.replace).not.toHaveBeenCalled();
  });
});
