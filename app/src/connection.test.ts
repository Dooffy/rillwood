// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import type * as Api from './api';
import type * as Connection from './connection';
import type { Account, SessionState } from './session';

const account = (id: string, url: string): Account => ({
  id,
  server: { id: 'srv', url, name: 'Home', version: '12.1.0' },
  userId: 'u',
  userName: 'anna',
  deviceId: 'dev',
});
const home = account('home.a', 'https://home.example');

const mockSession: { state: SessionState; listeners: Set<() => void> } = {
  state: { accounts: [home], active: home },
  listeners: new Set(),
};
jest.mock('./session', () => ({
  getSession: () => mockSession.state,
  subscribeSession: (l: () => void) => {
    mockSession.listeners.add(l);
    return () => mockSession.listeners.delete(l);
  },
}));

// The server: there (answers) or not (fetch fails, as with no network).
let serverUp = true;
const fetchMock = jest.fn(() =>
  serverUp
    ? Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('{"Id":"srv","Version":"12.1.0"}') })
    : Promise.reject(new TypeError('Network request failed')),
);

let api: typeof Api;
let conn: typeof Connection;
let reconnected: jest.Mock;
let appState: (state: string) => void;

const checks = () => fetchMock.mock.calls.length;
const flush = () => jest.advanceTimersByTimeAsync(0);

/** Init with the server up or down, after the launch check settled. */
async function start(up = true) {
  serverUp = up;
  conn.initConnection();
  await flush();
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.resetModules();
  serverUp = true;
  fetchMock.mockClear();
  global.fetch = fetchMock as unknown as typeof fetch;
  mockSession.state = { accounts: [home], active: home };
  mockSession.listeners.clear();
  /* eslint-disable @typescript-eslint/no-require-imports -- fresh module state per test */
  const { AppState } = require('react-native') as typeof import('react-native');
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    appState = listener as (state: string) => void;
    return { remove: () => {} };
  });
  api = require('./api');
  conn = require('./connection');
  /* eslint-enable @typescript-eslint/no-require-imports */
  reconnected = jest.fn();
  conn.onReconnect(reconnected);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('connection', () => {
  it('launch: asks the active server for /System/Info/Public', async () => {
    await start();
    expect(fetchMock).toHaveBeenCalledWith('https://home.example/System/Info/Public', expect.anything());
    expect(api.isOffline()).toBe(false);
  });

  it('signed out: nothing to ask', async () => {
    mockSession.state = { accounts: [], active: null };
    await start();
    expect(checks()).toBe(0);
  });

  it('offline: checks again after 5 s, 10 s, 20 s, then every 30 s', async () => {
    await start(false);
    expect(api.isOffline()).toBe(true);
    expect(checks()).toBe(1);
    for (const [wait, total] of [
      [4_999, 1],
      [1, 2],
      [10_000, 3],
      [20_000, 4],
      [30_000, 5],
      [30_000, 6],
    ]) {
      await jest.advanceTimersByTimeAsync(wait);
      expect(checks()).toBe(total);
    }
  });

  it('back online: reconnect listeners run once, the checks stop', async () => {
    await start(false);
    expect(reconnected).not.toHaveBeenCalled();

    serverUp = true;
    await jest.advanceTimersByTimeAsync(5_000);
    expect(api.isOffline()).toBe(false);
    expect(reconnected).toHaveBeenCalledTimes(1);

    const before = checks();
    await jest.advanceTimersByTimeAsync(120_000);
    expect(checks()).toBe(before);
  });

  it('any request that answers counts too: the scheduled check is dropped', async () => {
    await start(false);
    serverUp = true;
    await api.request({ baseUrl: 'https://home.example' }, '/Items').catch(() => {});
    await flush();
    expect(api.isOffline()).toBe(false);
    expect(reconnected).toHaveBeenCalledTimes(1);
    const before = checks();
    await jest.advanceTimersByTimeAsync(60_000);
    expect(checks()).toBe(before);
  });

  it('going offline later starts the checks from 5 s again', async () => {
    await start();
    serverUp = false;
    await api.request({ baseUrl: 'https://home.example' }, '/Items').catch(() => {});
    expect(api.isOffline()).toBe(true);
    const before = checks();
    await jest.advanceTimersByTimeAsync(5_000);
    expect(checks()).toBe(before + 1);
  });

  it('no checks in the background; back on screen it checks at once', async () => {
    await start(false);
    appState('background');
    await jest.advanceTimersByTimeAsync(120_000);
    expect(checks()).toBe(1);

    appState('active');
    await flush();
    expect(checks()).toBe(2);
  });

  it('a quick switch while offline (Control Center, airplane mode off) checks at once', async () => {
    await start(false);
    serverUp = true;
    appState('inactive');
    appState('active');
    await flush();
    expect(checks()).toBe(2);
    expect(api.isOffline()).toBe(false);
  });

  it('launched in the background: no check until it comes on screen, then at once', async () => {
    jest.resetModules();
    /* eslint-disable @typescript-eslint/no-require-imports -- fresh module state with a background launch */
    const { AppState } = require('react-native') as typeof import('react-native');
    Object.defineProperty(AppState, 'currentState', { value: 'background', configurable: true });
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      appState = listener as (state: string) => void;
      return { remove: () => {} };
    });
    conn = require('./connection');
    /* eslint-enable @typescript-eslint/no-require-imports */
    conn.initConnection();
    await flush();
    expect(checks()).toBe(0);
    appState('active');
    await flush();
    expect(checks()).toBe(1);
  });

  it('signed out of the last account: the running check and the rechecks stop', async () => {
    await start(false);
    mockSession.state = { accounts: [], active: null };
    mockSession.listeners.forEach((l) => l());
    await jest.advanceTimersByTimeAsync(120_000);
    expect(checks()).toBe(1);
  });

  it('a quick switch (inactive, not background) does not check at once', async () => {
    await start();
    appState('inactive');
    appState('active');
    await flush();
    expect(checks()).toBe(1);
  });

  it('another server: checked at once; another account on the same server: not', async () => {
    await start();
    const sameServer = account('home.b', 'https://home.example');
    mockSession.state = { accounts: [home, sameServer], active: sameServer };
    mockSession.listeners.forEach((l) => l());
    await flush();
    expect(checks()).toBe(1);

    const away = account('away.a', 'https://away.example');
    mockSession.state = { accounts: [home, away], active: away };
    mockSession.listeners.forEach((l) => l());
    await flush();
    expect(checks()).toBe(2);
    expect(fetchMock).toHaveBeenLastCalledWith('https://away.example/System/Info/Public', expect.anything());
  });

  it("another server: the old server's offline state is dropped at once", async () => {
    await start(false);
    expect(api.isOffline()).toBe(true);
    const away = account('away.a', 'https://away.example');
    mockSession.state = { accounts: [home, away], active: away };
    mockSession.listeners.forEach((l) => l());
    expect(api.isOffline()).toBe(false);
  });

  it('starts once', async () => {
    conn.initConnection();
    await start();
    expect(checks()).toBe(1);
  });
});
