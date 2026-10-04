// SPDX-License-Identifier: GPL-3.0-or-later
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import * as api from '@/api';
import { ApiError, type BaseItemDto, type RequestOptions } from '@/api';
import { listItems, NO_FILTERS, type LibraryQuery } from '@/items';
import * as session from '@/session';

import { usePagedItems } from './usePagedItems';
import { setUserFlag } from './userData';

/** Library pages for a query, the way the Library screen builds them. */
function useLibrary(query: LibraryQuery) {
  return usePagedItems(JSON.stringify(query), (start) => listItems(query, 50, start));
}

const server = { id: 'srv', url: 'https://jf.example.com', name: 'Home server', version: '12.1.0' };
const anna: session.Account = { id: 'srv.a', server, userId: 'a', userName: 'anna', deviceId: 'dev-a' };
const ben: session.Account = { id: 'srv.b', server, userId: 'b', userName: 'ben', deviceId: 'dev-b' };
let active: session.Account = anna;

const request = jest.spyOn(api, 'request');
const item = (i: number): BaseItemDto => ({ Id: `m${i}`, Name: `Movie ${i}`, Type: 'Movie' });
const range = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => item(from + i));

// While `hold` is on, answers wait until `release()` - to see the loading state in between.
let hold = false;
let held: (() => void)[] = [];

/** A library of `total` items, answered in pages by startIndex. */
function serve(total: number) {
  request.mockImplementation((_conn, _path, options?: RequestOptions) => {
    const start = Number(options?.query?.startIndex ?? 0);
    const limit = Number(options?.query?.limit ?? 50);
    const page = { Items: range(start, Math.min(total, start + limit)), TotalRecordCount: total };
    if (!hold) return Promise.resolve(page) as Promise<never>;
    return new Promise<unknown>((resolve) => held.push(() => resolve(page))) as Promise<never>;
  });
}

async function release() {
  hold = false;
  await act(async () => held.splice(0).forEach((answer) => answer()));
}

const movies: LibraryQuery = { scope: 'movies', sort: 'name', filters: NO_FILTERS };

beforeEach(() => {
  request.mockReset();
  hold = false;
  held = [];
  active = anna;
  jest.spyOn(session, 'useSession').mockImplementation(() => ({ accounts: [anna, ben], active }));
  jest.spyOn(session, 'connectionFor').mockImplementation((a) => ({
    baseUrl: a.server.url,
    deviceId: a.deviceId,
    token: `tok-${a.id}`,
    accountId: a.id,
  }));
});

