// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { Alert } from 'react-native';

import { ApiError } from '@/api';
import Account from '@/app/(auth)/account';
import Accounts from '@/app/(auth)/accounts';
import Login from '@/app/(auth)/login';
import QuickConnect from '@/app/(auth)/quick-connect';
import Server from '@/app/(auth)/server';
import Welcome from '@/app/(auth)/welcome';
import * as auth from '@/auth';
import { savedServers } from '@/components/AccountList';
import * as downloads from '@/downloads';
import type { Download } from '@/downloads';
import { ToastProvider } from '@/components/Toast';
import {
  addAccount,
  getSession,
  rememberServer,
  removeAccount,
  signOut,
  type Server as JellyfinServer,
} from '@/session';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canDismiss: jest.fn(), dismissAll: jest.fn() },
  useLocalSearchParams: jest.fn(),
  Redirect: jest.fn(() => null),
}));

// Network calls mocked; the session store (kv-store + secure-store mocks) stays real.
jest.mock('@/auth', () => ({
  ...jest.requireActual<typeof import('@/auth')>('@/auth'),
  probeServer: jest.fn(),
  signIn: jest.fn(),
  quickConnectEnabled: jest.fn(),
  quickConnect: jest.fn(),
}));
jest.mock('@/api', () => ({
  ...jest.requireActual<typeof import('@/api')>('@/api'),
  logout: jest.fn(() => Promise.resolve()),
}));

const { router, useLocalSearchParams, Redirect } = jest.requireMock<{
  router: { push: jest.Mock; back: jest.Mock; replace: jest.Mock; canDismiss: jest.Mock; dismissAll: jest.Mock };
  useLocalSearchParams: jest.Mock;
  Redirect: jest.Mock;
}>('expo-router');
const mocked = jest.mocked(auth);

const server: JellyfinServer = { id: 'srv', url: 'https://jf.example.com', name: 'Home server', version: '12.1.0' };
const other: JellyfinServer = { id: 'cab', url: 'http://10.0.0.2:8096', name: 'Cabin', version: '10.11.11' };
const alert = jest.spyOn(Alert, 'alert');

/** Fires the field's submit `times` in one frame without waiting for the (pending) handler. */
async function submitInOneFrame(label: string, times = 2) {
  const field = screen.getByLabelText(label);
  await act(() => {
    for (let i = 0; i < times; i++) void field.props.onSubmitEditing();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  useLocalSearchParams.mockReturnValue({ url: server.url });
  // Servers the user "probed" - Sign in only trusts these (or saved accounts' servers).
  rememberServer(server);
  rememberServer(other);
});

describe('Welcome', () => {
  it('explains Rillwood and starts onboarding at Add server', async () => {
    await render(<Welcome />);
    expect(screen.getByRole('header')).toHaveTextContent(/Your library/);
    expect(screen.getByText(/Works with Jellyfin 10\.10\.7 and newer/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Get started' }));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/server', params: { onboarding: '1' } });
  });
});

describe('Welcome with saved accounts', () => {
  it('has no saved-account option on a fresh install', async () => {
    await render(<Welcome />);
    expect(screen.queryByRole('button', { name: 'Use a saved account' })).toBeNull();
  });

  // Regression: added-but-signed-out users got no way back to their accounts from the Welcome start.
  it('offers the saved accounts when some exist, signed out included', async () => {
    await seed([server, 'anna']);
    await act(() => signOut('srv.anna'));
    await render(<Welcome />);
    await fireEvent.press(screen.getByRole('button', { name: 'Use a saved account' }));
    expect(router.push).toHaveBeenCalledWith('/accounts');
  });
});

describe('Onboarding steps', () => {
  it('shows step 1 with an explanation and where to find the address, without example chips', async () => {
    useLocalSearchParams.mockReturnValue({ onboarding: '1' });
    mocked.probeServer.mockResolvedValue(server);
    await render(<Server />);
    expect(screen.getByLabelText('Step 1 of 2: Server')).toBeOnTheScreen();
    expect(screen.getByText(/plays your own Jellyfin library/)).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Where do I find it?' })).toBeOnTheScreen();
    expect(screen.getByText(/Dashboard - Networking/)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^Use example/ })).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Server address'), 'jf.example.com');
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/login', params: { url: server.url, onboarding: '1' } });
  });

  it('shows step 2 on Sign in and keeps onboarding for Quick Connect', async () => {
    useLocalSearchParams.mockReturnValue({ url: server.url, onboarding: '1' });
    mocked.quickConnectEnabled.mockResolvedValue(true);
    await render(<Login />);
    expect(screen.getByLabelText('Step 2 of 2: Sign in')).toBeOnTheScreen();
    await fireEvent.press(await screen.findByRole('button', { name: 'Use Quick Connect' }));
    expect(screen.getByText(/or use Quick Connect/)).toBeOnTheScreen();
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/quick-connect',
      params: { url: server.url, onboarding: '1' },
    });
  });

  // Regression: the intro pointed to Quick Connect on servers that have it turned off.
  it('does not mention Quick Connect when the server has it off', async () => {
    useLocalSearchParams.mockReturnValue({ url: server.url, onboarding: '1' });
    mocked.quickConnectEnabled.mockResolvedValue(false);
    await render(<Login />);
    expect(screen.getByText('Sign in with your Jellyfin username and password.')).toBeOnTheScreen();
    expect(screen.queryByText(/Quick Connect/)).toBeNull();
  });

  it('gives the same help without the steps when adding a server from Accounts', async () => {
    useLocalSearchParams.mockReturnValue({});
    mocked.probeServer.mockResolvedValue(server);
    await render(<Server />);
    expect(screen.queryByLabelText(/Step 1 of 2/)).toBeNull();
    expect(screen.queryByText(/plays your own Jellyfin library/)).toBeNull();
    expect(screen.getByText(/address you use to open Jellyfin/)).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Where do I find it?' })).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('Server address'), 'jf.example.com');
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/login', params: { url: server.url } });
  });
});

