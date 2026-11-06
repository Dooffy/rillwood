// SPDX-License-Identifier: GPL-3.0-or-later
// Apple TV Sign in (screen draft 02): Quick Connect first, password as the fallback, expired codes renewed.
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ApiError } from '@/api';
import * as auth from '@/auth';
import { TvSignIn } from '@/components/TvSignIn';
import type { Server } from '@/session';

jest.mock('expo-router', () => ({ router: { back: jest.fn(), replace: jest.fn(), dismissAll: jest.fn() } }));
jest.mock('@/navigation', () => ({ resetTo: jest.fn() }));
jest.mock('@/auth', () => ({
  ...jest.requireActual<typeof import('@/auth')>('@/auth'),
  signIn: jest.fn(),
  quickConnectEnabled: jest.fn(),
  quickConnect: jest.fn(),
}));

const { router } = jest.requireMock<{ router: { back: jest.Mock } }>('expo-router');
const { resetTo } = jest.requireMock<{ resetTo: jest.Mock }>('@/navigation');
const mocked = jest.mocked(auth);
const server: Server = { id: 'srv', url: 'https://jf.example.com', name: 'Home server', version: '12.1.0' };

type Options = Parameters<typeof auth.quickConnect>[1];
/** Quick Connect calls; each shows `code` and stays pending until settled by the test. */
function quickConnectCalls(code = '482913') {
  const calls: { options: Options; resolve: () => void; reject: (e: unknown) => void }[] = [];
  mocked.quickConnect.mockImplementation(
    (_s, options) =>
      new Promise<void>((resolve, reject) => {
        options.onCode(code);
        calls.push({ options, resolve, reject });
      }),
  );
  return calls;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('TvSignIn', () => {
  it('shows the Quick Connect code first and goes Home once approved', async () => {
    mocked.quickConnectEnabled.mockResolvedValue(true);
    const calls = quickConnectCalls();
    await render(<TvSignIn server={server} />);
    expect(await screen.findByText('482913')).toBeOnTheScreen();
    expect(screen.getByText('Home server · 12.1.0 · jf.example.com')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Use Password' })).toBeOnTheScreen();
    await act(async () => calls[0].resolve());
    expect(resetTo).toHaveBeenCalledWith('/home');
  });

  it('asks for a new code when the old one expires, without an error', async () => {
    mocked.quickConnectEnabled.mockResolvedValue(true);
    const calls = quickConnectCalls();
    await render(<TvSignIn server={server} />);
    await screen.findByText('482913');
    await act(async () => calls[0].reject(new ApiError('http', 404)));
    expect(calls).toHaveLength(2);
    expect(calls[0].options.signal.aborted).toBe(true);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows why Quick Connect failed and tries again', async () => {
    mocked.quickConnectEnabled.mockResolvedValue(true);
    const calls = quickConnectCalls();
    await render(<TvSignIn server={server} />);
    await screen.findByText('482913');
    await act(async () => calls[0].reject(new ApiError('network')));
    expect(screen.getByRole('alert')).toHaveTextContent(/Couldn't reach the server/);
    await fireEvent.press(screen.getByRole('button', { name: 'Try Again' }));
    expect(calls).toHaveLength(2);
  });

  it('switches to the password form, stops Quick Connect, and signs in', async () => {
    mocked.quickConnectEnabled.mockResolvedValue(true);
    const calls = quickConnectCalls();
    mocked.signIn.mockResolvedValue();
    await render(<TvSignIn server={server} initialUserName="anna" />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Use Password' }));
    expect(calls[0].options.signal.aborted).toBe(true);
    expect(screen.getByLabelText('Username').props.value).toBe('anna');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'secret');
    await fireEvent.press(screen.getByRole('button', { name: 'Sign In' }));
    expect(mocked.signIn).toHaveBeenCalledWith(server, 'anna', 'secret');
    expect(resetTo).toHaveBeenCalledWith('/home');
    expect(screen.getByRole('button', { name: 'Use Quick Connect' })).toBeOnTheScreen();
  });

  it('shows a wrong password under the field', async () => {
    mocked.quickConnectEnabled.mockResolvedValue(false);
    mocked.signIn.mockRejectedValue(new ApiError('http', 401));
    await render(<TvSignIn server={server} />);
    await fireEvent.changeText(await screen.findByLabelText('Username'), 'anna');
    await fireEvent.press(screen.getByRole('button', { name: 'Sign In' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong username or password.');
    expect(resetTo).not.toHaveBeenCalled();
  });

  it('says the username is missing on Sign In with an empty form', async () => {
    mocked.quickConnectEnabled.mockResolvedValue(false);
    await render(<TvSignIn server={server} />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Sign In' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter your username.');
    expect(mocked.signIn).not.toHaveBeenCalled();
  });

  it('has only the password form when the server has Quick Connect off', async () => {
    mocked.quickConnectEnabled.mockResolvedValue(false);
    await render(<TvSignIn server={server} />);
    expect(await screen.findByLabelText('Username')).toBeOnTheScreen();
    expect(mocked.quickConnect).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /Quick Connect|Use Password/ })).toBeNull();
  });

  it('Change Server goes back', async () => {
    mocked.quickConnectEnabled.mockResolvedValue(false);
    await render(<TvSignIn server={server} />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Change Server' }));
    expect(router.back).toHaveBeenCalled();
  });
});
