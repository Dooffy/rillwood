// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { Alert } from 'react-native';

import Account from '@/app/(auth)/account';
import Accounts from '@/app/(auth)/accounts';
import Login from '@/app/(auth)/login';
import QuickConnect from '@/app/(auth)/quick-connect';
import Server from '@/app/(auth)/server';
import * as auth from '@/auth';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canDismiss: jest.fn(), dismissAll: jest.fn() },
  useLocalSearchParams: jest.fn(),
  Redirect: jest.fn(() => null),
}));

// Network stubs mocked; the in-memory accounts store stays real.
jest.mock('@/auth', () => ({
  ...jest.requireActual<typeof import('@/auth')>('@/auth'),
  probeServer: jest.fn(),
  signIn: jest.fn(),
  quickConnectEnabled: jest.fn(),
  initiateQuickConnect: jest.fn(),
  checkQuickConnect: jest.fn(),
  finishQuickConnect: jest.fn(),
}));

const { router, useLocalSearchParams } = jest.requireMock<{
  router: { push: jest.Mock; back: jest.Mock; replace: jest.Mock; canDismiss: jest.Mock; dismissAll: jest.Mock };
  useLocalSearchParams: jest.Mock;
}>('expo-router');
const mocked = jest.mocked(auth);

const server: auth.Server = { url: 'https://jf.example.com', name: 'Home server', version: '12.1.0' };

/** Fires the field's submit `times` in one frame without waiting for the (pending) handler. */
async function submitInOneFrame(label: string, times = 2) {
  const field = screen.getByLabelText(label);
  await act(() => {
    for (let i = 0; i < times; i++) void field.props.onSubmitEditing();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  useLocalSearchParams.mockReturnValue(server);
});

describe('Add server', () => {
  it('rejects an invalid address without probing', async () => {
    await render(<Server />);
    await fireEvent.changeText(screen.getByLabelText('Server address'), 'ftp://nope');
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/Enter an address/);
    expect(mocked.probeServer).not.toHaveBeenCalled();
  });

  it('probes the candidates and opens Sign in with the server', async () => {
    mocked.probeServer.mockResolvedValue(server);
    await render(<Server />);
    await fireEvent.changeText(screen.getByLabelText('Server address'), 'jf.example.com');
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(mocked.probeServer).toHaveBeenCalledWith(['https://jf.example.com', 'http://jf.example.com']);
    expect(router.push).toHaveBeenCalledWith({ pathname: '/login', params: server });
  });

  it('shows an error when no server answers', async () => {
    mocked.probeServer.mockRejectedValue(new Error('offline'));
    await render(<Server />);
    await fireEvent.changeText(screen.getByLabelText('Server address'), 'jf.example.com');
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Couldn't reach/);
    expect(router.push).not.toHaveBeenCalled();
  });

  // Regression: a probe finishing after the user left still pushed Sign in.
  it('does not navigate when left during the probe', async () => {
    let resolve!: (s: auth.Server) => void;
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

  it('disables Continue until an address is entered', async () => {
    await render(<Server />);
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });
});

describe('Sign in', () => {
  it('signs in and returns to Home', async () => {
    mocked.quickConnectEnabled.mockResolvedValue(false);
    mocked.signIn.mockResolvedValue();
    await render(<Login />);
    await fireEvent.changeText(screen.getByLabelText('Username'), ' anna ');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'pw');
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    expect(mocked.signIn).toHaveBeenCalledWith(server, 'anna', 'pw');
    expect(router.replace).toHaveBeenCalledWith('/home');
  });

  it('signs in once for a double submit', async () => {
    mocked.quickConnectEnabled.mockResolvedValue(false);
    mocked.signIn.mockReturnValue(new Promise(() => {}));
    await render(<Login />);
    await fireEvent.changeText(screen.getByLabelText('Username'), 'anna');
    await submitInOneFrame('Password');
    expect(mocked.signIn).toHaveBeenCalledTimes(1);
  });

  it('shows an error when sign in fails', async () => {
    mocked.quickConnectEnabled.mockResolvedValue(false);
    mocked.signIn.mockRejectedValue(new Error('401'));
    await render(<Login />);
    await fireEvent.changeText(screen.getByLabelText('Username'), 'anna');
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Couldn't sign in/);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('shows Quick Connect only when the server enables it', async () => {
    mocked.quickConnectEnabled.mockResolvedValue(true);
    await render(<Login />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Use Quick Connect' }));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/quick-connect', params: server });
  });

  it('hides Quick Connect when the server disables it', async () => {
    mocked.quickConnectEnabled.mockResolvedValue(false);
    await render(<Login />);
    expect(mocked.quickConnectEnabled).toHaveBeenCalledWith(server);
    expect(screen.queryByRole('button', { name: 'Use Quick Connect' })).toBeNull();
  });

  it('warns below the minimum server version', async () => {
    mocked.quickConnectEnabled.mockResolvedValue(false);
    useLocalSearchParams.mockReturnValue({ ...server, version: '10.9.11' });
    await render(<Login />);
    expect(screen.getByText(/runs Jellyfin 10\.9\.11/)).toBeOnTheScreen();
  });

  it('shows the server name and address', async () => {
    mocked.quickConnectEnabled.mockResolvedValue(false);
    await render(<Login />);
    expect(screen.getByText('Home server')).toBeOnTheScreen();
    expect(screen.getByText('https://jf.example.com')).toBeOnTheScreen();
    expect(screen.queryByText(/runs Jellyfin/)).toBeNull();
  });
});

