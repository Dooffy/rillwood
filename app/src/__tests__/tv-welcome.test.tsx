// SPDX-License-Identifier: GPL-3.0-or-later
// Apple TV Welcome (screen draft 01): the address is asked for on the first screen, then Sign in.
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { ApiError } from '@/api';
import Welcome from '@/app/(auth)/welcome';
import * as auth from '@/auth';
import { TvWelcome } from '@/screens/welcome/TvWelcome';
import { addAccount, getSession, removeAccount, signOut, type Server as JellyfinServer } from '@/session';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/auth', () => ({
  ...jest.requireActual<typeof import('@/auth')>('@/auth'),
  probeServer: jest.fn(),
}));

const { router } = jest.requireMock<{ router: { push: jest.Mock } }>('expo-router');
const probeServer = jest.mocked(auth.probeServer);
const server: JellyfinServer = { id: 'srv', url: 'https://jf.example.com', name: 'Home server', version: '12.1.0' };

beforeEach(() => {
  jest.clearAllMocks();
});
afterEach(async () => {
  for (const a of getSession().accounts) await act(() => removeAccount(a.id));
});

describe('Welcome on Apple TV', () => {
  it('is the TV screen with the address field', async () => {
    const isTV = Object.getOwnPropertyDescriptor(Platform, 'isTV')!;
    Object.defineProperty(Platform, 'isTV', { get: () => true, configurable: true });
    try {
      await render(<Welcome />);
      expect(screen.getByRole('header')).toHaveTextContent('Welcome to Rillwood');
      expect(screen.getByLabelText('Server address')).toBeOnTheScreen();
    } finally {
      Object.defineProperty(Platform, 'isTV', isTV);
    }
  });
});

describe('TvWelcome', () => {
  it('probes the address and opens Sign in in onboarding', async () => {
    probeServer.mockResolvedValue(server);
    await render(<TvWelcome />);
    await fireEvent.changeText(screen.getByTestId('Server address input'), 'jf.example.com');
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(probeServer).toHaveBeenCalledWith(['https://jf.example.com', 'http://jf.example.com']);
    expect(router.push).toHaveBeenCalledWith({ pathname: '/login', params: { url: server.url, onboarding: '1' } });
  });

  it('shows why the server was not reached, under the field', async () => {
    probeServer.mockRejectedValue(new ApiError('network'));
    await render(<TvWelcome />);
    await fireEvent.changeText(screen.getByTestId('Server address input'), 'jf.example.com');
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Couldn't reach the server/);
    expect(router.push).not.toHaveBeenCalled();
  });

  it('says what is missing on Continue with no address (TV keeps the button pressable)', async () => {
    await render(<TvWelcome />);
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/Enter an address/);
    expect(probeServer).not.toHaveBeenCalled();
  });

  it('offers saved accounts only when there are some', async () => {
    await render(<TvWelcome />);
    expect(screen.queryByRole('button', { name: 'Use a saved account' })).toBeNull();
    await act(() => addAccount(server, { User: { Id: 'anna', Name: 'anna' }, AccessToken: 't', ServerId: 'srv' }, 'd'));
    await act(() => signOut('srv.anna'));
    await fireEvent.press(await screen.findByRole('button', { name: 'Use a saved account' }));
    expect(router.push).toHaveBeenCalledWith('/accounts');
  });
});
