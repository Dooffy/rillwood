// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import * as api from '@/api';
import { ApiError } from '@/api';
import { addAccount, knownServer, type Server } from '@/session';

import {
  authErrorMessage,
  probeServer,
  QUICK_CONNECT_POLL_MS,
  quickConnect,
  quickConnectEnabled,
  signIn,
} from './auth';

jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'uuid-1') }));
jest.mock('@/api', () => ({
  ...jest.requireActual<typeof import('@/api')>('@/api'),
  findServer: jest.fn(),
  authenticateByName: jest.fn(),
  getQuickConnectEnabled: jest.fn(),
  initiateQuickConnect: jest.fn(),
  getQuickConnectState: jest.fn(),
  authenticateWithQuickConnect: jest.fn(),
}));
jest.mock('@/session', () => ({
  ...jest.requireActual<typeof import('@/session')>('@/session'),
  addAccount: jest.fn(() => Promise.resolve()),
}));

const mocked = jest.mocked(api);
const server: Server = { id: 'srv', url: 'https://jf.example.com', name: 'Home', version: '12.1.0' };
const authResult = { User: { Id: 'u1', Name: 'anna' }, AccessToken: 'tok', ServerId: 'srv' };

beforeEach(() => {
  jest.clearAllMocks();
});

describe('probeServer', () => {
  it('maps the server info and remembers the server for Sign in', async () => {
    mocked.findServer.mockResolvedValue({
      baseUrl: 'http://10.0.0.2:8096',
      info: { Id: 'abc', ServerName: 'Cabin', Version: '10.11.11' },
    });
    expect(knownServer('http://10.0.0.2:8096')).toBeNull();
    const probed = await probeServer(['https://10.0.0.2:8096', 'http://10.0.0.2:8096']);
    expect(probed).toEqual({ id: 'abc', url: 'http://10.0.0.2:8096', name: 'Cabin', version: '10.11.11' });
    expect(knownServer('http://10.0.0.2:8096')).toEqual(probed);
  });

  it('does not trust an address that was never probed', () => {
    expect(knownServer('https://evil.example')).toBeNull();
  });
});

describe('signIn', () => {
  it('signs in with a fresh DeviceId and stores the account', async () => {
    mocked.authenticateByName.mockResolvedValue(authResult);
    await signIn(server, 'anna', 'pw');
    expect(mocked.authenticateByName).toHaveBeenCalledWith(
      { baseUrl: 'https://jf.example.com', deviceId: 'uuid-1' },
      'anna',
      'pw',
    );
    expect(addAccount).toHaveBeenCalledWith(server, authResult, 'uuid-1');
  });

  it('stores nothing when sign in fails', async () => {
    mocked.authenticateByName.mockRejectedValue(new ApiError('http', 401));
    await expect(signIn(server, 'anna', 'bad')).rejects.toMatchObject({ status: 401 });
    expect(addAccount).not.toHaveBeenCalled();
  });
});

it('asks the server whether Quick Connect is on, without auth', async () => {
  mocked.getQuickConnectEnabled.mockResolvedValue(false);
  await expect(quickConnectEnabled(server)).resolves.toBe(false);
  expect(mocked.getQuickConnectEnabled).toHaveBeenCalledWith({ baseUrl: 'https://jf.example.com' }, undefined);
});

describe('quickConnect', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mocked.initiateQuickConnect.mockResolvedValue({ Secret: 's', Code: '123456', Authenticated: false });
    mocked.authenticateWithQuickConnect.mockResolvedValue(authResult);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows the code, polls every 5s until approved, then adds the account', async () => {
    mocked.getQuickConnectState
      .mockResolvedValueOnce({ Secret: 's', Code: '123456', Authenticated: false })
      .mockResolvedValueOnce({ Secret: 's', Code: '123456', Authenticated: true });
    const onCode = jest.fn();
    const done = quickConnect(server, { signal: new AbortController().signal, onCode });

    await jest.advanceTimersByTimeAsync(0);
    expect(onCode).toHaveBeenCalledWith('123456');
    expect(mocked.getQuickConnectState).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(QUICK_CONNECT_POLL_MS);
    expect(mocked.getQuickConnectState).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(QUICK_CONNECT_POLL_MS);
    await done;

    const conn = { baseUrl: 'https://jf.example.com', deviceId: 'uuid-1' };
    expect(mocked.initiateQuickConnect).toHaveBeenCalledWith(conn, expect.any(AbortSignal));
    expect(mocked.authenticateWithQuickConnect).toHaveBeenCalledWith(conn, 's', expect.any(AbortSignal));
    expect(addAccount).toHaveBeenCalledWith(server, authResult, 'uuid-1');
  });

  it('stops polling and adds nothing when aborted', async () => {
    const controller = new AbortController();
    const done = quickConnect(server, { signal: controller.signal, onCode: () => {} }).catch((e: ApiError) => e);
    await jest.advanceTimersByTimeAsync(0);
    controller.abort();
    await expect(done).resolves.toMatchObject({ kind: 'aborted' });
    await jest.advanceTimersByTimeAsync(QUICK_CONNECT_POLL_MS * 3);
    expect(mocked.getQuickConnectState).not.toHaveBeenCalled();
    expect(addAccount).not.toHaveBeenCalled();
  });

  it('adds nothing when aborted during the final exchange', async () => {
    mocked.getQuickConnectState.mockResolvedValue({ Secret: 's', Code: '123456', Authenticated: true });
    const controller = new AbortController();
    mocked.authenticateWithQuickConnect.mockImplementation(async () => {
      controller.abort();
      return authResult;
    });
    const done = quickConnect(server, { signal: controller.signal, onCode: () => {} }).catch((e: ApiError) => e);
    await jest.advanceTimersByTimeAsync(QUICK_CONNECT_POLL_MS);
    await expect(done).resolves.toMatchObject({ kind: 'aborted' });
    expect(addAccount).not.toHaveBeenCalled();
  });
});

describe('authErrorMessage', () => {
  const cases: [unknown, Parameters<typeof authErrorMessage>[1], RegExp][] = [
    [new ApiError('network'), 'signIn', /Couldn't reach the server/],
    [new ApiError('parse'), 'probe', /doesn't look like a Jellyfin server/],
    [new ApiError('http', 401), 'signIn', /Wrong username or password/],
    [new ApiError('http', 401), 'quickConnect', /turned off/],
    [new ApiError('http', 500), 'signIn', /Something went wrong/],
    [new Error('boom'), 'quickConnect', /Something went wrong/],
  ];
  it.each(cases)('%s during %s', (error, action, message) => {
    expect(authErrorMessage(error, action)).toMatch(message);
  });
});