describe('Quick Connect', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows the code, polls until approved, then returns to Home', async () => {
    mocked.initiateQuickConnect.mockResolvedValue({ code: '123456', secret: 's' });
    mocked.checkQuickConnect.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    mocked.finishQuickConnect.mockResolvedValue();
    await render(<QuickConnect />);
    expect(await screen.findByText('123456')).toBeOnTheScreen();
    expect(screen.getByText('Waiting for approval')).toBeOnTheScreen();

    await act(() => jest.advanceTimersByTimeAsync(auth.QUICK_CONNECT_POLL_MS));
    expect(mocked.checkQuickConnect).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();

    await act(() => jest.advanceTimersByTimeAsync(auth.QUICK_CONNECT_POLL_MS));
    expect(mocked.checkQuickConnect).toHaveBeenCalledTimes(2);
    expect(mocked.finishQuickConnect).toHaveBeenCalledWith(server, 's', expect.any(AbortSignal));
    expect(router.replace).toHaveBeenCalledWith('/home');
  });

  it('stops polling when closed', async () => {
    mocked.initiateQuickConnect.mockResolvedValue({ code: '123456', secret: 's' });
    await render(<QuickConnect />);
    await screen.findByText('123456');
    await screen.unmount();
    await act(() => jest.advanceTimersByTimeAsync(auth.QUICK_CONNECT_POLL_MS * 3));
    expect(mocked.checkQuickConnect).not.toHaveBeenCalled();
  });

  it('shows an error and retries', async () => {
    mocked.initiateQuickConnect.mockRejectedValueOnce(new Error('disabled'));
    mocked.initiateQuickConnect.mockResolvedValueOnce({ code: '654321', secret: 's' });
    await render(<QuickConnect />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/Quick Connect failed/);
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('654321')).toBeOnTheScreen();
  });

  // Regression: closing during the final exchange still signed the user in.
  it('aborts the final exchange when closed', async () => {
    mocked.initiateQuickConnect.mockResolvedValue({ code: '123456', secret: 's' });
    mocked.checkQuickConnect.mockResolvedValue(true);
    let finishSignal: AbortSignal | undefined;
    mocked.finishQuickConnect.mockImplementation((_s, _secret, signal) => {
      finishSignal = signal;
      return new Promise(() => {});
    });
    await render(<QuickConnect />);
    await screen.findByText('123456');
    await act(() => jest.advanceTimersByTimeAsync(auth.QUICK_CONNECT_POLL_MS));
    expect(finishSignal?.aborted).toBe(false);
    await screen.unmount();
    expect(finishSignal?.aborted).toBe(true);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('Cancel goes back', async () => {
    mocked.initiateQuickConnect.mockResolvedValue({ code: '123456', secret: 's' });
    await render(<QuickConnect />);
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(router.back).toHaveBeenCalledTimes(1);
  });
});

// Account screens run on the real in-memory store, seeded through the real (stubbed) signIn.
const actual = jest.requireActual<typeof import('@/auth')>('@/auth');
const other: auth.Server = { url: 'http://10.0.0.2:8096', name: 'Cabin', version: '10.11.11' };
const alert = jest.spyOn(Alert, 'alert');

