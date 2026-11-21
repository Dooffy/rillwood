// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Storage } from 'expo-sqlite/kv-store';

import Account from '@/app/(auth)/account';
import KidsAccount from '@/app/kids-account';
import KidsMode from '@/app/kids-mode';
import Settings from '@/app/settings';
import { ToastProvider } from '@/components/Toast';
import { forgetKids, getKids, setKids } from '@/kidsSettings';
import { useSession, type Account as SavedAccount } from '@/session';
import { resetDevice, setDevice, TABLET_LANDSCAPE } from '@/testDevice';

jest.mock('expo-router', () => ({
  router: {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canDismiss: jest.fn(() => false),
    dismissAll: jest.fn(),
  },
  useLocalSearchParams: jest.fn(() => ({})),
}));
jest.mock('@/session', () => ({ useSession: jest.fn() }));

const { router, useLocalSearchParams } = jest.requireMock<{
  router: { push: jest.Mock; replace: jest.Mock };
  useLocalSearchParams: jest.Mock;
}>('expo-router');

const server = { id: 'srv', url: 'https://jf.example.com', name: 'Home server', version: '12.1.0' };
const anna: SavedAccount = { id: 'srv.a', server, userId: 'a', userName: 'anna', deviceId: 'dev' };
const mia: SavedAccount = { ...anna, id: 'srv.m', userId: 'm', userName: 'mia' };

const withToast = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

function signedIn(active: SavedAccount, others: SavedAccount[] = []) {
  jest.mocked(useSession).mockReturnValue({ accounts: [active, ...others], active });
}

beforeEach(() => {
  jest.clearAllMocks();
  Storage.clearSync();
  signedIn(anna, [mia]);
});

afterEach(() => {
  forgetKids(anna.id);
  forgetKids(mia.id);
  resetDevice();
});

describe('Settings - the way in', () => {
  it('is a row under the accounts: fox, the age, opens the Kids Mode screen', async () => {
    await withToast(<Settings />);
    expect(screen.getByRole('button', { name: 'Kids Mode' })).toHaveAccessibilityValue({ text: '7+' });
    expect(screen.getByText('🦊', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.queryByRole('radio', { name: '7+' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Kids Mode' }));
    expect(router.push).toHaveBeenCalledWith('/kids-mode');
  });

  it('the screen: picks save for the active account, Start opens kids Home', async () => {
    await render(<KidsMode />);
    expect(screen.getByRole('header', { name: 'Kids Mode' })).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: '7+' })).toBeChecked();
    await fireEvent.press(screen.getByRole('radio', { name: '10+' }));
    await fireEvent(screen.getByLabelText('Show unrated videos'), 'valueChange', true);
    expect(getKids(anna.id)).toMatchObject({ age: 10, unrated: true, shared: false });
    expect(getKids(mia.id).age).toBe(7);
    await fireEvent.press(screen.getByRole('button', { name: 'Start Kids Mode' }));
    expect(getKids(anna.id).shared).toBe(true);
    expect(router.replace).toHaveBeenCalledWith('/kids');
  });

  it('tags a kids account in the list: cat avatar + Kids', async () => {
    setKids(mia.id, { account: true });
    await withToast(<Settings />);
    expect(screen.getByRole('button', { name: 'mia, Kids, Home server' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'anna, Home server' })).toBeOnTheScreen();
    expect(screen.getByText('🐱', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.getByText('A', { includeHiddenElements: true })).toBeOnTheScreen();
  });
});

describe('Settings opened from kids mode', () => {
  it('shared phone: only the card (picks apply at once) - no accounts, About or device-wide settings', async () => {
    setKids(anna.id, { shared: true, age: 3 });
    await withToast(<Settings />);
    expect(screen.getByRole('header', { name: 'Kids Mode is on' })).toBeOnTheScreen();
    expect(screen.queryByRole('header', { name: 'ACCOUNTS' })).toBeNull();
    expect(screen.queryByRole('header', { name: 'ABOUT' })).toBeNull();
    expect(screen.queryByRole('header', { name: 'PLAYBACK' })).toBeNull();
    expect(screen.queryByRole('header', { name: 'DOWNLOADS' })).toBeNull();
    expect(screen.queryByRole('header', { name: 'DISPLAY' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Start Kids Mode' })).toBeNull();
    await fireEvent.press(screen.getByRole('radio', { name: '13+' }));
    expect(getKids(anna.id)).toMatchObject({ age: 13, shared: true });
    // One way out on the card; back to kids mode is the header's back button.
    expect(screen.queryByRole('button', { name: 'Back to Kids Mode' })).toBeNull();
  });

  it('Switch to Adult Mode turns shared off and opens the normal Home', async () => {
    setKids(anna.id, { shared: true });
    await withToast(<Settings />);
    await fireEvent.press(screen.getByRole('button', { name: 'Switch to Adult Mode' }));
    expect(getKids(anna.id).shared).toBe(false);
    expect(router.replace).toHaveBeenCalledWith('/home');
  });

  it('kids account: no picks (the server filters), Switch Account', async () => {
    setKids(anna.id, { account: true });
    await withToast(<Settings />);
    expect(screen.getByRole('header', { name: 'anna is a kids account' })).toBeOnTheScreen();
    expect(screen.queryByRole('radio', { name: '7+' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Switch to Adult Mode' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Switch Account' }));
    expect(router.push).toHaveBeenCalledWith('/accounts');
  });

  it('tablet landscape: no account page beside the list', async () => {
    await setDevice(...TABLET_LANDSCAPE);
    setKids(anna.id, { shared: true });
    await withToast(<Settings />);
    expect(screen.getByRole('header', { name: 'Kids Mode is on' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Remove account' })).toBeNull();
  });
});

describe('Kids account', () => {
  it('the Account page shows it and opens its list', async () => {
    useLocalSearchParams.mockReturnValue({ id: mia.id });
    await withToast(<Account />);
    expect(screen.getByRole('button', { name: 'Kids account' })).toHaveAccessibilityValue({ text: 'Off' });
    await fireEvent.press(screen.getByRole('button', { name: 'Kids account' }));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/kids-account', params: { id: mia.id } });
  });

  it('On for another account marks it, no switch', async () => {
    useLocalSearchParams.mockReturnValue({ id: mia.id });
    await render(<KidsAccount />);
    await fireEvent.press(screen.getByRole('radio', { name: 'On' }));
    expect(getKids(mia.id).account).toBe(true);
    expect(router.replace).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('radio', { name: 'Off' }));
    expect(getKids(mia.id).account).toBe(false);
  });

  it('On for the active account opens kids mode at once', async () => {
    useLocalSearchParams.mockReturnValue({ id: anna.id });
    await render(<KidsAccount />);
    await fireEvent.press(screen.getByRole('radio', { name: 'On' }));
    expect(getKids(anna.id).account).toBe(true);
    expect(router.replace).toHaveBeenCalledWith('/kids');
  });
});