describe('usePagedItems', () => {
  it('loads the first page as the active account', async () => {
    serve(120);
    hold = true;
    const { result } = await renderHook(() => useLibrary(movies));
    expect(result.current).toMatchObject({ items: [], loading: true, hasMore: false });
    await release();
    await waitFor(() => expect(result.current.items).toHaveLength(50));
    expect(result.current).toMatchObject({ total: 120, hasMore: true, loading: false });
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 'srv.a' }),
      '/Items',
      expect.objectContaining({ query: expect.objectContaining({ startIndex: 0, limit: 50 }) }),
    );
  });

  it('appends pages until everything is loaded, then stops asking', async () => {
    serve(120);
    const { result } = await renderHook(() => useLibrary(movies));
    await waitFor(() => expect(result.current.items).toHaveLength(50));
    await act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.items).toHaveLength(100));
    await act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.items).toHaveLength(120));
    expect(result.current.hasMore).toBe(false);
    expect(result.current.items.at(-1)?.Id).toBe('m119');
    await act(() => result.current.loadMore());
    expect(request).toHaveBeenCalledTimes(3);
  });

  it('ignores loadMore while a page is loading', async () => {
    serve(120);
    const { result } = await renderHook(() => useLibrary(movies));
    await waitFor(() => expect(result.current.items).toHaveLength(50));
    hold = true;
    await act(() => result.current.loadMore());
    await act(() => result.current.loadMore());
    expect(request).toHaveBeenCalledTimes(2);
    await release();
    await waitFor(() => expect(result.current.items).toHaveLength(100));
  });

  it('starts over for a new query or account', async () => {
    serve(120);
    const { result, rerender } = await renderHook((q: LibraryQuery) => useLibrary(q), { initialProps: movies });
    await waitFor(() => expect(result.current.items).toHaveLength(50));
    await act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.items).toHaveLength(100));

    hold = true;
    await rerender({ ...movies, filters: { ...NO_FILTERS, show: 'unwatched' } });
    expect(result.current.items).toHaveLength(0);
    await release();
    await waitFor(() => expect(result.current.items).toHaveLength(50));
    expect(request).toHaveBeenLastCalledWith(
      expect.anything(),
      '/Items',
      expect.objectContaining({ query: expect.objectContaining({ filters: 'IsUnplayed', startIndex: 0 }) }),
    );

    active = ben;
    hold = true;
    await rerender({ ...movies, filters: { ...NO_FILTERS, show: 'unwatched' } });
    expect(result.current.items).toHaveLength(0);
    await release();
    await waitFor(() => expect(result.current.items).toHaveLength(50));
    expect(request).toHaveBeenLastCalledWith(
      expect.objectContaining({ accountId: 'srv.b' }),
      '/Items',
      expect.anything(),
    );
  });

  it('keeps loaded items when a later page fails, and retries it', async () => {
    serve(120);
    const { result } = await renderHook(() => useLibrary(movies));
    await waitFor(() => expect(result.current.items).toHaveLength(50));
    request.mockImplementationOnce(() => Promise.reject(new ApiError('network')));
    await act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.error?.kind).toBe('network'));
    expect(result.current.items).toHaveLength(50);
    serve(120);
    await act(() => result.current.retry());
    await waitFor(() => expect(result.current.items).toHaveLength(100));
    expect(result.current.error).toBeUndefined();
  });

  it('refreshes from the first page, keeping items until it answers', async () => {
    serve(120);
    const { result } = await renderHook(() => useLibrary(movies));
    await waitFor(() => expect(result.current.items).toHaveLength(50));
    await act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.items).toHaveLength(100));
    serve(60);
    hold = true;
    await act(() => result.current.refresh());
    expect(result.current).toMatchObject({ loading: true, total: 120 });
    expect(result.current.items).toHaveLength(100);
    await release();
    await waitFor(() => expect(result.current.total).toBe(60));
    expect(result.current.items).toHaveLength(50);
  });

  it('shows a first-page failure and recovers on refresh', async () => {
    request.mockImplementationOnce(() => Promise.reject(new ApiError('http', 500)));
    const { result } = await renderHook(() => useLibrary(movies));
    await waitFor(() => expect(result.current.error?.status).toBe(500));
    expect(result.current).toMatchObject({ items: [], hasMore: false, loading: false });
    serve(3);
    await act(() => result.current.refresh());
    await waitFor(() => expect(result.current.items).toHaveLength(3));
  });

  it('aborts the running request on unmount', async () => {
    let signal: AbortSignal | undefined;
    request.mockImplementation((_c, _p, options) => {
      signal = options?.signal;
      return new Promise<never>(() => {});
    });
    const { unmount } = await renderHook(() => useLibrary(movies));
    await unmount();
    expect(signal?.aborted).toBe(true);
  });

  // Regression: the next page used to start at the merged list's length.
  it('pages by server offset, even when a page repeats items', async () => {
    serve(120);
    const { result } = await renderHook(() => useLibrary(movies));
    await waitFor(() => expect(result.current.items).toHaveLength(50));
    // The library shifted: page two starts with the last five of page one.
    request.mockImplementationOnce(
      () => Promise.resolve({ Items: range(45, 95), TotalRecordCount: 120 }) as Promise<never>,
    );
    await act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.items).toHaveLength(95));
    await act(() => result.current.loadMore());
    expect(request).toHaveBeenLastCalledWith(
      expect.anything(),
      '/Items',
      expect.objectContaining({ query: expect.objectContaining({ startIndex: 100 }) }),
    );
  });

  // Regression: a signed-out account used to show loading forever.
  it('is idle, not loading, without a signed-in account', async () => {
    jest.spyOn(session, 'connectionFor').mockReturnValue(null);
    const { result } = await renderHook(() => useLibrary(movies));
    expect(result.current).toMatchObject({ items: [], loading: false, hasMore: false });
    await act(() => result.current.refresh());
    await act(() => result.current.loadMore());
    expect(result.current.loading).toBe(false);
    expect(request).not.toHaveBeenCalled();
  });

  // Regression: a total larger than what the server returns used to request the same empty page forever.
  it('stops at an empty page even if the total says there is more', async () => {
    serve(120);
    const { result } = await renderHook(() => useLibrary(movies));
    await waitFor(() => expect(result.current.items).toHaveLength(50));
    request.mockImplementationOnce(() => Promise.resolve({ Items: [], TotalRecordCount: 120 }) as Promise<never>);
    await act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.hasMore).toBe(false));
    await act(() => result.current.loadMore());
    expect(request).toHaveBeenCalledTimes(2);
    expect(result.current.items).toHaveLength(50);
  });

  // Regression: Retry after a failed refresh used to load the next page (or nothing) instead of refreshing.
  it('retries whatever failed: a failed refresh refreshes again', async () => {
    serve(11);
    const { result } = await renderHook(() => useLibrary(movies));
    await waitFor(() => expect(result.current.items).toHaveLength(11));
    request.mockImplementationOnce(() => Promise.reject(new ApiError('network')));
    await act(() => result.current.refresh());
    await waitFor(() => expect(result.current.error?.kind).toBe('network'));
    expect(result.current.items).toHaveLength(11);
    serve(12);
    await act(() => result.current.retry());
    await waitFor(() => expect(result.current.total).toBe(12));
    expect(request).toHaveBeenLastCalledWith(
      expect.anything(),
      '/Items',
      expect.objectContaining({ query: expect.objectContaining({ startIndex: 0 }) }),
    );
  });

  // Regression: onEndReached re-fires when the error footer changes the list height, which retried in a loop.
  it('does not load more while an error shows; only retry does', async () => {
    serve(120);
    const { result } = await renderHook(() => useLibrary(movies));
    await waitFor(() => expect(result.current.items).toHaveLength(50));
    request.mockImplementationOnce(() => Promise.reject(new ApiError('network')));
    await act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.error?.kind).toBe('network'));
    await act(() => result.current.loadMore());
    await act(() => result.current.loadMore());
    expect(request).toHaveBeenCalledTimes(2);
    await act(() => result.current.retry());
    await waitFor(() => expect(result.current.items).toHaveLength(100));
    expect(request).toHaveBeenCalledTimes(3);
  });
});

