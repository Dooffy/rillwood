// SPDX-License-Identifier: GPL-3.0-or-later
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { RefreshControlProps } from 'react-native';

import * as api from '@/api';
import { ApiError, type BaseItemDto, type Query, type RequestOptions } from '@/api';
import Library from '@/app/(tabs)/library';
import * as session from '@/session';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
const { router } = jest.requireMock<{ router: { push: jest.Mock } }>('expo-router');

const server = { id: 'srv', url: 'https://jf.example.com', name: 'Home server', version: '12.1.0' };
let seq = 0;
const request = jest.spyOn(api, 'request');

// Fake library, trimmed from the dev servers.
const sintel: BaseItemDto = {
  Id: 'sintel',
  Name: 'Sintel',
  Type: 'Movie',
  ProductionYear: 2010,
  Genres: ['Animation'],
};
const show: BaseItemDto = { Id: 'show', Name: 'Test Show', Type: 'Series', ProductionYear: 2026 };
const ep = (n: number): BaseItemDto => ({
  Id: `ep-${n}`,
  Name: `Test Show S01E0${n}`,
  Type: 'Episode',
  IndexNumber: n,
  ParentIndexNumber: 1,
  SeriesId: 'show',
  SeriesName: 'Test Show',
});
const movie = (i: number): BaseItemDto => ({ Id: `m${i}`, Name: `Movie ${i}`, Type: 'Movie', ProductionYear: 2026 });
let items: BaseItemDto[];
let fail: ApiError | undefined;

/** Like the server: types, word-start search, genres, paging. */
function answer(q: Query) {
  const types = String(q.includeItemTypes).split(',');
  const term = q.searchTerm ? String(q.searchTerm).toLowerCase() : undefined;
  const matching = items.filter(
    (i) =>
      types.includes(i.Type) &&
      (!term ||
        i.Name.toLowerCase()
          .split(/\s+/)
          .some((w) => w.startsWith(term))) &&
      (!q.genres ||
        String(q.genres)
          .split('|')
          .some((g) => i.Genres?.includes(g))),
  );
  const start = Number(q.startIndex ?? 0);
  return { Items: matching.slice(start, start + Number(q.limit)), TotalRecordCount: matching.length };
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
  items = [sintel, show, ep(1), ep(2), ...Array.from({ length: 10 }, (_, i) => movie(i))];
  fail = undefined;
  request.mockImplementation((_conn, path, options?: RequestOptions) => {
    if (fail) {
      const error = fail;
      fail = undefined;
      return Promise.reject(error);
    }
    if (path === '/Genres')
      return Promise.resolve({ Items: [{ Name: 'Animation' }], TotalRecordCount: 0 }) as Promise<never>;
    return Promise.resolve(answer(options?.query ?? {})) as Promise<never>;
  });
});

const lastQuery = () => request.mock.calls.filter(([, p]) => p === '/Items').at(-1)?.[2]?.query;
const type = (text: string) => fireEvent.changeText(screen.getByLabelText('Movies, shows, episodes'), text);
/** Opens the Library on the Movies grid. */
async function renderMovies() {
  await render(<Library />);
  await fireEvent.press(screen.getByRole('button', { name: 'Movies', selected: false }));
}
const refreshControl = (testID: string) =>
  (screen.getByTestId(testID).props.refreshControl as { props: RefreshControlProps }).props;

