// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render as rtlRender, screen } from '@testing-library/react-native';
import { Paths } from 'expo-file-system';
import type { ReactElement } from 'react';
import { Alert, type AlertButton } from 'react-native';

import * as api from '@/api';
import { ApiError, type BaseItemDto, type RequestOptions } from '@/api';
import SeriesDetail from '@/app/series/[id]';
import { ItemMenuProvider } from '@/components/ItemMenu';
import { ToastProvider } from '@/components/Toast';
import * as downloads from '@/downloads';
import { initDownloads } from '@/downloads';
import * as session from '@/session';

import NativeDownloads from '../../modules/downloads';

const render = (ui: ReactElement) =>
  rtlRender(
    <ToastProvider>
      <ItemMenuProvider>{ui}</ItemMenuProvider>
    </ToastProvider>,
  );

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

const GB = 1024 ** 3;
const native = jest.mocked(NativeDownloads);
const emitNative = (event: string, payload: object) =>
  native.addListener.mock.calls.filter(([e]) => e === event).forEach(([, fn]) => (fn as (p: object) => void)(payload));
const withFile = (ep: BaseItemDto): BaseItemDto => ({
  ...ep,
  MediaSources: [{ Id: ep.Id, Container: 'mkv', Size: GB }],
});

const items = (...list: BaseItemDto[]) => ({ Items: list, TotalRecordCount: list.length });

// Responses by route; an ApiError rejects.
let routes: Record<string, unknown>;

