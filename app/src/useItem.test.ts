// SPDX-License-Identifier: GPL-3.0-or-later
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';

import * as api from '@/api';
import { ApiError, type BaseItemDto } from '@/api';
import * as downloads from '@/downloads';
import * as session from '@/session';
import * as fetching from '@/useFetch';
import { recordProgress } from '@/sync';

import { useItem } from './useItem';

const ID = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const server = { id: 'srv', url: 'https://jf.example.com', name: 'Home server', version: '12.1.0' };
const anna: session.Account = { id: 'srv.a', server, userId: 'a', userName: 'anna', deviceId: 'dev-a' };

const fromServer: BaseItemDto = { Id: ID, Name: 'Server copy', Type: 'Movie' };
const saved: downloads.SavedItem = { item: { Id: ID, Name: 'Saved copy', Type: 'Movie' }, art: 'file:///art.jpg' };

let answer: { data?: BaseItemDto; error?: ApiError } = {};
let offline = false;
const refresh = jest.fn();
const useFetch = jest.spyOn(fetching, 'useFetch');
const savedItem = jest.spyOn(downloads, 'savedItem');

beforeEach(() => {
  answer = {};
  offline = false;
  useFetch
    .mockReset()
    .mockImplementation(() => ({ ...answer, loading: !answer.data && !answer.error, refresh }) as never);
  savedItem.mockReset().mockReturnValue(null);
  jest.spyOn(api, 'useOffline').mockImplementation(() => offline);
  jest.spyOn(session, 'useSession').mockImplementation(() => ({ accounts: [anna], active: anna }));
});

describe('useItem', () => {
  it('loading, nothing saved: no item, no error', async () => {
    const { result } = await renderHook(() => useItem(ID));
    expect(result.current).toMatchObject({ item: undefined, saved: null, fromSaved: false, error: undefined });
    expect(useFetch).toHaveBeenCalledWith(`/Items/${ID}`);
  });

  it('loading online with a download: the saved copy is there, not standing in yet', async () => {
    savedItem.mockReturnValue(saved);
    const { result } = await renderHook(() => useItem(ID));
    expect(result.current).toMatchObject({ item: undefined, saved, fromSaved: false });
    expect(savedItem).toHaveBeenCalledWith(anna.id, ID);
  });

  it("the server's item wins over the saved copy", async () => {
    savedItem.mockReturnValue(saved);
    answer = { data: fromServer };
    const { result } = await renderHook(() => useItem(ID));
    expect(result.current).toMatchObject({ item: fromServer, fromSaved: false });
  });

  it('a failure (a 404 too) with a download: the saved copy, no error', async () => {
    savedItem.mockReturnValue(saved);
    answer = { error: new ApiError('http', 404) };
    const { result } = await renderHook(() => useItem(ID));
    expect(result.current).toMatchObject({ item: saved.item, fromSaved: true, error: undefined });
  });

  it('known offline with a download: the saved copy at once', async () => {
    savedItem.mockReturnValue(saved);
    offline = true;
    const { result } = await renderHook(() => useItem(ID));
    expect(result.current).toMatchObject({ item: saved.item, fromSaved: true });
  });

  it('the saved copy carries progress made offline, and follows it', async () => {
    savedItem.mockReturnValue(saved);
    offline = true;
    const { result } = await renderHook(() => useItem(ID));
    expect(result.current.item?.UserData).toBeUndefined();
    const at = '2026-10-14T10:00:00.000Z';
    const progress = { accountId: anna.id, itemId: ID, runtimeTicks: 0, startedAt: at };
    await act(async () => recordProgress({ ...progress, positionTicks: 600 }));
    expect(result.current.item?.UserData).toEqual({ PlaybackPositionTicks: 600, Played: false, LastPlayedDate: at });
    await act(async () => recordProgress({ ...progress, positionTicks: 900 }));
    expect(result.current.item?.UserData?.PlaybackPositionTicks).toBe(900);
    expect(result.current.saved?.item).toBe(result.current.item);
    expect(result.current.saved?.art).toBe(saved.art);
  });

  it('a failure with nothing saved: the error', async () => {
    const error = new ApiError('http', 500);
    answer = { error };
    const { result } = await renderHook(() => useItem(ID));
    expect(result.current).toMatchObject({ item: undefined, fromSaved: false, error });
  });

  it('an invalid id: no request, no disk read', async () => {
    const { result } = await renderHook(() => useItem('0000'));
    expect(useFetch).toHaveBeenCalledWith(null);
    expect(savedItem).not.toHaveBeenCalled();
    expect(result.current.item).toBeUndefined();
  });

  it('reads the disk once per id; a new recheck reads it again', async () => {
    const { rerender } = await renderHook(({ recheck }: { recheck: number }) => useItem(ID, recheck), {
      initialProps: { recheck: 0 },
    });
    await rerender({ recheck: 0 });
    expect(savedItem).toHaveBeenCalledTimes(1);
    await rerender({ recheck: 1 });
    expect(savedItem).toHaveBeenCalledTimes(2);
  });
});
