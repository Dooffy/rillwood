// SPDX-License-Identifier: GPL-3.0-or-later
// Apple TV series detail (screen draft 09): the shared hero playing the next episode, season pills that switch the
// shelf on focus, the episode shelf starting at the next episode, the TV placeholder while loading.
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { Platform } from 'react-native';

import * as api from '@/api';
import type { BaseItemDto, RequestOptions } from '@/api';
import SeriesDetail from '@/app/series/[id]';
import { ItemMenuProvider } from '@/components/ItemMenu';
import { ToastProvider } from '@/components/Toast';
import { TvMenuHost } from '@/components/tv/TvMenu';
import * as session from '@/session';

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useLocalSearchParams: jest.fn(),
  Stack: { Screen: () => null },
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
  ChildCount: 2,
  Genres: ['Drama'],
  Overview: 'A show about tests.',
  UserData: { PlaybackPositionTicks: 0, Played: false, IsFavorite: false },
};
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
    UserData: { PlaybackPositionTicks: 0, Played: false },
    ...extra,
  };
}
const items = (...list: BaseItemDto[]) => ({ Items: list, TotalRecordCount: list.length });

let routes: Record<string, unknown>;
function routeOf(path: string, options?: RequestOptions) {
  if (path.endsWith('/Episodes')) return `episodes:${String(options?.query?.seasonId)}`;
  if (path === '/Shows/NextUp') return 'nextup';
  if (path.endsWith('/Seasons')) return 'seasons';
  if (path.endsWith('/Similar')) return 'similar';
  return path;
}

const isTV = Object.getOwnPropertyDescriptor(Platform, 'isTV')!;
beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(Platform, 'isTV', { get: () => true, configurable: true });
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
    seasons: items(s1, s2),
    // In progress: 9m in (of 45m).
    nextup: items(episode(2, 2, { UserData: { PlaybackPositionTicks: 5_400_000_000, Played: false } })),
    'episodes:season-1': items(episode(1, 1, { UserData: { PlaybackPositionTicks: 0, Played: true } }), episode(1, 2)),
    'episodes:season-2': items(
      episode(2, 1, { UserData: { PlaybackPositionTicks: 0, Played: true } }),
      episode(2, 2, { UserData: { PlaybackPositionTicks: 5_400_000_000, Played: false } }),
    ),
    similar: items(),
  };
  request.mockImplementation(
    (_conn, path, options) => Promise.resolve(routes[routeOf(path, options)]) as Promise<never>,
  );
});
afterEach(async () => {
  // The episode FlatList renders more cells on a timer: let it run inside act.
  await act(() => new Promise((resolve) => setTimeout(resolve, 100)));
  Object.defineProperty(Platform, 'isTV', isTV);
});

const renderTv = () =>
  render(
    // As the root layout: the TV menu host around the item menu (its ActionSheet draws there).
    <ToastProvider>
      <TvMenuHost>
        <ItemMenuProvider>
          <SeriesDetail />
        </ItemMenuProvider>
      </TvMenuHost>
    </ToastProvider>,
  );

describe('Series detail on Apple TV', () => {
  it('the hero plays the next episode: "S2, E2" with time left, focus on it, Play from Start beside', async () => {
    await renderTv();
    expect(await screen.findByRole('header', { name: 'Test Show' })).toBeOnTheScreen();
    const play = await screen.findByRole('button', { name: 'Resume Season 2, Episode 2, 36m left' });
    expect(play.props.hasTVPreferredFocus).toBe(true);
    await fireEvent.press(play);
    expect(router.push).toHaveBeenLastCalledWith({ pathname: '/player', params: { id: 'ep-2-2', start: '540' } });
    await fireEvent.press(screen.getByRole('button', { name: 'Play from Start' }));
    expect(router.push).toHaveBeenLastCalledWith({ pathname: '/player', params: { id: 'ep-2-2', start: '0' } });
    // No phone header (download, back).
    expect(screen.queryByTestId('detail-hero')).toBeNull();
  });

  it("opens on Next Up's season; focusing another season's pill switches the shelf", async () => {
    await renderTv();
    const seasons = within(await screen.findByTestId('tv-seasons'));
    expect(seasons.getByRole('button', { name: 'Season 2' }).props.accessibilityState).toMatchObject({
      selected: true,
    });
    expect(await seasons.findByRole('button', { name: /^E2 · Chapter 2, 45m$/ })).toBeOnTheScreen();
    expect(screen.getByTestId('tv-episodes').props.initialScrollIndex).toBe(1);
    // Focus alone switches (no click).
    await fireEvent(seasons.getByRole('button', { name: 'Season 1' }), 'focus', { currentTarget: {} });
    expect(seasons.getByRole('button', { name: 'Season 1' }).props.accessibilityState).toMatchObject({
      selected: true,
    });
    expect(await seasons.findByRole('button', { name: 'E1 · Chapter 1, 45m, Watched' })).toBeOnTheScreen();
  });

  it('a click on an episode plays it (resumes if started, a watched one from the start)', async () => {
    await renderTv();
    await fireEvent.press(await screen.findByRole('button', { name: /^E2 · Chapter 2/ }));
    expect(router.push).toHaveBeenLastCalledWith({ pathname: '/player', params: { id: 'ep-2-2', start: '540' } });
    // Season 1's first episode, watched.
    await fireEvent(screen.getByRole('button', { name: 'Season 1' }), 'focus', { currentTarget: {} });
    await fireEvent.press(await screen.findByRole('button', { name: 'E1 · Chapter 1, 45m, Watched' }));
    expect(router.push).toHaveBeenLastCalledWith({ pathname: '/player', params: { id: 'ep-1-1', start: '0' } });
  });

  it('holding an episode opens its menu, with Episode Details for its own screen', async () => {
    await renderTv();
    await fireEvent(await screen.findByRole('button', { name: /^E2 · Chapter 2/ }), 'longPress');
    const menu = within(screen.getByTestId('tv-menu-card'));
    expect(menu.getByRole('button', { name: 'Play from Start' })).toBeOnTheScreen();
    expect(menu.getByRole('button', { name: 'Mark as Watched' })).toBeOnTheScreen();
    await fireEvent.press(menu.getByRole('button', { name: 'Episode Details' }));
    expect(router.push).toHaveBeenLastCalledWith({ pathname: '/item/[id]', params: { id: 'ep-2-2' } });
  });

  it('loading: the TV placeholder, not the tablet one', async () => {
    request.mockImplementation(() => new Promise(() => {}));
    await renderTv();
    expect(screen.getByTestId('tv-detail-placeholder')).toBeOnTheScreen();
    expect(screen.queryByTestId('detail-placeholder')).toBeNull();
  });
});
