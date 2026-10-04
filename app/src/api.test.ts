// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';

import {
  ApiError,
  authenticateByName,
  authenticateWithQuickConnect,
  authHeader,
  findServer,
  getPlaybackInfo,
  getPublicUsers,
  getQuickConnectEnabled,
  getQuickConnectState,
  initiateQuickConnect,
  isOffline,
  logout,
  onUnauthorized,
  request,
  setFavourite,
  setPlayed,
  TIMEOUT_MS,
  useOffline,
  type Connection,
} from './api';

const conn: Connection = {
  baseUrl: 'https://jf.example.com',
  deviceId: 'dev-1',
  token: 'tok-secret',
  accountId: 'acc-1',
};
const anon: Connection = { baseUrl: 'https://jf.example.com', deviceId: 'dev-1' };

// The call shape api.ts uses; DOM `fetch` overloads differ between type setups (CI vs local), so cast once below.
const fetchMock = jest.fn<(url: string, init?: RequestInit) => Promise<Response>>();

function reply(status: number, body?: unknown) {
  const text = body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body);
  return Promise.resolve({ ok: status >= 200 && status < 300, status, text: async () => text } as Response);
}

function networkError() {
  return Promise.reject(new TypeError('Network request failed'));
}

/** Never answers; rejects like real fetch when its signal aborts. */
function hang(_url: string, init?: RequestInit) {
  return new Promise<Response>((_, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new Error('AbortError')));
  });
}

function lastCall() {
  const [url, init] = fetchMock.mock.calls.at(-1)!;
  return { url: String(url), init: init!, headers: init!.headers as Record<string, string> };
}

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(async () => {
  jest.useRealTimers();
  // Leave the offline flag false for the next test.
  fetchMock.mockImplementationOnce(() => reply(204));
  await request(anon, '/reset');
});

describe('authHeader', () => {
  it('sends client fields without a token before sign in', () => {
    expect(authHeader(anon)).toMatch(
      /^MediaBrowser Client="Rillwood", Device="iPhone", DeviceId="dev-1", Version="\d+\.\d+\.\d+"$/,
    );
  });

  it('appends the token when signed in', () => {
    expect(authHeader(conn)).toMatch(/, Token="tok-secret"$/);
  });
});