describe('Library', () => {
  it('opens on All: a Movies row and a Shows row, one sorted request each', async () => {
    await render(<Library />);
    expect(screen.getByRole('button', { name: 'All', selected: true })).toBeOnTheScreen();
    expect(await screen.findByRole('button', { name: 'Movies, See All' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Shows, See All' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Episodes, See All' })).toBeNull();
    const queries = request.mock.calls.filter(([, p]) => p === '/Items').map(([, , o]) => o?.query);
    expect(queries).toEqual([
      expect.objectContaining({ includeItemTypes: 'Movie', sortBy: 'SortName', limit: 20 }),
      expect.objectContaining({ includeItemTypes: 'Series', sortBy: 'SortName', limit: 20 }),
    ]);
  });

  it('See All on Movies opens every movie as a grid, sorted by name', async () => {
    await render(<Library />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Movies, See All' }));
    expect(await screen.findByText('11 movies · by Name')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Movies', selected: true })).toBeOnTheScreen();
    expect(lastQuery()).toMatchObject({ includeItemTypes: 'Movie', sortBy: 'SortName', startIndex: 0, limit: 50 });
    await fireEvent.press(screen.getByRole('button', { name: 'Sintel, 2010' }));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/item/[id]', params: { id: 'sintel' } });
  });

  it('sorts from the sort menu', async () => {
    await renderMovies();
    await screen.findByText('11 movies · by Name');
    await fireEvent.press(screen.getByRole('button', { name: 'Sort: Name' }));
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Year' }));
    expect(await screen.findByText('11 movies · by Year')).toBeOnTheScreen();
    expect(lastQuery()).toMatchObject({ sortBy: 'ProductionYear,SortName', sortOrder: 'Descending' });
  });

  it('searches the type from the first letter, once typing pauses, ranked by the server', async () => {
    await renderMovies();
    await screen.findByText('11 movies · by Name');
    await type('s');
    await type('si');
    expect(await screen.findByText('1 movie')).toBeOnTheScreen();
    const searches = request.mock.calls.map(([, , o]) => o?.query?.searchTerm).filter(Boolean);
    expect(searches).toEqual(['si']);
    expect(lastQuery()).not.toHaveProperty('sortBy');
  });

  it('shows grouped rows for All, with See All selecting the type', async () => {
    await render(<Library />);
    await type('test');
    // Episodes come with the term (browsing All lists movies and shows only).
    await fireEvent.press(await screen.findByRole('button', { name: 'Episodes, See All' }));
    expect(screen.getByRole('button', { name: 'Episodes', selected: true })).toBeOnTheScreen();
    expect(await screen.findByText('2 episodes')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Test Show, S1:E2 · Test Show S01E02' }));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/item/[id]', params: { id: 'ep-2' } });
  });

  it('filters from the sheet with a live count, shows tags and removes them', async () => {
    await renderMovies();
    await screen.findByText('11 movies · by Name');
    await fireEvent.press(screen.getByRole('button', { name: 'Filters' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Animation', selected: false }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Show 1 Result' }));
    expect(await screen.findByText('1 movie · by Name')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Filters, 1 on' })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Remove Animation' }));
    expect(await screen.findByText('11 movies · by Name')).toBeOnTheScreen();
  });

  it('says what an empty list means', async () => {
    items = [];
    await render(<Library />);
    expect(await screen.findByText('Nothing on the server yet.')).toBeOnTheScreen();
    await type('zzzz');
    expect(await screen.findByText('No results for "zzzz".')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Movies', selected: false }));
    expect(await screen.findByText('No results for "zzzz".')).toBeOnTheScreen();
    await type('');
    expect(await screen.findByText('No movies on the server yet.')).toBeOnTheScreen();
  });

  it('shows recent searches while the empty field is focused; one searches again; Clear empties them', async () => {
    await renderMovies();
    await type('sintel');
    await screen.findByText('1 movie');
    await fireEvent.press(screen.getByRole('button', { name: 'Sintel, 2010' }));
    await type('');
    await fireEvent(screen.getByLabelText('Movies, shows, episodes'), 'focus');
    expect(screen.getByText('RECENT')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'sintel' }));
    expect(await screen.findByText('1 movie')).toBeOnTheScreen();
    await type('');
    await fireEvent.press(screen.getByRole('button', { name: 'Clear Recent' }));
    expect(await screen.findByText('11 movies · by Name')).toBeOnTheScreen();
  });

  it('loads the next page at the end of the grid', async () => {
    items = Array.from({ length: 120 }, (_, i) => movie(i));
    await renderMovies();
    expect(await screen.findByText('120 movies · by Name')).toBeOnTheScreen();
    await act(() => fireEvent(screen.getByTestId('library-list'), 'endReached'));
    await waitFor(() => expect(lastQuery()).toMatchObject({ startIndex: 50 }));
  });

  it('shows an error with Retry, and refreshes on pull', async () => {
    fail = new ApiError('network');
    await render(<Library />);
    expect(await screen.findByText("Couldn't reach the server.")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Movies, See All' }));
    expect(await screen.findByText('11 movies · by Name')).toBeOnTheScreen();
    items = [...items, movie(99)];
    await act(() => refreshControl('library-list').onRefresh?.());
    expect(await screen.findByText('12 movies · by Name')).toBeOnTheScreen();
  });

  it('searches All with one request per type, so a broad term cannot hide a type', async () => {
    await render(<Library />);
    await type('test');
    expect(await screen.findByRole('button', { name: 'Episodes, See All' })).toBeOnTheScreen();
    const types = request.mock.calls
      .filter(([, p, o]) => p === '/Items' && o?.query?.searchTerm === 'test')
      .map(([, , o]) => o?.query?.includeItemTypes);
    expect(types.sort()).toEqual(['Episode', 'Movie', 'Series']);
  });

  it('remembers what is typed on the search key, without waiting for the debounce', async () => {
    await renderMovies();
    const field = screen.getByLabelText('Movies, shows, episodes');
    await fireEvent.changeText(field, 'sintel');
    await fireEvent(field, 'submitEditing');
    await type('');
    await fireEvent(field, 'focus');
    expect(screen.getByRole('button', { name: 'sintel' })).toBeOnTheScreen();
  });

  it('keeps the search results when the sort changes (the server ranks them)', async () => {
    await renderMovies();
    await type('si');
    expect(await screen.findByText('1 movie')).toBeOnTheScreen();
    const before = request.mock.calls.length;
    await fireEvent.press(screen.getByRole('button', { name: 'Sort: Name' }));
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Year' }));
    expect(screen.getByText('1 movie')).toBeOnTheScreen();
    expect(request.mock.calls.length).toBe(before);
  });
});
