// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render as rtlRender, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { Alert, type AlertButton } from 'react-native';

import * as api from '@/api';
import { ApiError, type BaseItemDto, type RequestOptions } from '@/api';
import SeriesDetail from '@/app/series/[id]';
import { ToastProvider } from '@/components/Toast';
import * as session from '@/session';

const render = (ui: ReactElement) => rtlRender(<ToastProvider>{ui}</ToastProvider>);

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useLocalSearchParams: jest.fn(),
  Stack: { Screen: ({ options }: { options?: { headerRight?: () => unknown } }) => options?.headerRight?.() ?? null },
}));
const { router, useLocalSearchParams } = jest.requireMock<{
  router: { push: jest.Mock };
  useLocalSearchParams: jest.Mock;
}>('expo-router');

const server = { id: 'srv', url: 'https://jf.example.com', name: 'Home server', version: '12.1.0' };
let seq = 0;
const request = jest.spyOn(api, 'request');

const SHOW = '2f2b4d74c89506a4e27483ec91db59e2';
const show: BaseItemDto = {
  Id: SHOW,
  Name: 'Test Show',
  Type: 'Series',
  ProductionYear: 2019,
  Status: 'Ended',
  EndDate: '2023-05-28T00:00:00Z',
  ChildCount: 3,
  Genres: ['Drama'],
  Overview: 'A show about tests.',
  People: [{ Id: 'a', Name: 'Halina Reijn', Role: 'Sintel', Type: 'Actor' }],
};
const specials: BaseItemDto = { Id: 'sp', Name: 'Specials', Type: 'Season', IndexNumber: 0, SeriesId: SHOW };
const s1: BaseItemDto = { Id: 'season-1', Name: 'Season 1', Type: 'Season', IndexNumber: 1, SeriesId: SHOW };
const s2: BaseItemDto = { Id: 'season-2', Name: 'Season 2', Type: 'Season', IndexNumber: 2, SeriesId: SHOW };

function episode(season: number, n: number, extra: Partial<BaseItemDto> = {}): BaseItemDto {
  return {
    Id: `ep-${season}-${n}`,
    Name: `Chapter ${n}`,
    Type: 'Episode',
    IndexNumber: n,
    ParentIndexNumber: season,
    SeasonId: `season-${season}`,
    SeriesId: SHOW,
    SeriesName: 'Test Show',
    RunTimeTicks: 27_000_000_000,
    ImageTags: { Primary: `still-${season}-${n}` },
    UserData: { PlaybackPositionTicks: 0, Played: false },
    ...extra,
  };
}

const items = (...list: BaseItemDto[]) => ({ Items: list, TotalRecordCount: list.length });

// Responses by route; an ApiError rejects.
let routes: Record<string, unknown>;

function routeOf(path: string, options?: RequestOptions) {
  const q = options?.query;
  if (path.endsWith('/Episodes')) return `episodes:${String(q?.seasonId)}`;
  if (path === '/Shows/NextUp') return 'nextup';
  if (path.endsWith('/Seasons')) return 'seasons';
  if (path.endsWith('/Similar')) return 'similar';
  return path;
}

function calls(route: string) {
  return request.mock.calls.filter(([, path, options]) => routeOf(path, options) === route).length;
}

beforeEach(() => {
  jest.clearAllMocks();
  // A new account per test: the useFetch cache outlives a test, and accounts never share entries.
  const account = { id: `srv.u${++seq}`, server, userId: `u${seq}`, userName: 'anna', deviceId: 'dev' };
  jest.spyOn(session, 'useSession').mockImplementation(() => ({ accounts: [account], active: account }));
  jest.spyOn(session, 'getSession').mockImplementation(() => ({ accounts: [account], active: account }));
  jest.spyOn(session, 'connectionFor').mockImplementation((a) => ({
    baseUrl: a.server.url,
    deviceId: a.deviceId,
    token: 'tok-secret',
    accountId: a.id,
  }));
  useLocalSearchParams.mockReturnValue({ id: SHOW });
  routes = {
    [`/Items/${SHOW}`]: show,
    seasons: items(specials, s1, s2),
    nextup: items(episode(2, 2)),
    'episodes:season-1': items(episode(1, 1, { UserData: { PlaybackPositionTicks: 0, Played: true } }), episode(1, 2)),
    'episodes:season-2': items(episode(2, 1, { UserData: { PlaybackPositionTicks: 0, Played: true } }), episode(2, 2)),
    similar: items(),
  };
  request.mockImplementation((_conn, path, options) => {
    const reply = routes[routeOf(path, options)];
    return (reply instanceof Error ? Promise.reject(reply) : Promise.resolve(reply)) as Promise<never>;
  });
});