describe('Add server', () => {
  it('clears the error when the address is edited', async () => {
    await render(<Server />);
    await fireEvent.changeText(screen.getByLabelText('Server address'), 'ftp://nope');
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    await fireEvent.changeText(screen.getByLabelText('Server address'), 'jf.example.com');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('rejects an invalid address without probing', async () => {
    await render(<Server />);
    await fireEvent.changeText(screen.getByLabelText('Server address'), 'ftp://nope');
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/Enter an address/);
    expect(mocked.probeServer).not.toHaveBeenCalled();
  });

  // Regression: the error stayed up while the user was already fixing the address.
  it('clears the error when the address is edited', async () => {
    await render(<Server />);
    await fireEvent.changeText(screen.getByLabelText('Server address'), 'ftp://nope');
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    await fireEvent.changeText(screen.getByLabelText('Server address'), 'jf.example.com');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('probes the candidates and opens Sign in with only the address', async () => {
    mocked.probeServer.mockResolvedValue(server);
    await render(<Server />);
    await fireEvent.changeText(screen.getByLabelText('Server address'), 'jf.example.com');
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(mocked.probeServer).toHaveBeenCalledWith(['https://jf.example.com', 'http://jf.example.com']);
    expect(router.push).toHaveBeenCalledWith({ pathname: '/login', params: { url: server.url } });
  });

  it.each([
    [new ApiError('network'), /Couldn't reach the server/],
    [new ApiError('parse'), /doesn't look like a Jellyfin server/],
  ])('shows why the probe failed (%s)', async (error, message) => {
    mocked.probeServer.mockRejectedValue(error);
    await render(<Server />);
    await fireEvent.changeText(screen.getByLabelText('Server address'), 'jf.example.com');
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(router.push).not.toHaveBeenCalled();
  });

  // Regression: a probe finishing after the user left still pushed Sign in.
  it('does not navigate when left during the probe', async () => {
    let resolve!: (s: JellyfinServer) => void;
    mocked.probeServer.mockReturnValue(new Promise((r) => (resolve = r)));
    await render(<Server />);
    await fireEvent.changeText(screen.getByLabelText('Server address'), 'jf.example.com');
    await submitInOneFrame('Server address', 1);
    await screen.unmount();
    await act(async () => resolve(server));
    expect(router.push).not.toHaveBeenCalled();
  });

  it('probes once for a double submit', async () => {
    mocked.probeServer.mockReturnValue(new Promise(() => {}));
    await render(<Server />);
    await fireEvent.changeText(screen.getByLabelText('Server address'), 'jf.example.com');
    await submitInOneFrame('Server address');
    expect(mocked.probeServer).toHaveBeenCalledTimes(1);
  });

  it('locks the whole form while connecting', async () => {
    useLocalSearchParams.mockReturnValue({ onboarding: '1' });
    mocked.probeServer.mockReturnValue(new Promise(() => {}));
    await render(<Server />);
    await fireEvent.changeText(screen.getByLabelText('Server address'), 'jf.example.com');
    await submitInOneFrame('Server address', 1);
    expect(screen.getByLabelText('Server address')).toHaveProp('editable', false);
    expect(screen.getByTestId('page-content')).toHaveProp('pointerEvents', 'none');
  });

  it('disables Continue until an address is entered', async () => {
    await render(<Server />);
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });
});

describe('Sign in', () => {
  beforeEach(() => {
    mocked.quickConnectEnabled.mockResolvedValue(false);
  });

  it('signs in and returns to Home', async () => {
    mocked.signIn.mockResolvedValue();
    await render(<Login />);
    await fireEvent.changeText(screen.getByLabelText('Username'), ' anna ');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'pw');
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    expect(mocked.signIn).toHaveBeenCalledWith(server, 'anna', 'pw');
    expect(router.replace).toHaveBeenCalledWith('/home');
  });

  it('signs in once for a double submit', async () => {
    mocked.signIn.mockReturnValue(new Promise(() => {}));
    await render(<Login />);
    await fireEvent.changeText(screen.getByLabelText('Username'), 'anna');
    await submitInOneFrame('Password');
    expect(mocked.signIn).toHaveBeenCalledTimes(1);
  });

  it.each([
    [new ApiError('http', 401), /Wrong username or password/],
    [new ApiError('network'), /Couldn't reach the server/],
  ])('shows why sign in failed (%s)', async (error, message) => {
    mocked.signIn.mockRejectedValue(error);
    await render(<Login />);
    await fireEvent.changeText(screen.getByLabelText('Username'), 'anna');
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(router.replace).not.toHaveBeenCalled();
  });

  // Regression: "Wrong username or password" stayed up while the user was retyping.
  it.each(['Username', 'Password'])('clears the error when the %s is edited', async (field) => {
    mocked.signIn.mockRejectedValue(new ApiError('http', 401));
    await render(<Login />);
    await fireEvent.changeText(screen.getByLabelText('Username'), 'anna');
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByRole('alert');
    await fireEvent.changeText(screen.getByLabelText(field), 'x');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('locks the whole form while signing in', async () => {
    mocked.signIn.mockReturnValue(new Promise(() => {}));
    await render(<Login />);
    await fireEvent.changeText(screen.getByLabelText('Username'), 'anna');
    await submitInOneFrame('Password', 1);
    expect(screen.getByLabelText('Username')).toHaveProp('editable', false);
    expect(screen.getByLabelText('Password')).toHaveProp('editable', false);
    await fireEvent.press(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByLabelText('Password')).toHaveProp('secureTextEntry', true);
  });

  it('prefills the username when signing an account back in', async () => {
    useLocalSearchParams.mockReturnValue({ url: server.url, userName: 'anna' });
    await render(<Login />);
    expect(screen.getByLabelText('Username')).toHaveDisplayValue('anna');
  });

  // Deep links can carry any url; only servers the user probed or has an account on are trusted.
  it('goes back to Add server for an unknown address', async () => {
    useLocalSearchParams.mockReturnValue({ url: 'https://evil.example' });
    await render(<Login />);
    expect(Redirect).toHaveBeenCalledWith({ href: '/server' }, undefined);
    expect(mocked.quickConnectEnabled).not.toHaveBeenCalled();
  });

  it('shows Quick Connect only when the server enables it', async () => {
    mocked.quickConnectEnabled.mockResolvedValue(true);
    await render(<Login />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Use Quick Connect' }));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/quick-connect', params: { url: server.url } });
  });

  it('hides Quick Connect when the server disables it', async () => {
    await render(<Login />);
    expect(mocked.quickConnectEnabled).toHaveBeenCalledWith(server, expect.any(AbortSignal));
    expect(screen.queryByRole('button', { name: 'Use Quick Connect' })).toBeNull();
  });

  it('warns below the minimum server version', async () => {
    rememberServer({ ...server, version: '10.9.11' });
    await render(<Login />);
    expect(screen.getByText(/runs Jellyfin 10\.9\.11/)).toBeOnTheScreen();
  });

  it('shows the server name and address', async () => {
    await render(<Login />);
    expect(screen.getByText('Home server')).toBeOnTheScreen();
    expect(screen.getByText('https://jf.example.com')).toBeOnTheScreen();
    expect(screen.queryByText(/runs Jellyfin/)).toBeNull();
  });
});

describe('Quick Connect', () => {
  /** Controls the mocked flow: show a code, then finish or fail. */
  function flow() {
    let finish!: () => void;
    let fail!: (e: unknown) => void;
    let signal!: AbortSignal;
    mocked.quickConnect.mockImplementation((_s, options) => {
      signal = options.signal;
      options.onCode('123456');
      return new Promise<void>((resolve, reject) => {
        finish = resolve;
        fail = reject;
      });
    });
    return {
      finish: () => act(async () => finish()),
      fail: (e: unknown) => act(async () => fail(e)),
      signal: () => signal,
    };
  }

  it('shows the code and returns to Home once approved', async () => {
    const qc = flow();
    await render(<QuickConnect />);
    expect(screen.getByText('123456')).toBeOnTheScreen();
    expect(screen.getByText('Waiting for approval')).toBeOnTheScreen();
    expect(mocked.quickConnect).toHaveBeenCalledWith(
      server,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    await qc.finish();
    expect(router.replace).toHaveBeenCalledWith('/home');
  });

  // Regression: closing during the final exchange still signed the user in.
  it('aborts the flow when closed', async () => {
    const qc = flow();
    await render(<QuickConnect />);
    expect(qc.signal().aborted).toBe(false);
    await screen.unmount();
    expect(qc.signal().aborted).toBe(true);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('shows an error and retries', async () => {
    const qc = flow();
    await render(<QuickConnect />);
    await qc.fail(new ApiError('http', 401));
    expect(screen.getByRole('alert')).toHaveTextContent(/turned off/);
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    expect(mocked.quickConnect).toHaveBeenCalledTimes(2);
    expect(screen.getByText('123456')).toBeOnTheScreen();
  });

  it('Cancel goes back', async () => {
    flow();
    await render(<QuickConnect />);
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(router.back).toHaveBeenCalledTimes(1);
  });
});

// Account screens run on the real session store.
async function seed(...users: [JellyfinServer, string][]) {
  for (const [s, u] of users) {
    await act(() => addAccount(s, { User: { Id: u, Name: u }, AccessToken: `tok-${u}`, ServerId: s.id }, `dev-${u}`));
  }
}

function alertButtons() {
  return alert.mock.calls[0][2]!;
}

function pressAlertButton(text: string) {
  return act(() => alertButtons().find((b) => b.text === text)!.onPress!());
}

afterEach(async () => {
  await act(() => getSession().accounts.forEach((a) => removeAccount(a.id)));
});

/** Account screens use the toast (switching says so). */
const withToast = (ui: ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

describe('Accounts list', () => {
  beforeEach(() => seed([server, 'anna'], [server, 'ben'], [other, 'anna']));

  it('lists every account with its server and checks the active one', async () => {
    await withToast(<Accounts />);
    expect(screen.getByRole('button', { name: 'anna, Home server' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'ben, Home server' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'anna, Cabin' })).toHaveAccessibilityValue({ text: 'Active' });
    expect(screen.getByRole('button', { name: 'anna, Home server' })).not.toHaveAccessibilityValue({ text: 'Active' });
  });

  it('switches with one tap and lands on the new Home', async () => {
    await withToast(<Accounts />);
    await fireEvent.press(screen.getByRole('button', { name: 'ben, Home server' }));
    expect(alert).not.toHaveBeenCalled();
    expect(getSession().active?.id).toBe('srv.ben');
    expect(router.replace).toHaveBeenCalledWith('/home');
    expect(screen.getByText('Switched to ben')).toBeOnTheScreen();
  });

  it('opens the details of the active account on tap, any account from its info button', async () => {
    await withToast(<Accounts />);
    await fireEvent.press(screen.getByRole('button', { name: 'anna, Cabin' }));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/account', params: { id: 'cab.anna' } });
    await fireEvent.press(screen.getByRole('button', { name: 'ben on Home server, details' }));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/account', params: { id: 'srv.ben' } });
    expect(getSession().active?.id).toBe('cab.anna');
  });

  it('signs a signed-out account back in with its server and username', async () => {
    await act(() => signOut('srv.ben'));
    await withToast(<Accounts />);
    const ben = screen.getByRole('button', { name: 'ben, Home server' });
    expect(ben).toHaveAccessibilityValue({ text: 'Signed out' });
    expect(within(ben).getByText('Sign in')).toBeOnTheScreen();
    await fireEvent.press(ben);
    expect(router.push).toHaveBeenCalledWith({ pathname: '/login', params: { url: server.url, userName: 'ben' } });
  });

  it('adds an account on a saved server or a new one', async () => {
    await withToast(<Accounts />);
    await fireEvent.press(screen.getByRole('button', { name: 'Add account' }));
    // One entry per server, not per account.
    expect(screen.getAllByRole('menuitem')).toHaveLength(3);
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Cabin, 10.0.0.2:8096' }));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/login', params: { url: other.url } });
    await fireEvent.press(screen.getByRole('button', { name: 'Add account' }));
    await fireEvent.press(screen.getByRole('menuitem', { name: 'New server' }));
    expect(router.push).toHaveBeenCalledWith('/server');
  });
});

describe('Accounts list, none saved', () => {
  it('says so and goes straight to Add server', async () => {
    await withToast(<Accounts />);
    expect(screen.getByText('No saved accounts. Add one to sign in.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Add account' }));
    expect(screen.queryByRole('menuitem')).toBeNull();
    expect(router.push).toHaveBeenCalledWith('/server');
  });
});

describe('savedServers', () => {
  it('lists each server once', async () => {
    await seed([server, 'anna'], [other, 'anna'], [server, 'ben']);
    expect(savedServers(getSession().accounts).map((s) => s.id)).toEqual(['srv', 'cab']);
  });
});

describe('Account', () => {
  const showing = (id?: string) => useLocalSearchParams.mockReturnValue(id ? { id } : {});

  it('shows the active user and server details by default', async () => {
    await seed([server, 'anna']);
    showing();
    await withToast(<Account />);
    expect(screen.getByRole('header', { name: 'anna' })).toBeOnTheScreen();
    expect(screen.getByText('Active on Home server')).toBeOnTheScreen();
    expect(screen.getByText('https://jf.example.com')).toBeOnTheScreen();
    expect(screen.getByText('12.1.0')).toBeOnTheScreen();
    // Already active: nothing to switch to.
    expect(screen.queryByRole('button', { name: 'Switch to this account' })).toBeNull();
  });

  it('switches to another account', async () => {
    await seed([server, 'anna'], [server, 'ben']);
    showing('srv.anna');
    await withToast(<Account />);
    expect(screen.getByText('Signed in on Home server')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Switch to this account' }));
    expect(getSession().active?.id).toBe('srv.anna');
    expect(router.replace).toHaveBeenCalledWith('/home');
  });

  it('signs out the active account and hands over to the next signed-in one', async () => {
    await seed([server, 'anna'], [server, 'ben']);
    showing('srv.ben');
    await withToast(<Account />);
    await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    expect(getSession().active?.id).toBe('srv.anna');
    expect(getSession().accounts.find((a) => a.id === 'srv.ben')?.signedOut).toBe(true);
    // As a switch from the list: the new account's Home, the old account's screens gone.
    expect(router.replace).toHaveBeenCalledWith('/home');
    expect(router.back).not.toHaveBeenCalled();
    expect(screen.getByText('Switched to anna')).toBeOnTheScreen();
  });

  it('signs out the last account and leaves navigation to the signed-out redirect', async () => {
    await seed([server, 'anna']);
    showing();
    await withToast(<Account />);
    await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    expect(getSession().active).toBeNull();
    expect(getSession().accounts[0].signedOut).toBe(true);
    expect(router.back).not.toHaveBeenCalled();
  });

  it('signs out another account and stays on it', async () => {
    await seed([server, 'anna'], [server, 'ben']);
    showing('srv.anna');
    await withToast(<Account />);
    await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    expect(getSession().active?.id).toBe('srv.ben');
    expect(router.back).not.toHaveBeenCalled();
    expect(screen.getByText('Signed out of Home server')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/login', params: { url: server.url, userName: 'anna' } });
  });

  it("removes the active account after confirming and lands on the next account's Home", async () => {
    await seed([other, 'ben'], [server, 'anna']);
    showing();
    await withToast(<Account />);
    await fireEvent.press(screen.getByRole('button', { name: 'Remove account' }));
    expect(alert).toHaveBeenCalledWith('Remove anna?', expect.any(String), expect.any(Array));
    await pressAlertButton('Remove');
    expect(getSession().active?.id).toBe('cab.ben');
    expect(router.replace).toHaveBeenCalledWith('/home');
  });

  it('leaves navigation to the signed-out redirect when no other account is signed in', async () => {
    await seed([other, 'ben'], [server, 'anna']);
    await act(() => signOut('cab.ben'));
    showing();
    await withToast(<Account />);
    await fireEvent.press(screen.getByRole('button', { name: 'Remove account' }));
    await pressAlertButton('Remove');
    expect(router.back).not.toHaveBeenCalled();
    expect(screen.queryByRole('header')).toBeNull();
  });

  // Signed out already (saved accounts from Welcome): no redirect will come, so back to the list.
  it('goes back after removing a saved account while signed out', async () => {
    await seed([server, 'anna']);
    await act(() => signOut('srv.anna'));
    showing('srv.anna');
    await withToast(<Account />);
    await fireEvent.press(screen.getByRole('button', { name: 'Remove account' }));
    await pressAlertButton('Remove');
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  describe('with downloads', () => {
    const saved = (accountId: string, n: number): Download => ({
      id: `${accountId}:m${n}:m${n}`,
      accountId,
      itemId: `m${n}`,
      sourceId: `m${n}`,
      title: `Movie ${n}`,
      path: `downloads/${n}.mkv`,
      status: 'done',
      bytes: 2e9,
      total: 2e9,
      createdAt: 0,
      pinned: false,
    });
    let list: jest.SpiedFunction<typeof downloads.accountDownloads>;
    let remove: jest.SpiedFunction<typeof downloads.deleteAccountDownloads>;
    beforeEach(() => {
      list = jest
        .spyOn(downloads, 'accountDownloads')
        .mockImplementation((id) =>
          [
            saved('srv.anna', 1),
            saved('srv.anna', 2),
            { ...saved('srv.ben', 3), status: 'paused' as const, bytes: 5e8 },
          ].filter((d) => d.accountId === id),
        );
      remove = jest.spyOn(downloads, 'deleteAccountDownloads').mockImplementation(() => {});
    });
    afterEach(() => {
      list.mockRestore();
      remove.mockRestore();
    });

    it("asks before signing out and deletes only the account's downloads", async () => {
      await seed([server, 'anna'], [server, 'ben']);
      showing('srv.anna');
      await withToast(<Account />);
      await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
      expect(alert).toHaveBeenCalledWith(
        'Sign out of anna?',
        'Its 2 downloads (4 GB) will be deleted from this phone.',
        expect.any(Array),
      );
      // Not before the answer.
      expect(getSession().accounts.find((a) => a.id === 'srv.anna')?.signedOut).toBeFalsy();
      await pressAlertButton('Sign Out');
      expect(remove).toHaveBeenCalledWith('srv.anna');
      expect(getSession().accounts.find((a) => a.id === 'srv.anna')?.signedOut).toBe(true);
    });

    it('keeps the account and its downloads on Cancel', async () => {
      await seed([server, 'anna'], [server, 'ben']);
      showing('srv.anna');
      await withToast(<Account />);
      await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
      // Cancel only dismisses (no handler).
      expect(alertButtons().find((b) => b.text === 'Cancel')).toEqual({ text: 'Cancel', style: 'cancel' });
      expect(remove).not.toHaveBeenCalled();
      expect(getSession().accounts.find((a) => a.id === 'srv.anna')?.signedOut).toBeFalsy();
    });

    // A paused one counts the bytes it has so far.
    it('says the downloads go when removing and deletes them', async () => {
      await seed([server, 'anna'], [server, 'ben']);
      showing('srv.ben');
      await withToast(<Account />);
      await fireEvent.press(screen.getByRole('button', { name: 'Remove account' }));
      expect(alert).toHaveBeenCalledWith(
        'Remove ben?',
        "You'll need to sign in again to use Home server with this account. Its download (500 MB) will be deleted from this phone.",
        expect.any(Array),
      );
      await pressAlertButton('Remove');
      expect(remove).toHaveBeenCalledWith('srv.ben');
      expect(getSession().accounts.map((a) => a.id)).toEqual(['srv.anna']);
    });
  });

  it('offers a no-op Cancel', async () => {
    await seed([server, 'anna']);
    showing();
    await withToast(<Account />);
    await fireEvent.press(screen.getByRole('button', { name: 'Remove account' }));
    expect(alertButtons().find((b) => b.text === 'Cancel')).toEqual({ text: 'Cancel', style: 'cancel' });
    expect(screen.getByRole('header', { name: 'anna' })).toBeOnTheScreen();
  });
});