function routeOf(path: string, options?: RequestOptions) {
  const q = options?.query;
  if (path.endsWith('/Episodes'))
    return `${q?.fields?.toString().includes('MediaSources') ? 'files' : 'episodes'}:${String(q?.seasonId)}`;
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
    '/Users/Me': { Id: 'u', Name: 'anna', Policy: { EnableContentDownloading: true } },
  };
  jest.spyOn(Paths, 'availableDiskSpace', 'get').mockReturnValue(500 * GB);
  jest.spyOn(Paths, 'totalDiskSpace', 'get').mockReturnValue(1000 * GB);
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
    expect(await screen.findByText('2019-2023 · 2 Seasons')).toBeOnTheScreen();
    expect(screen.getByText('A show about tests.')).toBeOnTheScreen();
    expect(screen.getByLabelText('Halina Reijn, Sintel')).toBeOnTheScreen();
  });

  it('opens the season of the next episode, names it under Play and plays it', async () => {
    await render(<SeriesDetail />);
    expect(await screen.findByRole('button', { name: 'Season 2', selected: true })).toBeOnTheScreen();
    // The cards start at the next episode.
    expect(screen.getByRole('button', { name: 'Episode 2, Chapter 2' })).toBeOnTheScreen();
    expect(calls('episodes:season-1')).toBe(0);
    expect(screen.getByText('S2, E2')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Play Season 2, Episode 2' }));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/player', params: { id: 'ep-2-2', start: '0' } });
    expect(screen.queryByRole('button', { name: 'Play from Start' })).toBeNull();
  });

  it('downloads the shown season from the header as one batch, then shows its ring', async () => {
    routes['files:season-2'] = items(withFile(episode(2, 1)), withFile(episode(2, 2)));
    await render(<SeriesDetail />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Download Season 2' }));
    expect(native.enqueue).toHaveBeenCalledTimes(1);
    expect(native.enqueue.mock.calls[0][0].map((i) => i.url)).toEqual([
      'https://jf.example.com/Items/ep-2-1/Download',
      'https://jf.example.com/Items/ep-2-2/Download',
    ]);
    await fireEvent.press(await screen.findByRole('button', { name: 'Downloading' }));
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Pause Download' }));
    expect(native.pause).toHaveBeenCalledTimes(2);
  });

  it('says the account may not download when the season lookup is refused (403)', async () => {
    routes['files:season-2'] = new ApiError('http', 403);
    await render(<SeriesDetail />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Download Season 2' }));
    expect(await screen.findByText("This account isn't allowed to download.")).toBeOnTheScreen();
    expect(native.enqueue).not.toHaveBeenCalled();
  });

  it('says so when the season fails to load for download', async () => {
    routes['files:season-2'] = new ApiError('network');
    await render(<SeriesDetail />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Download Season 2' }));
    expect(
      await screen.findByText("Couldn't start the download. Check the connection and try again."),
    ).toBeOnTheScreen();
    expect(native.enqueue).not.toHaveBeenCalled();
  });

  it('resumes a started next episode, with Play from Start', async () => {
    routes.nextup = items(episode(2, 2, { UserData: { PlaybackPositionTicks: 6_000_000_000, Played: false } }));
    await render(<SeriesDetail />);
    await fireEvent.press(await screen.findByRole('button', { name: /^Resume Season 2, Episode 2/ }));
    expect(router.push).toHaveBeenLastCalledWith({ pathname: '/player', params: { id: 'ep-2-2', start: '600' } });
    await fireEvent.press(screen.getByRole('button', { name: 'Play from Start' }));
    expect(router.push).toHaveBeenLastCalledWith({ pathname: '/player', params: { id: 'ep-2-2', start: '0' } });
  });

  it('plays the first episode of the first real season when everything is watched', async () => {
    routes.nextup = items();
    await render(<SeriesDetail />);
    expect(await screen.findByRole('button', { name: 'Season 1', selected: true })).toBeOnTheScreen();
    expect(await screen.findByText('S1, E1')).toBeOnTheScreen();
  });

  it('switches season with one tap on its pill', async () => {
    await render(<SeriesDetail />);
    expect(await screen.findByRole('button', { name: 'Season 2', selected: true })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Season 1' }));
    expect(await screen.findByRole('button', { name: 'Season 1', selected: true })).toBeOnTheScreen();
    expect(await screen.findByRole('button', { name: /^Episode 2, Chapter 2/ })).toBeOnTheScreen();
    expect(calls('episodes:season-1')).toBeGreaterThan(0);
  });

  it('shows a single season as one pill, its ⋯ beside it', async () => {
    routes.seasons = items(s1);
    routes.nextup = items(episode(1, 2));
    await render(<SeriesDetail />);
    expect(await screen.findByRole('button', { name: 'Season 1', selected: true })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'More for Season 1' })).toBeOnTheScreen();
    expect(await screen.findByText('2019-2023 · 1 Season')).toBeOnTheScreen();
  });

  it('plays an episode from its card, and opens its detail on tap', async () => {
    await render(<SeriesDetail />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Play Episode 2, Chapter 2' }));
    expect(router.push).toHaveBeenLastCalledWith({ pathname: '/player', params: { id: 'ep-2-2', start: '0' } });
    await fireEvent.press(screen.getByRole('button', { name: 'Episode 2, Chapter 2' }));
    expect(router.push).toHaveBeenLastCalledWith({ pathname: '/item/[id]', params: { id: 'ep-2-2' } });
  });

  it('opens episode actions from ⋯ and long press; labels follow the state, Download starts it', async () => {
    const started = episode(2, 1, { UserData: { PlaybackPositionTicks: 6_000_000_000, Played: false } });
    routes.nextup = items(started);
    routes['episodes:season-2'] = items(
      started,
      episode(2, 2, { UserData: { PlaybackPositionTicks: 0, Played: true } }),
    );
    await render(<SeriesDetail />);
    await fireEvent.press(await screen.findByRole('button', { name: 'More for Episode 1, Chapter 1' }));
    expect(screen.getByText('S2, E1 · Chapter 1')).toBeOnTheScreen(); // the menu's title
    expect(screen.getByRole('menuitem', { name: 'Mark as Watched' })).toBeOnTheScreen();
    expect(screen.getByRole('menuitem', { name: 'Resume' })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Play from Start' }));
    expect(router.push).toHaveBeenLastCalledWith({ pathname: '/player', params: { id: 'ep-2-1', start: '0' } });

    await fireEvent(screen.getByRole('button', { name: 'Episode 2, Chapter 2, watched' }), 'longPress');
    expect(screen.getByText('S2, E2 · Chapter 2')).toBeOnTheScreen();
    expect(screen.getByRole('menuitem', { name: 'Mark as Unwatched' })).toBeOnTheScreen();
    expect(screen.queryByRole('menuitem', { name: 'Play from Start' })).toBeNull();
    expect(screen.getByRole('menuitem', { name: 'Play' })).toBeOnTheScreen();
    // A card's episode comes without its files: looked up first.
    routes['/Items/ep-2-2'] = withFile(episode(2, 2));
    routes['files:season-2'] = items(withFile(started), withFile(episode(2, 2)));
    initDownloads(); // native event listeners (cleared mocks: register them inside this test)
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Download' }));
    // Something of the season is downloading: the header shows its ring.
    expect(await screen.findByRole('button', { name: 'Downloading' })).toBeOnTheScreen();
    const [[[{ id, url }]]] = native.enqueue.mock.calls;
    expect(url).toBe('https://jf.example.com/Items/ep-2-2/Download');
    await fireEvent(screen.getByRole('button', { name: 'Episode 2, Chapter 2, watched' }), 'longPress');
    expect(screen.getByRole('menuitem', { name: 'Pause Download' })).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Cancel'));

    // One of two episodes downloaded: the season offers Download (the rest), the episode Delete Download.
    await act(() => emitNative('done', { id }));
    expect(await screen.findByRole('button', { name: 'Download Season 2' })).toBeOnTheScreen();
    await fireEvent(screen.getByRole('button', { name: 'Episode 2, Chapter 2, watched' }), 'longPress');
    expect(screen.getByRole('menuitem', { name: 'Delete Download' })).toBeOnTheScreen();
  });

  it('retries a season that failed to load', async () => {
    routes['episodes:season-2'] = new ApiError('network');
    await render(<SeriesDetail />);
    expect(
      await screen.findByText("Couldn't reach the server. Check your connection and try again."),
    ).toBeOnTheScreen();
    routes['episodes:season-2'] = items(episode(2, 1));
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('button', { name: 'Episode 1, Chapter 1' })).toBeOnTheScreen();
  });

  it('shows a placeholder, then an error with Retry when offline', async () => {
    let fail!: () => void;
    routes[`/Items/${SHOW}`] = new Promise((_, reject) => (fail = () => reject(new ApiError('network'))));
    await render(<SeriesDetail />);
    expect(screen.getByTestId('detail-placeholder')).toBeOnTheScreen();
    await act(async () => fail());
    expect(await screen.findByText("Check your connection, or watch something you've downloaded.")).toBeOnTheScreen();
    routes[`/Items/${SHOW}`] = show;
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('header', { name: show.Name })).toBeOnTheScreen();
  });

  it('seasons: placeholders while loading, an error with Retry, or what no seasons means', async () => {
    routes.seasons = new ApiError('http', 500);
    await render(<SeriesDetail />);
    expect(await screen.findByText('The server ran into a problem. Try again in a moment.')).toBeOnTheScreen();
    routes.seasons = items();
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    expect(
      await screen.findByText('No episodes on the server yet. Add them in Jellyfin, then come back.'),
    ).toBeOnTheScreen();
  });

  it('episode placeholders until Next Up picks the season to open', async () => {
    routes.nextup = new Promise(() => {});
    await render(<SeriesDetail />);
    expect(await screen.findByLabelText('Loading episodes')).toBeOnTheScreen();
  });

  it('an empty season says so', async () => {
    routes.nextup = items();
    routes['episodes:season-1'] = items();
    await render(<SeriesDetail />);
    expect(await screen.findByText('No episodes in this season yet.')).toBeOnTheScreen();
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

  it('marks the shown season from its ⋯ menu, every episode in it at once', async () => {
    const setPlayed = jest.spyOn(api, 'setPlayed').mockReturnValue(new Promise(() => {}));
    await render(<SeriesDetail />);
    await fireEvent.press(await screen.findByRole('button', { name: 'More for Season 2' }));
    // The season's download sits in the same menu (the sheet's title names the season).
    expect(screen.getByRole('menuitem', { name: 'Download' })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Mark Season 2 as Watched' }));
    expect(setPlayed).toHaveBeenCalledWith(expect.anything(), 'season-2', true);
    expect(await screen.findByRole('button', { name: 'Episode 2, Chapter 2, watched' })).toBeOnTheScreen();
  });

  it('asks before unwatching the whole show (it clears progress)', async () => {
    routes[`/Items/${SHOW}`] = { ...show, UserData: { PlaybackPositionTicks: 0, Played: true } };
    const setPlayed = jest.spyOn(api, 'setPlayed').mockReturnValue(new Promise(() => {}));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await render(<SeriesDetail />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Watched', selected: true }));
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

describe('SeriesDetail offline, with episodes downloaded', () => {
  const poster = 'file:///docs/downloads/a/e/poster.jpg';
  afterEach(() => {
    jest.mocked(downloads.savedItem).mockRestore();
  });

  it("shows the show's name and poster with a link to its downloaded episodes", async () => {
    jest
      .spyOn(downloads, 'savedItem')
      .mockReturnValue({ item: { Id: SHOW, Name: 'Test Show', Type: 'Series' }, art: poster });
    routes[`/Items/${SHOW}`] = new ApiError('network');
    await render(<SeriesDetail />);
    expect(await screen.findByText('Showing the details saved with the download.')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Test Show' })).toBeOnTheScreen();
    expect(screen.getByTestId('detail-backdrop').props.source).toEqual([expect.objectContaining({ uri: poster })]);
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    expect(calls('seasons')).toBe(0);
    await fireEvent.press(screen.getByRole('button', { name: 'Downloaded Episodes' }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/show-downloads/[id]',
      params: { id: SHOW, name: 'Test Show' },
    });
  });

  it('nothing downloaded: the error with Retry as before', async () => {
    jest.spyOn(downloads, 'savedItem').mockReturnValue(null);
    routes[`/Items/${SHOW}`] = new ApiError('network');
    await render(<SeriesDetail />);
    expect(await screen.findByText("Check your connection, or watch something you've downloaded.")).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeOnTheScreen();
  });
});