// The episode FlatList renders more cells on a timer (50 ms batches). Let it run inside act before the test ends, else
// on a busy machine it fires between steps and React warns about an update outside act.
afterEach(async () => {
  await act(() => new Promise((resolve) => setTimeout(resolve, 100)));
});

describe('SeriesDetail', () => {
  it('shows the series with years, real seasons only, genre line and overview', async () => {
    await render(<SeriesDetail />);
    expect(await screen.findByRole('header', { name: 'Test Show' })).toBeOnTheScreen();
    expect(screen.getByText('TV Show · Drama')).toBeOnTheScreen();
    // ChildCount says 3 (Specials included); the season list has 2 real seasons.
    expect(await screen.findByLabelText('2019-2023, 2 Seasons')).toBeOnTheScreen();
    expect(screen.getByText('A show about tests.')).toBeOnTheScreen();
    expect(screen.getByLabelText('Halina Reijn, Sintel')).toBeOnTheScreen();
  });

  it('opens the season of the next episode, names it under Play and plays it', async () => {
    await render(<SeriesDetail />);
    expect(await screen.findByRole('button', { name: 'Season 2' })).toBeOnTheScreen();
    expect(await screen.findByText('S2, E2 · Chapter 2')).toBeOnTheScreen();
    // The cards start at the next episode.
    expect(screen.getByRole('button', { name: 'Episode 2, Chapter 2' })).toBeOnTheScreen();
    expect(calls('episodes:season-1')).toBe(0);
    await fireEvent.press(screen.getByRole('button', { name: 'Play Episode' }));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/player', params: { id: 'ep-2-2', start: '0' } });
    expect(screen.queryByRole('button', { name: 'Play from Start' })).toBeNull();
  });

  it('downloads the shown season from the header (placeholder)', async () => {
    await render(<SeriesDetail />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Download Season 2' }));
    expect(await screen.findByText('Coming in a later build.')).toBeOnTheScreen();
  });

  it('resumes a started next episode, with Play from Start', async () => {
    routes.nextup = items(episode(2, 2, { UserData: { PlaybackPositionTicks: 6_000_000_000, Played: false } }));
    await render(<SeriesDetail />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Resume Episode' }));
    expect(router.push).toHaveBeenLastCalledWith({ pathname: '/player', params: { id: 'ep-2-2', start: '600' } });
    await fireEvent.press(screen.getByRole('button', { name: 'Play from Start' }));
    expect(router.push).toHaveBeenLastCalledWith({ pathname: '/player', params: { id: 'ep-2-2', start: '0' } });
  });

  it('plays the first episode of the first real season when everything is watched', async () => {
    routes.nextup = items();
    await render(<SeriesDetail />);
    expect(await screen.findByRole('button', { name: 'Season 1' })).toBeOnTheScreen();
    expect(await screen.findByText('S1, E1 · Chapter 1')).toBeOnTheScreen();
  });

  it('switches season from the season menu, which shows watch state', async () => {
    await render(<SeriesDetail />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Season 2' }));
    expect(screen.getByRole('menuitem', { name: 'Season 2', selected: true })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Season 1' }));
    expect(await screen.findByRole('button', { name: 'Season 1' })).toBeOnTheScreen();
    expect(await screen.findByRole('button', { name: /^Episode 2, Chapter 2/ })).toBeOnTheScreen();
    expect(calls('episodes:season-1')).toBeGreaterThan(0);
  });

  it('shows a single season as a heading, not a menu', async () => {
    routes.seasons = items(s1);
    routes.nextup = items(episode(1, 2));
    await render(<SeriesDetail />);
    expect(await screen.findByRole('header', { name: 'Season 1' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Season 1' })).toBeNull();
    expect(await screen.findByLabelText('2019-2023, 1 Season')).toBeOnTheScreen();
  });

  it('plays an episode from its card, and opens its detail on tap', async () => {
    await render(<SeriesDetail />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Play Episode 2, Chapter 2' }));
    expect(router.push).toHaveBeenLastCalledWith({ pathname: '/player', params: { id: 'ep-2-2', start: '0' } });
    await fireEvent.press(screen.getByRole('button', { name: 'Episode 2, Chapter 2' }));
    expect(router.push).toHaveBeenLastCalledWith({ pathname: '/item/[id]', params: { id: 'ep-2-2' } });
  });

  it('opens episode actions from ⋯ and long press; labels follow the state, Download is a placeholder', async () => {
    const started = episode(2, 1, { UserData: { PlaybackPositionTicks: 6_000_000_000, Played: false } });
    routes.nextup = items(started);
    routes['episodes:season-2'] = items(
      started,
      episode(2, 2, { UserData: { PlaybackPositionTicks: 0, Played: true } }),
    );
    await render(<SeriesDetail />);
    await fireEvent.press(await screen.findByRole('button', { name: 'More for Episode 1, Chapter 1' }));
    expect(screen.getAllByText('S2, E1 · Chapter 1').length).toBe(2); // line under Play + menu title
    expect(screen.getByRole('menuitem', { name: 'Mark as Watched' })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Play from Start' }));
    expect(router.push).toHaveBeenLastCalledWith({ pathname: '/player', params: { id: 'ep-2-1', start: '0' } });

    await fireEvent(screen.getByRole('button', { name: 'Episode 2, Chapter 2, watched' }), 'longPress');
    expect(screen.getByText('S2, E2 · Chapter 2')).toBeOnTheScreen();
    expect(screen.getByRole('menuitem', { name: 'Mark as Unwatched' })).toBeOnTheScreen();
    expect(screen.queryByRole('menuitem', { name: 'Play from Start' })).toBeNull();
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Download Episode' }));
    expect(await screen.findByText('Coming in a later build.')).toBeOnTheScreen();
  });

  it('retries a season that failed to load', async () => {
    routes['episodes:season-2'] = new ApiError('network');
    await render(<SeriesDetail />);
    expect(await screen.findByText("Couldn't reach the server.")).toBeOnTheScreen();
    routes['episodes:season-2'] = items(episode(2, 1));
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('button', { name: 'Episode 1, Chapter 1' })).toBeOnTheScreen();
  });

  it('says so when the series is gone, and never loads an empty id', async () => {
    routes[`/Items/${SHOW}`] = new ApiError('http', 404);
    await render(<SeriesDetail />);
    expect(await screen.findByText("This series isn't available.")).toBeOnTheScreen();

    request.mockClear();
    useLocalSearchParams.mockReturnValue({ id: '' });
    await render(<SeriesDetail />);
    expect(screen.getAllByText("This series isn't available.").length).toBeGreaterThan(0);
    expect(request).not.toHaveBeenCalled();
  });

  it('marks an episode watched from its menu; the card shows it at once', async () => {
    const setPlayed = jest.spyOn(api, 'setPlayed').mockReturnValue(new Promise(() => {}));
    await render(<SeriesDetail />);
    await fireEvent.press(await screen.findByRole('button', { name: 'More for Episode 2, Chapter 2' }));
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Mark as Watched' }));
    expect(await screen.findByRole('button', { name: 'Episode 2, Chapter 2, watched' })).toBeOnTheScreen();
    expect(setPlayed).toHaveBeenCalledWith(expect.anything(), 'ep-2-2', true);
  });

  it('marks the shown season from the season menu, every episode in it at once', async () => {
    const setPlayed = jest.spyOn(api, 'setPlayed').mockReturnValue(new Promise(() => {}));
    await render(<SeriesDetail />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Season 2' }));
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Mark Season 2 as Watched' }));
    expect(setPlayed).toHaveBeenCalledWith(expect.anything(), 'season-2', true);
    expect(await screen.findByRole('button', { name: 'Episode 2, Chapter 2, watched' })).toBeOnTheScreen();
  });

  it('asks before unwatching the whole show (it clears progress)', async () => {
    routes[`/Items/${SHOW}`] = { ...show, UserData: { PlaybackPositionTicks: 0, Played: true } };
    const setPlayed = jest.spyOn(api, 'setPlayed').mockReturnValue(new Promise(() => {}));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await render(<SeriesDetail />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Mark as unwatched', selected: true }));
    expect(alert).toHaveBeenCalledWith(`Mark ${show.Name} as unwatched?`, expect.any(String), expect.any(Array));
    expect(setPlayed).not.toHaveBeenCalled();
    const buttons = alert.mock.calls[0][2] as AlertButton[];
    await act(async () => buttons.find((b) => b.style === 'destructive')?.onPress?.());
    expect(setPlayed).toHaveBeenCalledWith(expect.anything(), SHOW, false);
  });

  it('adds an episode to favourites from its menu; its card shows it', async () => {
    jest.spyOn(api, 'setFavourite').mockReturnValue(new Promise(() => {}));
    await render(<SeriesDetail />);
    await fireEvent.press(await screen.findByRole('button', { name: 'More for Episode 2, Chapter 2' }));
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Add to Favourites' }));
    expect(await screen.findByRole('button', { name: 'Episode 2, Chapter 2, favourite' })).toBeOnTheScreen();
  });
});
