// SPDX-License-Identifier: GPL-3.0-or-later
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { RefreshControlProps } from 'react-native';

import * as api from '@/api';
import { ApiError, type BaseItemDto, type RequestOptions } from '@/api';
import Library from '@/app/(tabs)/library';
import * as session from '@/session';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
const { router } = jest.requireMock<{ router: { push: jest.Mock } }>('expo-router');

const server = { id: 'srv', url: 'https://jf.example.com', name: 'Home server', version: '12.1.0' };
let seq = 0;
const request = jest.spyOn(api, 'request');

const movie = (i: number): BaseItemDto => ({
  Id: `m${i}`,
  Name: `Movie ${String(i).padStart(3, '0')}`,
  Type: 'Movie',
  ProductionYear: 2000 + (i % 20),
  ImageTags: { Primary: `p${i}` },
  UserData: { PlaybackPositionTicks: 0, Played: i === 1 },
});
const show = (i: number): BaseItemDto => ({ Id: `s${i}`, Name: `Show ${i}`, Type: 'Series', ProductionYear: 2019 });

// Library answers: page of `total` items by startIndex; `fail` rejects the next request.
let movies = 0;
let shows = 0;
let fail: ApiError | undefined;

function query(options?: RequestOptions) {
  return options?.query ?? {};
}

beforeEach(() => {
  jest.clearAllMocks();
  const account = { id: `srv.u${++seq}`, server, userId: `u${seq}`, userName: 'anna', deviceId: 'dev' };
  jest.spyOn(session, 'useSession').mockImplementation(() => ({ accounts: [account], active: account }));
  jest.spyOn(session, 'getSession').mockImplementation(() => ({ accounts: [account], active: account }));
  jest.spyOn(session, 'connectionFor').mockImplementation((a) => ({
    baseUrl: a.server.url,
    deviceId: a.deviceId,
    token: 'tok-secret',
    accountId: a.id,
  }));
  movies = 11;
  shows = 1;
  fail = undefined;
  request.mockImplementation((_conn, _path, options) => {
    if (fail) {
      const error = fail;
      fail = undefined;
      return Promise.reject(error);
    }
    const q = query(options);
    const isShows = q.includeItemTypes === 'Series';
    const total = q.filters === 'IsUnplayed' ? (isShows ? shows : Math.max(0, movies - 1)) : isShows ? shows : movies;
    const start = Number(q.startIndex);
    const all = Array.from({ length: total }, (_, i) => (isShows ? show(i) : movie(i)));
    return Promise.resolve({
      Items: all.slice(start, start + Number(q.limit)),
      TotalRecordCount: total,
    }) as Promise<never>;
  });
});

const lastQuery = () => query(request.mock.calls.at(-1)?.[2]);

