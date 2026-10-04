// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import * as api from '@/api';
import { ApiError } from '@/api';
import * as session from '@/session';

import { invalidate, useFetch } from './useFetch';

const server = { id: 'srv', url: 'https://jf.example.com', name: 'Home server', version: '12.1.0' };
const anna: session.Account = { id: 'srv.a', server, userId: 'a', userName: 'anna', deviceId: 'dev-a' };
const ben: session.Account = { id: 'srv.b', server, userId: 'b', userName: 'ben', deviceId: 'dev-b' };

let active: session.Account | null = anna;
let accounts: session.Account[] = [anna, ben];
const request = jest.spyOn(api, 'request');

/** Pending request the test resolves / rejects by hand (typed `never` so it fits any `request<T>`). */
function deferred() {
  let resolve!: (v: unknown) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<unknown>((res, rej) => {
    resolve = res;
    reject = rej;
  }) as Promise<never>;
  return { promise, resolve, reject };
}

beforeEach(() => {
  active = anna;
  accounts = [anna, ben];
  jest.spyOn(session, 'useSession').mockImplementation(() => ({ accounts, active }));
  jest.spyOn(session, 'getSession').mockImplementation(() => ({ accounts, active }));
  jest.spyOn(session, 'connectionFor').mockImplementation((a) => ({
    baseUrl: a.server.url,
    deviceId: a.deviceId,
    token: `tok-${a.id}`,
    accountId: a.id,
  }));
  request.mockReset();
});

afterEach(() => {
  // The module cache outlives each test: tests that check for missing data use their own path; stale-mark the rest.
  invalidate();
  jest.useRealTimers();
});