describe('request', () => {
  it('sends the auth header and never the token in the URL', async () => {
    fetchMock.mockImplementation(() => reply(200, { Id: 'x' }));
    await request(conn, '/Items/x', { query: { userId: 'u', limit: 50, skip: undefined } });
    const { url, headers } = lastCall();
    expect(url).toBe('https://jf.example.com/Items/x?userId=u&limit=50');
    expect(url).not.toContain('tok-secret');
    expect(headers.Authorization).toContain('Token="tok-secret"');
    expect(headers['Content-Type']).toBeUndefined();
  });

  it('encodes query values', async () => {
    fetchMock.mockImplementation(() => reply(200, []));
    await request(conn, '/Items', { query: { searchTerm: 'a&b c' } });
    expect(lastCall().url).toBe('https://jf.example.com/Items?searchTerm=a%26b%20c');
  });

  it('posts JSON bodies', async () => {
    fetchMock.mockImplementation(() => reply(200, { ok: true }));
    await request(conn, '/x', { method: 'POST', body: { A: 1 } });
    const { init, headers } = lastCall();
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"A":1}');
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('parses JSON and resolves 204 / empty bodies to undefined', async () => {
    fetchMock.mockImplementationOnce(() => reply(200, { Name: 'n' }));
    await expect(request(conn, '/a')).resolves.toEqual({ Name: 'n' });
    fetchMock.mockImplementationOnce(() => reply(204));
    await expect(request(conn, '/b')).resolves.toBeUndefined();
    fetchMock.mockImplementationOnce(() => reply(200));
    await expect(request(conn, '/c')).resolves.toBeUndefined();
  });

  it('throws http ApiError with the status and no token or query in the message', async () => {
    fetchMock.mockImplementation(() => reply(404));
    const error = await request(conn, '/QuickConnect/Connect', { query: { secret: 's3cret' } }).then(
      () => new Error('resolved'),
      (e: ApiError) => e,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ kind: 'http', status: 404 });
    expect(error.message).toBe('GET /QuickConnect/Connect → 404');
    expect(error.message).not.toMatch(/s3cret|tok-secret/);
  });

  it('throws parse ApiError for a non-JSON 2xx body', async () => {
    fetchMock.mockImplementation(() => reply(200, '<html>'));
    await expect(request(conn, '/a')).rejects.toMatchObject({ kind: 'parse' });
  });

  it('gives up after 8s as a network error', async () => {
    jest.useFakeTimers();
    fetchMock.mockImplementation(hang);
    const pending = request(conn, '/slow').catch((e: ApiError) => e);
    await jest.advanceTimersByTimeAsync(TIMEOUT_MS - 1);
    expect(fetchMock.mock.calls[0][1]!.signal!.aborted).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toMatchObject({ kind: 'network' });
    expect(isOffline()).toBe(true);
  });

  // Regression: the timer was cleared once headers arrived, so a stalled body hung forever.
  it('keeps the 8s timeout while reading the body', async () => {
    jest.useFakeTimers();
    fetchMock.mockImplementation((_url, init) =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: () => hang('', init),
      } as unknown as Response),
    );
    const pending = request(conn, '/slow-body').catch((e: ApiError) => e);
    await jest.advanceTimersByTimeAsync(TIMEOUT_MS);
    await expect(pending).resolves.toMatchObject({ kind: 'network' });
  });

  // Regression: a dropped connection mid-body escaped as a raw TypeError.
  it('maps a body read failure to a network ApiError', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve({ ok: true, status: 200, text: networkError } as unknown as Response),
    );
    const error = await request(conn, '/a').then(
      () => new Error('resolved'),
      (e: ApiError) => e,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ kind: 'network' });
  });

  it('reports a caller abort as aborted, not offline', async () => {
    fetchMock.mockImplementation(hang);
    const controller = new AbortController();
    const pending = request(conn, '/slow', { signal: controller.signal }).catch((e: ApiError) => e);
    controller.abort();
    await expect(pending).resolves.toMatchObject({ kind: 'aborted' });
    expect(isOffline()).toBe(false);
  });

  it('does not call fetch with an already aborted signal', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(request(conn, '/a', { signal: controller.signal })).rejects.toMatchObject({ kind: 'aborted' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('offline flag', () => {
  it('turns on after a network error and off after any server answer', async () => {
    fetchMock.mockImplementationOnce(networkError);
    await expect(request(conn, '/a')).rejects.toMatchObject({ kind: 'network' });
    expect(isOffline()).toBe(true);

    fetchMock.mockImplementationOnce(() => reply(500));
    await expect(request(conn, '/a')).rejects.toMatchObject({ kind: 'http', status: 500 });
    expect(isOffline()).toBe(false);
  });

  it('notifies useOffline subscribers', async () => {
    const { result } = await renderHook(() => useOffline());
    expect(result.current).toBe(false);
    fetchMock.mockImplementationOnce(networkError);
    await act(() => request(conn, '/a').catch(() => {}));
    expect(result.current).toBe(true);
  });
});

describe('onUnauthorized', () => {
  const listener = jest.fn();
  let off: () => void;
  beforeEach(() => {
    listener.mockReset();
    off = onUnauthorized(listener);
    fetchMock.mockImplementation(() => reply(401));
  });
  afterEach(() => off());

  it('fires with the account id on 401 for a signed-in call', async () => {
    await expect(request(conn, '/UserViews')).rejects.toMatchObject({ status: 401 });
    expect(listener).toHaveBeenCalledWith('acc-1', 'tok-secret');
  });

  it('does not fire for a failed sign in (no account yet)', async () => {
    await expect(authenticateByName(anon, 'anna', 'bad')).rejects.toMatchObject({ status: 401 });
    expect(listener).not.toHaveBeenCalled();
  });

  // Regression: replacing an account logs out its dead token; that 401 must not sign anyone out.
  it('does not fire for logout of an already revoked token', async () => {
    await expect(logout(conn)).rejects.toMatchObject({ status: 401 });
    expect(listener).not.toHaveBeenCalled();
  });

  it('stops after unsubscribe', async () => {
    off();
    await request(conn, '/a').catch(() => {});
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('auth endpoints', () => {
  const auth = { User: { Id: 'u1', Name: 'anna' }, AccessToken: 't', ServerId: 's' };

  it('signs in by name with the client header and no token', async () => {
    fetchMock.mockImplementation(() => reply(200, auth));
    await expect(authenticateByName(anon, 'anna', 'pw')).resolves.toEqual(auth);
    const { url, init, headers } = lastCall();
    expect(url).toBe('https://jf.example.com/Users/AuthenticateByName');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ Username: 'anna', Pw: 'pw' });
    expect(headers.Authorization).not.toContain('Token=');
  });

  it('runs the Quick Connect calls', async () => {
    fetchMock.mockImplementation(() => reply(200, { Secret: 's', Code: '123456', Authenticated: false }));
    await initiateQuickConnect(anon);
    expect(lastCall().init.method).toBe('POST');
    expect(lastCall().url).toBe('https://jf.example.com/QuickConnect/Initiate');

    await getQuickConnectState(anon, 'a/b');
    expect(lastCall().url).toBe('https://jf.example.com/QuickConnect/Connect?secret=a%2Fb');

    fetchMock.mockImplementation(() => reply(200, auth));
    await authenticateWithQuickConnect(anon, 's');
    expect(JSON.parse(String(lastCall().init.body))).toEqual({ Secret: 's' });
  });

  it('reads public users and the Quick Connect switch', async () => {
    fetchMock.mockImplementation(() => reply(200, []));
    await expect(getPublicUsers(anon)).resolves.toEqual([]);
    expect(lastCall().url).toBe('https://jf.example.com/Users/Public');
    fetchMock.mockImplementation(() => reply(200, false));
    await expect(getQuickConnectEnabled(anon)).resolves.toBe(false);
    expect(lastCall().url).toBe('https://jf.example.com/QuickConnect/Enabled');
  });

  it('logs out with POST and accepts 204', async () => {
    fetchMock.mockImplementation(() => reply(204));
    await expect(logout(conn)).resolves.toBeUndefined();
    expect(lastCall().url).toBe('https://jf.example.com/Sessions/Logout');
    expect(lastCall().init.method).toBe('POST');
  });
});

describe('findServer', () => {
  const info = { Id: 'srv', ServerName: 'Home', Version: '12.1.0' };
  const candidates = ['https://jf.local', 'http://jf.local'];

  it('prefers the first candidate when both answer, without an auth header', async () => {
    fetchMock.mockImplementation(() => reply(200, info));
    await expect(findServer(candidates)).resolves.toEqual({ baseUrl: 'https://jf.local', info });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(lastCall().headers.Authorization).toBeUndefined();
  });

  it('returns as soon as the first candidate wins and cancels the rest', async () => {
    fetchMock.mockImplementation((url, init) => (url.startsWith('https') ? reply(200, info) : hang(url, init)));
    await expect(findServer(candidates)).resolves.toMatchObject({ baseUrl: 'https://jf.local' });
    expect(fetchMock.mock.calls[1][1]!.signal!.aborted).toBe(true);
  });

  it('does not mark the app offline for a wrong address', async () => {
    fetchMock.mockImplementation(networkError);
    await expect(findServer(candidates)).rejects.toMatchObject({ kind: 'network' });
    expect(isOffline()).toBe(false);
  });

  it('falls back to http when https fails', async () => {
    fetchMock.mockImplementation((url) => (url.startsWith('https') ? networkError() : reply(200, info)));
    await expect(findServer(candidates)).resolves.toEqual({ baseUrl: 'http://jf.local', info });
  });

  it('probes candidates in parallel, not one timeout after another', async () => {
    jest.useFakeTimers();
    fetchMock.mockImplementation((url, init) => (url.startsWith('https') ? hang(url, init) : reply(200, info)));
    const pending = findServer(candidates);
    await jest.advanceTimersByTimeAsync(TIMEOUT_MS);
    await expect(pending).resolves.toMatchObject({ baseUrl: 'http://jf.local' });
  });

  it('rejects a 200 that is not a Jellyfin server', async () => {
    fetchMock.mockImplementation(() => reply(200, { hello: 'world' }));
    await expect(findServer(candidates)).rejects.toMatchObject({ kind: 'parse' });
  });

  it('rethrows the failure when nothing answers', async () => {
    fetchMock.mockImplementation(networkError);
    await expect(findServer(candidates)).rejects.toMatchObject({ kind: 'network' });
  });
});

describe('user data endpoints', () => {
  it.each([
    [() => setPlayed(conn, 'abc', true), 'POST', '/UserPlayedItems/abc'],
    [() => setPlayed(conn, 'abc', false), 'DELETE', '/UserPlayedItems/abc'],
    [() => setFavourite(conn, 'abc', true), 'POST', '/UserFavoriteItems/abc'],
    [() => setFavourite(conn, 'abc', false), 'DELETE', '/UserFavoriteItems/abc'],
  ] as [() => Promise<unknown>, string, string][])(
    '%#: %s %s, header auth, answers the new UserData',
    async (call, method, path) => {
      fetchMock.mockImplementation(() => reply(200, { Played: true, PlaybackPositionTicks: 0 }));
      await expect(call()).resolves.toEqual({ Played: true, PlaybackPositionTicks: 0 });
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(`https://jf.example.com${path}`);
      expect(init?.method).toBe(method);
      expect((init?.headers as Record<string, string>).Authorization).toContain('Token="tok-secret"');
    },
  );
});

describe('playback endpoints', () => {
  it('posts the body to PlaybackInfo, header auth', async () => {
    fetchMock.mockImplementation(() => reply(200, { MediaSources: [], PlaySessionId: 'ps' }));
    await expect(getPlaybackInfo(conn, 'abc', { MediaSourceId: 'ms1' })).resolves.toEqual({
      MediaSources: [],
      PlaySessionId: 'ps',
    });
    const { url, init, headers } = lastCall();
    expect(url).toBe('https://jf.example.com/Items/abc/PlaybackInfo');
    expect(init.method).toBe('POST');
    expect(headers.Authorization).toContain('Token="tok-secret"');
    expect(JSON.parse(String(init.body))).toEqual({ MediaSourceId: 'ms1' });
  });
});