describe('usePagedItems without a list', () => {
  it('stays idle for a null id', async () => {
    const { result } = await renderHook(() => usePagedItems(null, (start) => listItems(movies, 50, start)));
    expect(result.current).toMatchObject({ items: [], loading: false, hasMore: false });
    expect(request).not.toHaveBeenCalled();
  });
});

describe('usePagedItems and watched / favourite', () => {
  it('shows a change in the loaded items at once, without refetching', async () => {
    serve(120);
    jest.spyOn(session, 'getSession').mockImplementation(() => ({ accounts: [anna, ben], active }));
    jest.spyOn(api, 'setPlayed').mockResolvedValue({ PlaybackPositionTicks: 0, Played: true });
    const { result } = await renderHook(() => useLibrary(movies));
    await waitFor(() => expect(result.current.items).toHaveLength(50));
    const before = result.current.items;
    const calls = request.mock.calls.length;
    await act(() => setUserFlag(item(3), 'played', true).then(() => undefined));
    expect(result.current.items[3].UserData?.Played).toBe(true);
    expect(result.current.items[4]).toBe(before[4]);
    expect(request.mock.calls.length).toBe(calls);
  });

  it('applies a change made while a page loads to that page too', async () => {
    serve(120);
    jest.spyOn(session, 'getSession').mockImplementation(() => ({ accounts: [anna, ben], active }));
    jest.spyOn(api, 'setPlayed').mockResolvedValue({ PlaybackPositionTicks: 0, Played: true });
    hold = true;
    const { result } = await renderHook(() => useLibrary(movies));
    await act(() => setUserFlag(item(3), 'played', true).then(() => undefined));
    await release();
    await waitFor(() => expect(result.current.items).toHaveLength(50));
    expect(result.current.items[3].UserData?.Played).toBe(true);
  });
});