async function seed(...users: [auth.Server, string][]) {
  jest.useFakeTimers();
  const done = Promise.all(users.map(([s, u]) => actual.signIn(s, u, '')));
  await jest.runAllTimersAsync();
  await done;
  jest.useRealTimers();
}

function alertButtons() {
  return alert.mock.calls[0][2]!;
}

function pressAlertButton(text: string) {
  return act(() => alertButtons().find((b) => b.text === text)!.onPress!());
}

afterEach(async () => {
  await act(() => actual.getAccounts().accounts.forEach((a) => actual.removeAccount(a.id)));
});

describe('Accounts', () => {
  beforeEach(() => seed([server, 'anna'], [server, 'ben'], [other, 'anna']));

  it('groups accounts by server and marks the active one', async () => {
    await render(<Accounts />);
    expect(screen.getByRole('header', { name: 'HOME SERVER' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'CABIN' })).toBeOnTheScreen();
    expect(screen.getAllByText('Active')).toHaveLength(1);
    const [homeAnna, cabinAnna] = screen.getAllByRole('button', { name: 'anna' });
    expect(within(homeAnna).queryByText('Active')).toBeNull();
    expect(within(cabinAnna).getByText('Active')).toBeOnTheScreen();
  });

  it('switches to an account', async () => {
    await render(<Accounts />);
    await fireEvent.press(screen.getByRole('button', { name: 'ben' }));
    await pressAlertButton('Switch to this account');
    expect(within(screen.getByRole('button', { name: 'ben' })).getByText('Active')).toBeOnTheScreen();
    expect(screen.getAllByText('Active')).toHaveLength(1);
  });

  it('removes an account', async () => {
    await render(<Accounts />);
    await fireEvent.press(screen.getByRole('button', { name: 'ben' }));
    await pressAlertButton('Remove account');
    expect(screen.queryByRole('button', { name: 'ben' })).toBeNull();
  });

  it('adds another user on an existing server', async () => {
    await render(<Accounts />);
    const [, cabinAddUser] = screen.getAllByRole('button', { name: 'Add user' });
    await fireEvent.press(cabinAddUser);
    expect(router.push).toHaveBeenCalledWith({ pathname: '/login', params: other });
  });

  it('opens Add server', async () => {
    await render(<Accounts />);
    await fireEvent.press(screen.getByRole('button', { name: 'Add server' }));
    expect(router.push).toHaveBeenCalledWith('/server');
  });
});

describe('Account', () => {
  it('shows the active user and server details', async () => {
    await seed([server, 'anna']);
    await render(<Account />);
    expect(screen.getByText('anna')).toBeOnTheScreen();
    expect(screen.getByText('Home server')).toBeOnTheScreen();
    expect(screen.getByText('https://jf.example.com')).toBeOnTheScreen();
    expect(screen.getByText('12.1.0')).toBeOnTheScreen();
  });

  it('opens Switch user', async () => {
    await seed([server, 'anna']);
    await render(<Account />);
    await fireEvent.press(screen.getByRole('button', { name: 'Switch user' }));
    expect(router.push).toHaveBeenCalledWith('/accounts');
  });

  it('removes the account after confirming and goes back when others remain', async () => {
    await seed([other, 'ben'], [server, 'anna']);
    await render(<Account />);
    await fireEvent.press(screen.getByRole('button', { name: 'Remove account' }));
    expect(alert).toHaveBeenCalledWith('Remove anna?', expect.any(String), expect.any(Array));
    await pressAlertButton('Remove');
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(screen.getByText('ben')).toBeOnTheScreen();
  });

  it('leaves navigation to the signed-out redirect when removing the last account', async () => {
    await seed([server, 'anna']);
    await render(<Account />);
    await fireEvent.press(screen.getByRole('button', { name: 'Remove account' }));
    await pressAlertButton('Remove');
    expect(router.back).not.toHaveBeenCalled();
    expect(screen.toJSON()).toBeNull();
  });

  it('offers a no-op Cancel', async () => {
    await seed([server, 'anna']);
    await render(<Account />);
    await fireEvent.press(screen.getByRole('button', { name: 'Remove account' }));
    expect(alertButtons().find((b) => b.text === 'Cancel')).toEqual({ text: 'Cancel', style: 'cancel' });
    expect(screen.getByText('anna')).toBeOnTheScreen();
  });
});
