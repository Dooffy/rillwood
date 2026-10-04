// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import * as api from '@/api';
import { ApiError, type BaseItemDto, type ItemsResult, type UserItemDataDto } from '@/api';
import * as session from '@/session';
import { invalidate, useFetch } from '@/useFetch';

import { setUserFlag, userFlagError } from './userData';

const server = { id: 'srv', url: 'https://jf.example.com', name: 'Home server', version: '12.1.0' };
const anna: session.Account = { id: 'srv.a', server, userId: 'a', userName: 'anna', deviceId: 'dev-a' };
let active: session.Account | null = anna;

const request = jest.spyOn(api, 'request');
const setPlayed = jest.spyOn(api, 'setPlayed');
const setFavourite = jest.spyOn(api, 'setFavourite');

const unseen: UserItemDataDto = { PlaybackPositionTicks: 0, Played: false, IsFavorite: false };
const film: BaseItemDto = {
  Id: 'film',
  Name: 'Sintel',
  Type: 'Movie',
  UserData: { ...unseen, PlaybackPositionTicks: 9e9 },
};

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Server copy of the film, as list and detail requests answer it. */
let serverFilm: BaseItemDto;

beforeEach(() => {
  active = anna;
  serverFilm = film;
  jest.spyOn(session, 'useSession').mockImplementation(() => ({ accounts: [anna], active }));
  jest.spyOn(session, 'getSession').mockImplementation(() => ({ accounts: [anna], active }));
  jest.spyOn(session, 'connectionFor').mockImplementation((a) => ({
    baseUrl: a.server.url,
    deviceId: a.deviceId,
    token: 'tok',
    accountId: a.id,
  }));
  request.mockReset();
  request.mockImplementation(
    (_c, path) =>
      Promise.resolve(path === '/Items' ? { Items: [serverFilm], TotalRecordCount: 1 } : serverFilm) as Promise<never>,
  );
  setPlayed.mockReset();
  setFavourite.mockReset();
});

afterEach(() => invalidate());

/** A list and a detail screen showing the film. */
async function screens() {
  const list = await renderHook(() => useFetch<ItemsResult>('/Items'));
  const detail = await renderHook(() => useFetch<BaseItemDto>('/Items/film'));
  await waitFor(() => expect(detail.result.current.data).toBeDefined());
  await waitFor(() => expect(list.result.current.data).toBeDefined());
  return { list: list.result, detail: detail.result };
}

describe('setUserFlag', () => {
  it('shows the change everywhere at once, then the server answer, then refetches', async () => {
    const { list, detail } = await screens();
    const answer = deferred<UserItemDataDto>();
    setPlayed.mockReturnValue(answer.promise);
    let done: Promise<ApiError | undefined> | undefined;
    await act(async () => {
      done = setUserFlag(film, 'played', true);
    });
    // Optimistic: watched, resume point gone, on both screens, before the server answers.
    expect(detail.current.data?.UserData).toMatchObject({ Played: true, PlaybackPositionTicks: 0 });
    expect(list.current.data?.Items[0].UserData?.Played).toBe(true);
    expect(setPlayed).toHaveBeenCalledWith(expect.objectContaining({ accountId: 'srv.a' }), 'film', true);
    const calls = request.mock.calls.length;
    serverFilm = { ...film, UserData: { ...unseen, Played: true, PlayCount: 1 } };
    await act(async () => {
      answer.resolve({ ...unseen, Played: true, PlayCount: 1 });
      await done;
    });
    await expect(done).resolves.toBeUndefined();
    expect(detail.current.data?.UserData).toEqual({ ...unseen, Played: true, PlayCount: 1 });
    // Everything refetches (Next Up, Continue Watching, counts).
    await waitFor(() => expect(request.mock.calls.length).toBeGreaterThan(calls));
  });

  it('puts the item back and returns the error when the server refuses', async () => {
    const { detail } = await screens();
    setFavourite.mockRejectedValue(new ApiError('network'));
    let error: ApiError | undefined;
    await act(async () => {
      error = await setUserFlag(film, 'favourite', true);
    });
    expect(error?.kind).toBe('network');
    expect(detail.current.data?.UserData).toEqual(film.UserData);
  });

  it('lets a quick second tap win over the first one’s late answer', async () => {
    const { detail } = await screens();
    const first = deferred<UserItemDataDto>();
    const second = deferred<UserItemDataDto>();
    setFavourite.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    await act(async () => {
      void setUserFlag(film, 'favourite', true);
      void setUserFlag(film, 'favourite', false);
    });
    await act(async () => second.resolve({ ...unseen, IsFavorite: false }));
    // The first call's late failure must not revert the second's result.
    await act(async () => first.reject(new ApiError('network')));
    expect(detail.current.data?.UserData?.IsFavorite).toBe(false);
  });

  it('does nothing signed out', async () => {
    active = null;
    await expect(setUserFlag(film, 'played', true)).resolves.toMatchObject({ kind: 'http', status: 401 });
    expect(setPlayed).not.toHaveBeenCalled();
  });

  it('restores each episode on a failed season change (not the opposite value)', async () => {
    const watched: BaseItemDto = {
      Id: 'e1',
      Name: 'E1',
      Type: 'Episode',
      SeasonId: 's1',
      UserData: { ...unseen, Played: true },
    };
    const started: BaseItemDto = {
      Id: 'e2',
      Name: 'E2',
      Type: 'Episode',
      SeasonId: 's1',
      UserData: { ...unseen, PlaybackPositionTicks: 5e9 },
    };
    request.mockImplementation(
      () => Promise.resolve({ Items: [watched, started], TotalRecordCount: 2 }) as Promise<never>,
    );
    const { result } = await renderHook(() => useFetch<ItemsResult>('/Shows/show/Episodes'));
    await waitFor(() => expect(result.current.data).toBeDefined());
    setPlayed.mockRejectedValue(new ApiError('network'));
    const season: BaseItemDto = { Id: 's1', Name: 'Season 1', Type: 'Season', UserData: unseen };
    await act(() => setUserFlag(season, 'played', false).then(() => undefined));
    expect(result.current.data?.Items.map((e) => e.UserData)).toEqual([watched.UserData, started.UserData]);
  });
});

describe('userFlagError', () => {
  it('says what failed, then what to do', () => {
    expect(userFlagError('played', true, new ApiError('network'))).toBe(
      "Couldn't mark as watched. Check your connection and try again.",
    );
    expect(userFlagError('played', false, new ApiError('http', 500))).toBe("Couldn't mark as unwatched. Try again.");
    expect(userFlagError('favourite', false, new ApiError('http', 404))).toBe(
      "Couldn't remove from favourites. Try again.",
    );
  });
});