describe('useFetch', () => {
  it('fetches as the active account and returns the data', async () => {
    const next = deferred();
    request.mockReturnValue(next.promise);
    const { result } = await renderHook(() => useFetch<{ Items: number[] }>('/Items/latest', { query: { limit: 50 } }));
    expect(result.current).toMatchObject({ data: undefined, loading: true });
    await act(() => next.resolve({ Items: [1] }));
    expect(result.current).toMatchObject({ data: { Items: [1] }, loading: false });
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 'srv.a', token: 'tok-srv.a' }),
      '/Items/latest',
      expect.objectContaining({ query: { limit: 50 } }),
    );
  });

  it('serves a fresh cached response without a request', async () => {
    request.mockResolvedValue('first');
    const first = await renderHook(() => useFetch('/UserViews'));
    await waitFor(() => expect(first.result.current.data).toBe('first'));
    await first.unmount();

    const second = await renderHook(() => useFetch('/UserViews'));
    expect(second.result.current).toMatchObject({ data: 'first', loading: false });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('refetches after the TTL, showing the old data meanwhile', async () => {
    jest.useFakeTimers({ now: 1_000_000 });
    request.mockResolvedValueOnce('old');
    const first = await renderHook(() => useFetch('/Shows/NextUp', { ttl: 1000 }));
    await waitFor(() => expect(first.result.current.data).toBe('old'));
    await first.unmount();

    jest.setSystemTime(1_002_000);
    const next = deferred();
    request.mockReturnValueOnce(next.promise);
    const second = await renderHook(() => useFetch('/Shows/NextUp', { ttl: 1000 }));
    expect(second.result.current).toMatchObject({ data: 'old', loading: true });
    await act(() => next.resolve('new'));
    expect(second.result.current).toMatchObject({ data: 'new', loading: false });
  });

  it('keys the query: a different query is a different entry', async () => {
    request.mockResolvedValueOnce('page 1').mockResolvedValueOnce('page 2');
    const { result, rerender } = await renderHook(
      ({ start }: { start: number }) => useFetch('/Items/paged', { query: { startIndex: start } }),
      { initialProps: { start: 0 } },
    );
    await waitFor(() => expect(result.current.data).toBe('page 1'));
    await rerender({ start: 50 });
    await waitFor(() => expect(result.current.data).toBe('page 2'));
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('treats query key order and undefined values as the same entry', async () => {
    request.mockResolvedValue('same');
    const first = await renderHook(() => useFetch('/Items', { query: { a: 1, b: 2 } }));
    await waitFor(() => expect(first.result.current.data).toBe('same'));
    const second = await renderHook(() => useFetch('/Items', { query: { b: 2, c: undefined, a: 1 } }));
    expect(second.result.current.data).toBe('same');
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('aborts the request on unmount and drops its result', async () => {
    const next = deferred();
    request.mockReturnValue(next.promise);
    const { result, unmount } = await renderHook(() => useFetch('/Items'));
    const signal = request.mock.calls[0][2]?.signal;
    await unmount();
    expect(signal?.aborted).toBe(true);
    await act(() => next.reject(new ApiError('aborted')));
    expect(result.current.error).toBeUndefined();
  });

  // Account isolation: a switch mid-request must never show the old account's response.
  it('never shows another account’s data after a switch', async () => {
    const annas = deferred();
    const bens = deferred();
    request.mockReturnValueOnce(annas.promise).mockReturnValueOnce(bens.promise);
    const { result, rerender } = await renderHook(() => useFetch('/UserViews/switch'));
    const annaSignal = request.mock.calls[0][2]?.signal;

    active = ben;
    await rerender({});
    expect(annaSignal?.aborted).toBe(true);
    expect(request).toHaveBeenLastCalledWith(
      expect.objectContaining({ accountId: 'srv.b' }),
      '/UserViews/switch',
      expect.anything(),
    );
    await act(() => annas.resolve('anna data'));
    expect(result.current).toMatchObject({ data: undefined, loading: true });
    await act(() => bens.resolve('ben data'));
    expect(result.current.data).toBe('ben data');
  });

  it('is idle without a path or when signed out', async () => {
    const noPath = await renderHook(() => useFetch(null));
    expect(noPath.result.current).toMatchObject({ data: undefined, loading: false });
    active = null;
    const signedOut = await renderHook(() => useFetch('/Items'));
    expect(signedOut.result.current).toMatchObject({ data: undefined, loading: false });
    expect(request).not.toHaveBeenCalled();
  });

  it('returns the error and keeps older data', async () => {
    jest.useFakeTimers({ now: 1_000_000 });
    request.mockResolvedValueOnce('old').mockRejectedValueOnce(new ApiError('network'));
    const { result } = await renderHook(() => useFetch('/Items', { ttl: 1000 }));
    await waitFor(() => expect(result.current.data).toBe('old'));
    jest.setSystemTime(1_002_000);
    await act(() => result.current.refresh());
    await waitFor(() => expect(result.current.error?.kind).toBe('network'));
    expect(result.current).toMatchObject({ data: 'old', loading: false });
  });

  // request() itself fires the global 401 → signed-out flow; the hook only reports it.
  it('reports a 401 as an http error', async () => {
    request.mockRejectedValue(new ApiError('http', 401));
    const { result } = await renderHook(() => useFetch('/Items/unauthorized'));
    await waitFor(() => expect(result.current.error?.status).toBe(401));
    expect(result.current.data).toBeUndefined();
  });

  it('refresh refetches a fresh entry', async () => {
    request.mockResolvedValueOnce('one').mockResolvedValueOnce('two');
    const { result } = await renderHook(() => useFetch('/Items'));
    await waitFor(() => expect(result.current.data).toBe('one'));
    await act(() => result.current.refresh());
    await waitFor(() => expect(result.current.data).toBe('two'));
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('invalidate refetches matching paths only, keeping data on screen meanwhile', async () => {
    request.mockImplementation((_conn, path) => Promise.resolve(`${path} v${request.mock.calls.length}`));
    const items = await renderHook(() => useFetch('/Items/1'));
    const views = await renderHook(() => useFetch('/UserViews'));
    await waitFor(() => expect(items.result.current.data).toBe('/Items/1 v1'));
    await waitFor(() => expect(views.result.current.data).toBe('/UserViews v2'));

    await act(() => invalidate('/Items'));
    await waitFor(() => expect(items.result.current.data).toBe('/Items/1 v3'));
    expect(views.result.current.data).toBe('/UserViews v2');
    expect(request).toHaveBeenCalledTimes(3);
  });

  // Privacy on shared phones: a signed-out account's responses don't stay in memory.
  it('drops an account’s cached data when it signs out', async () => {
    request.mockResolvedValueOnce('anna views');
    const first = await renderHook(() => useFetch('/UserViews/prune'));
    await waitFor(() => expect(first.result.current.data).toBe('anna views'));
    await first.unmount();

    // Any fetch while anna is signed out drops her entries.
    accounts = [{ ...anna, signedOut: true }, ben];
    active = ben;
    request.mockResolvedValueOnce('ben views');
    await renderHook(() => useFetch('/UserViews/other'));

    accounts = [anna, ben];
    active = anna;
    request.mockResolvedValueOnce('anna views again');
    const again = await renderHook(() => useFetch('/UserViews/prune'));
    await waitFor(() => expect(again.result.current.data).toBe('anna views again'));
    expect(request).toHaveBeenCalledTimes(3);
  });

  // Regression (code review): a refresh elsewhere restarted every mounted request and cleared their errors.
  it('leaves other paths alone on refresh: no abort, error kept', async () => {
    const slow = deferred();
    request.mockImplementation((_conn, path) => {
      if (path === '/Library/slow') return slow.promise;
      if (path === '/Search/fails') return Promise.reject(new ApiError('network'));
      return Promise.resolve('home');
    });
    const library = await renderHook(() => useFetch('/Library/slow'));
    const search = await renderHook(() => useFetch('/Search/fails'));
    const home = await renderHook(() => useFetch('/Home/rows'));
    await waitFor(() => expect(search.result.current.error?.kind).toBe('network'));
    const librarySignal = request.mock.calls.find((c) => c[1] === '/Library/slow')?.[2]?.signal;

    await act(() => home.result.current.refresh());
    await act(() => invalidate('/Home'));
    expect(librarySignal?.aborted).toBe(false);
    expect(search.result.current.error?.kind).toBe('network');
    expect(request.mock.calls.filter((c) => c[1] === '/Library/slow')).toHaveLength(1);
    expect(request.mock.calls.filter((c) => c[1] === '/Search/fails')).toHaveLength(1);

    await act(() => slow.resolve('library'));
    expect(library.result.current.data).toBe('library');
  });

  it('shows a new response in every hook on the same path', async () => {
    request.mockResolvedValueOnce('v1').mockResolvedValueOnce('v2');
    const a = await renderHook(() => useFetch('/UserViews/shared'));
    await waitFor(() => expect(a.result.current.data).toBe('v1'));
    const b = await renderHook(() => useFetch('/UserViews/shared'));
    expect(b.result.current.data).toBe('v1');

    await act(() => a.result.current.refresh());
    await waitFor(() => expect(a.result.current.data).toBe('v2'));
    expect(b.result.current.data).toBe('v2');
  });

  it('refresh retries after an error with no data', async () => {
    request.mockRejectedValueOnce(new ApiError('network')).mockResolvedValueOnce('ok');
    const { result } = await renderHook(() => useFetch('/Items/retry'));
    await waitFor(() => expect(result.current.error?.kind).toBe('network'));
    await act(() => result.current.refresh());
    await waitFor(() => expect(result.current.data).toBe('ok'));
    expect(result.current.error).toBeUndefined();
  });

  // Pull to refresh / Retry on Home: a row whose first request failed has nothing cached to mark stale.
  it('invalidate retries a mounted hook whose request failed', async () => {
    request.mockRejectedValueOnce(new ApiError('network')).mockResolvedValueOnce('ok');
    const { result } = await renderHook(() => useFetch('/Items/invalidate-retry'));
    await waitFor(() => expect(result.current.error?.kind).toBe('network'));
    await act(() => invalidate('/Items/invalidate'));
    await waitFor(() => expect(result.current.data).toBe('ok'));
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('invalidate leaves unmounted failed paths alone', async () => {
    request.mockRejectedValueOnce(new ApiError('network'));
    const { result, unmount } = await renderHook(() => useFetch('/Items/gone'));
    await waitFor(() => expect(result.current.error?.kind).toBe('network'));
    await unmount();
    await act(() => invalidate('/Items/gone'));
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('shares one request between hooks on the same path; aborts only when the last one leaves', async () => {
    const next = deferred();
    request.mockReturnValue(next.promise);
    const a = await renderHook(() => useFetch('/Shows/NextUp/shared'));
    const b = await renderHook(() => useFetch('/Shows/NextUp/shared'));
    expect(request).toHaveBeenCalledTimes(1);
    const signal = request.mock.calls[0][2]?.signal;

    await a.unmount();
    expect(signal?.aborted).toBe(false);
    await act(() => next.resolve('next up'));
    expect(b.result.current.data).toBe('next up');
    await b.unmount();
  });
});
