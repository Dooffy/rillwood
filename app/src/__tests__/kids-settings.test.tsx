// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Storage } from 'expo-sqlite/kv-store';

import * as api from '@/api';
import Account from '@/app/(auth)/account';
import KidsAccount from '@/app/kids-account';
import KidsLibrary from '@/app/kids-library';
import KidsMode from '@/app/kids-mode';
import KidsSetup from '@/app/kids-setup';
import Settings from '@/app/settings';
import { ToastProvider } from '@/components/Toast';
import { forgetKids, getKids, setKids } from '@/kidsSettings';
import { connectionFor, getSession, useSession, type Account as SavedAccount } from '@/session';
import { finishSignIn } from '@/useSignIn';
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
jest.mock('@/session', () => ({ useSession: jest.fn(), getSession: jest.fn(), connectionFor: jest.fn() }));

const { router, useLocalSearchParams } = jest.requireMock<{
  router: { push: jest.Mock; replace: jest.Mock };
  useLocalSearchParams: jest.Mock;
}>('expo-router');

const server = { id: 'srv', url: 'https://jf.example.com', name: 'Home server', version: '12.1.0' };
const anna: SavedAccount = { id: 'srv.a', server, userId: 'a', userName: 'anna', deviceId: 'dev' };
const mia: SavedAccount = { ...anna, id: 'srv.m', userId: 'm', userName: 'mia' };

const withToast = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

function signedIn(active: SavedAccount, others: SavedAccount[] = []) {
  const state = { accounts: [active, ...others], active };
  jest.mocked(useSession).mockReturnValue(state);
  jest.mocked(getSession).mockReturnValue(state);
}

const views = {
  Items: [
    { Id: 'lib-kids', Name: 'Kids', Type: 'CollectionFolder', CollectionType: 'movies' },
    { Id: 'lib-shows', Name: 'Shows', Type: 'CollectionFolder', CollectionType: 'tvshows' },
    { Id: 'lib-music', Name: 'Music', Type: 'CollectionFolder', CollectionType: 'music' },
  ],
  TotalRecordCount: 3,
};
/** What `/Users/Me` says about the user signing in. */
let me: api.UserDto = { Id: 'a', Name: 'anna' };

beforeEach(() => {
  jest.clearAllMocks();
  Storage.clearSync();
  signedIn(anna, [mia]);
  me = { Id: 'a', Name: 'anna' };
  jest.mocked(connectionFor).mockImplementation((a) => ({
    baseUrl: a.server.url,
    deviceId: a.deviceId,
    token: 'tok',
    accountId: a.id,
  }));
  jest
    .spyOn(api, 'request')
    .mockImplementation((_conn, path) => Promise.resolve((path === '/Users/Me' ? me : views) as never));
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

describe('Kids Mode - Library', () => {
  it('the card shows the pick (All libraries) and opens the list', async () => {
    await render(<KidsMode />);
    const row = await screen.findByRole('button', { name: 'Library' });
    expect(row).toHaveAccessibilityValue({ text: 'All libraries' });
    await fireEvent.press(row);
    expect(router.push).toHaveBeenCalledWith('/kids-library');
  });

  it('lists movie and show libraries; one tap picks one, All clears it', async () => {
    await render(<KidsLibrary />);
    await fireEvent.press(await screen.findByRole('radio', { name: 'Kids' }));
    expect(getKids(anna.id).libraries).toEqual(['lib-kids']);
    expect(screen.queryByRole('radio', { name: 'Music' })).toBeNull();
    await fireEvent.press(screen.getByRole('radio', { name: 'All libraries' }));
    expect(getKids(anna.id).libraries).toBeUndefined();
  });

  it('the card names the picked library', async () => {
    setKids(anna.id, { libraries: ['lib-shows'] });
    await render(<KidsMode />);
    expect(await screen.findByRole('button', { name: 'Library' })).toHaveAccessibilityValue({ text: 'Shows' });
  });
});

describe("Who's it for - after sign-in", () => {
  it('a user the server limits: asks', async () => {
    me = { Id: 'a', Name: 'anna', Policy: { MaxParentalRating: 10 } };
    await act(() => finishSignIn());
    expect(router.replace).toHaveBeenCalledWith('/kids-setup');
  });

  it('no limit, or already a kids account: straight to the start screen', async () => {
    await act(() => finishSignIn());
    expect(router.replace).toHaveBeenLastCalledWith('/home');
    me = { Id: 'a', Name: 'anna', Policy: { MaxParentalRating: 10 } };
    setKids(anna.id, { account: true });
    await act(() => finishSignIn());
    expect(router.replace).toHaveBeenLastCalledWith('/kids');
  });

  it("the server can't be asked: no step", async () => {
    jest.mocked(api.request).mockRejectedValue(new api.ApiError('network'));
    await act(() => finishSignIn());
    expect(router.replace).toHaveBeenLastCalledWith('/home');
  });

  it('"A kid" is picked: Continue marks the kids account and opens kids Home', async () => {
    await render(<KidsSetup />);
    expect(screen.getByRole('radio', { name: 'A kid' })).toBeChecked();
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(getKids(anna.id).account).toBe(true);
    expect(router.replace).toHaveBeenCalledWith('/kids');
  });

  it('A grown-up: not marked, the normal Home', async () => {
    await render(<KidsSetup />);
    await fireEvent.press(screen.getByRole('radio', { name: 'A grown-up' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(getKids(anna.id).account).toBe(false);
    expect(router.replace).toHaveBeenCalledWith('/home');
  });
});