describe('Library', () => {
  it('shows every movie as a poster grid with the count, and opens one', async () => {
    await render(<Library />);
    expect(await screen.findByText('11 movies · by Name')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Movies' })).toBeOnTheScreen();
    expect(lastQuery()).toMatchObject({ includeItemTypes: 'Movie', sortBy: 'SortName', startIndex: 0, limit: 50 });
    expect(screen.getByRole('button', { name: 'Movie 001, 2001, watched' })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Movie 000, 2000' }));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/item/[id]', params: { id: 'm0' } });
  });

  it('switches to TV shows, which open the series screen', async () => {
    await render(<Library />);
    await screen.findByText('11 movies · by Name');
    await fireEvent.press(screen.getByRole('button', { name: 'Movies' }));
    expect(screen.getByRole('menuitem', { name: 'Movies', selected: true })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('menuitem', { name: 'TV Shows' }));
    expect(await screen.findByText('1 show · by Name')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'TV Shows' })).toBeOnTheScreen();
    expect(lastQuery()).toMatchObject({ includeItemTypes: 'Series' });
    await fireEvent.press(screen.getByRole('button', { name: 'Show 0, 2019' }));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/series/[id]', params: { id: 's0' } });
  });

  it('sorts from the sort menu', async () => {
    await render(<Library />);
    await screen.findByText('11 movies · by Name');
    await fireEvent.press(screen.getByRole('button', { name: 'Sort: Name' }));
    expect(screen.getByRole('menuitem', { name: 'Name', selected: true })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Date Added' }));
    expect(await screen.findByRole('button', { name: 'Sort: Date Added' })).toBeOnTheScreen();
    expect(await screen.findByText('11 movies · by Date Added')).toBeOnTheScreen();
    await waitFor(() => expect(lastQuery()).toMatchObject({ sortBy: 'DateCreated,SortName', sortOrder: 'Descending' }));
  });

  it('filters to unwatched, and says when everything is watched', async () => {
    await render(<Library />);
    await screen.findByText('11 movies · by Name');
    await fireEvent.press(screen.getByRole('button', { name: 'Filter: All' }));
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Unwatched only' }));
    expect(await screen.findByText('10 movies · Unwatched · by Name')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Filter: Unwatched only' })).toBeOnTheScreen();
    expect(lastQuery()).toMatchObject({ filters: 'IsUnplayed' });

    movies = 1;
    await fireEvent.press(screen.getByRole('button', { name: 'Movies' }));
    await fireEvent.press(screen.getByRole('menuitem', { name: 'TV Shows' }));
    await screen.findByText('1 show · Unwatched · by Name');
    await fireEvent.press(screen.getByRole('button', { name: 'TV Shows' }));
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Movies' }));
    expect(await screen.findByText('You have watched everything here.')).toBeOnTheScreen();
  });

  it('loads the next page at the end of the grid', async () => {
    movies = 120;
    await render(<Library />);
    expect(await screen.findByText('120 movies · by Name')).toBeOnTheScreen();
    await act(() => fireEvent(screen.getByTestId('library-grid'), 'endReached'));
    await waitFor(() => expect(lastQuery()).toMatchObject({ startIndex: 50 }));
  });

  it('shows placeholders, then an error with Retry when the first page fails', async () => {
    fail = new ApiError('network');
    await render(<Library />);
    expect(await screen.findByText("Couldn't reach the server.")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('11 movies · by Name')).toBeOnTheScreen();
  });

  it('keeps posters when a later page fails, and retries it from the footer', async () => {
    movies = 120;
    await render(<Library />);
    await screen.findByText('120 movies · by Name');
    fail = new ApiError('http', 500);
    await act(() => fireEvent(screen.getByTestId('library-grid'), 'endReached'));
    expect(await screen.findByText("Couldn't load this.")).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Movie 000, 2000' })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.queryByText("Couldn't load this.")).toBeNull());
    expect(lastQuery()).toMatchObject({ startIndex: 50 });
  });

  it('refreshes from the first page on pull', async () => {
    await render(<Library />);
    await screen.findByText('11 movies · by Name');
    movies = 12;
    const control = screen.getByTestId('library-grid').props.refreshControl as { props: RefreshControlProps };
    await act(() => control.props.onRefresh?.());
    expect(await screen.findByText('12 movies · by Name')).toBeOnTheScreen();
    expect(lastQuery()).toMatchObject({ startIndex: 0 });
  });

  // Regression: the footer's Retry after a failed pull to refresh did nothing once everything was loaded.
  it('retries a failed pull to refresh from the footer', async () => {
    await render(<Library />);
    await screen.findByText('11 movies · by Name');
    fail = new ApiError('network');
    const control = screen.getByTestId('library-grid').props.refreshControl as { props: RefreshControlProps };
    await act(() => control.props.onRefresh?.());
    expect(await screen.findByText("Couldn't reach the server.")).toBeOnTheScreen();
    movies = 12;
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('12 movies · by Name')).toBeOnTheScreen();
  });
});
