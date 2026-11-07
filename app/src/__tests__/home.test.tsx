// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { ReactElement } from 'react';
import { act, fireEvent, render as rtlRender, screen, waitFor, within } from '@testing-library/react-native';
import { Platform, StyleSheet, type RefreshControlProps } from 'react-native';

import * as api from '@/api';
import { ApiError, type BaseItemDto, type RequestOptions } from '@/api';
import Home from '@/app/(tabs)/home';
import { ItemMenuProvider } from '@/components/ItemMenu';
import { ToastProvider } from '@/components/Toast';
import * as session from '@/session';
import { resetDevice, setDevice } from '@/testDevice';

const render = (ui: ReactElement) =>
  rtlRender(
    <ToastProvider>
      <ItemMenuProvider>{ui}</ItemMenuProvider>
    </ToastProvider>,
  );
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
const { router } = jest.requireMock<{ router: { push: jest.Mock } }>('expo-router');

const server = { id: 'srv', url: 'https://jf.example.com', name: 'Home server', version: '12.1.0' };
let active: session.Account;
let seq = 0;

const request = jest.spyOn(api, 'request');

// Responses by route: '/UserViews', '/UserItems/Resume', '/Shows/NextUp', 'latest:<parentId>'.
// A value, an ApiError (rejected) or 'pending' (never answers).
type Reply = unknown;
let routes: Record<string, Reply>;

function routeOf(path: string, options?: RequestOptions) {
  return path === '/Items/Latest' ? `latest:${String(options?.query?.parentId)}` : path;
}

function items(...list: BaseItemDto[]) {
  return { Items: list, TotalRecordCount: list.length };
}

const movies = { Id: 'lib-m', Name: 'Movies', Type: 'CollectionFolder', CollectionType: 'movies' };
const shows = { Id: 'lib-s', Name: 'Shows', Type: 'CollectionFolder', CollectionType: 'tvshows' };
const music = { Id: 'lib-x', Name: 'Music', Type: 'CollectionFolder', CollectionType: 'music' };

const sintel: BaseItemDto = {
  Id: 'sintel',
  Name: 'Sintel',
  Type: 'Movie',
  ProductionYear: 2010,
  RunTimeTicks: 8_880_000_000,
  ImageTags: { Primary: 'p-sintel' },
  BackdropImageTags: ['bd-sintel'],
  UserData: { PlaybackPositionTicks: 1_200_000_000, Played: false },
};
const tears: BaseItemDto = {
  Id: 'tears',
  Name: 'Tears of Steel',
  Type: 'Movie',
  ProductionYear: 2012,
  RunTimeTicks: 7_340_000_000,
  ImageTags: { Primary: 'p-tears' },
  UserData: { PlaybackPositionTicks: 600_000_000, Played: false },
};
function episode(n: number): BaseItemDto {
  return {
    Id: `ep-${n}`,
    Name: `Episode ${n}`,
    Type: 'Episode',
    IndexNumber: n,
    ParentIndexNumber: 1,
    SeriesId: 'show',
    SeriesName: 'Test Show',
    SeriesPrimaryImageTag: 'p-show',
    ImageTags: { Primary: `still-${n}` },
    UserData: { PlaybackPositionTicks: 0, Played: false },
  };
}
const show: BaseItemDto = { Id: 'show', Name: 'Test Show', Type: 'Series', ImageTags: { Primary: 'p-show' } };

/** A server with something in every row (12.1: Latest sends the Series). */
function fullServer() {
  routes = {
    '/UserViews': items(movies, shows, music),
    '/UserItems/Resume': items(sintel, tears),
    '/Shows/NextUp': items(episode(2)),
    'latest:lib-m': [sintel, tears],
    'latest:lib-s': [show],
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  // A new account per test: the useFetch cache outlives a test, and accounts never share entries.
  active = { id: `srv.u${++seq}`, server, userId: `u${seq}`, userName: 'anna', deviceId: 'dev' };
  jest.spyOn(session, 'useSession').mockImplementation(() => ({ accounts: [active], active }));
  jest.spyOn(session, 'getSession').mockImplementation(() => ({ accounts: [active], active }));
  jest.spyOn(session, 'connectionFor').mockImplementation((a) => ({
    baseUrl: a.server.url,
    deviceId: a.deviceId,
    token: 'tok-secret',
    accountId: a.id,
  }));
  fullServer();
  request.mockImplementation((_conn, path, options) => {
    const reply = routes[routeOf(path, options)];
    if (reply === 'pending') return new Promise<never>(() => {});
    if (reply instanceof Error) return Promise.reject(reply);
    if (reply instanceof Promise) return reply as Promise<never>;
    return Promise.resolve(reply as never);
  });
});

afterEach(resetDevice);

function refreshControl() {
  return (screen.getByTestId('home-scroll').props.refreshControl as { props: RefreshControlProps }).props;
}

function calls(route: string) {
  return request.mock.calls.filter(([, path, options]) => routeOf(path, options) === route).length;
}

describe('Home', () => {
  it('shows the latest started item as the hero and leaves it out of Continue Watching', async () => {
    await render(<Home />);
    const hero = await screen.findByRole('button', { name: /^Continue Watching, Sintel, 2010/ });
    // Tablet (Jest's default window): the eyebrow on the art, and ▶ with the progress plays from the saved position.
    expect(within(hero).getByText('CONTINUE WATCHING')).toBeOnTheScreen();
    await fireEvent.press(within(hero).getByRole('button', { name: /^Resume, / }));
    expect(router.push).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/player' }));
    expect(
      screen.getByRole('button', { name: /^Tears of Steel, 2012, 8% watched, 12 minutes left$/ }),
    ).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^Sintel, 2010, \d+% watched/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Test Show, S1:E2 · Episode 2' })).toBeOnTheScreen();
  });

  it('a long press on any card opens its menu', async () => {
    await render(<Home />);
    // The hero too.
    await fireEvent(await screen.findByRole('button', { name: /^Continue Watching, Sintel, 2010/ }), 'longPress');
    expect(screen.getByText('Sintel · 2010')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    const resume = await screen.findByRole('button', { name: /^Tears of Steel, 2012, 8% watched/ });
    await fireEvent(resume, 'longPress');
    expect(screen.getByRole('menuitem', { name: 'Resume' })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    await fireEvent(screen.getByRole('button', { name: 'Test Show, S1:E2 · Episode 2' }), 'longPress');
    expect(screen.getByText('Test Show · S1:E2 · Episode 2')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    // Recently Added: a show has no Play.
    await fireEvent(await screen.findByRole('button', { name: 'Test Show' }), 'longPress');
    expect(screen.getByRole('menuitem', { name: 'Mark as Watched' })).toBeOnTheScreen();
    expect(screen.queryByRole('menuitem', { name: 'Play' })).toBeNull();
  });

  // Regression: the last row sat under the iOS tab bar (native tabs inset only a screen's first scroll view).
  it('keeps the list clear of the tab bar; the profile button is the header button size', async () => {
    await render(<Home />);
    expect(screen.getByTestId('home-scroll')).toHaveProp('contentInsetAdjustmentBehavior', 'automatic');
    expect(screen.getByRole('button', { name: 'Settings' })).toHaveStyle({ width: 44, height: 44 });
  });

  it('shows Recently Added for movie and TV libraries only', async () => {
    await render(<Home />);
    expect(await screen.findByText('Recently Added in Movies')).toBeOnTheScreen();
    expect(await screen.findByText('Recently Added in Shows')).toBeOnTheScreen();
    expect(screen.queryByText('Recently Added in Music')).toBeNull();
    expect(calls('latest:lib-x')).toBe(0);
    expect(screen.getByRole('button', { name: 'Test Show' })).toBeOnTheScreen();
  });

  it('shows 10.11 Latest episodes as one series card', async () => {
    routes['latest:lib-s'] = [episode(3), episode(2)];
    await render(<Home />);
    await screen.findByText('Recently Added in Shows');
    expect(await screen.findAllByRole('button', { name: 'Test Show' })).toHaveLength(1);
  });

  it('sizes images to the card, with the tag and no token', async () => {
    await setDevice(390, 844);
    await render(<Home />);
    await screen.findByText('Recently Added in Shows');
    const sources = screen.getAllByTestId('artwork-image').map((n) => (n.props.source as { uri: string }[])[0].uri);
    expect(sources).toContain(
      'https://jf.example.com/Items/sintel/Images/Backdrop?fillWidth=720&quality=90&tag=bd-sintel',
    );
    expect(sources).toContain('https://jf.example.com/Items/show/Images/Primary?fillWidth=240&quality=90&tag=p-show');
    expect(sources.join(' ')).not.toMatch(/tok-secret|api_?key/i);
  });

  // Tablets: whole cards across the row (the tab's width: less the sidebar in landscape), images at the drawn width.
  it('fits whole cards across the row on tablets', async () => {
    const width = (name: string | RegExp) =>
      StyleSheet.flatten(screen.getByRole('button', { name }).props.style).width as number;
    await setDevice(390, 844);
    await render(<Home />);
    await screen.findByText('Recently Added in Shows');
    // Phone: the default sizes, the next card peeking in.
    expect([width('Test Show'), width(/^Test Show, S1:E2/)]).toEqual([120, 260]);
    // iPad portrait (802 pt row): 4 posters, 2 landscape cards. Landscape beside the sidebar (902): 5 and 2.
    for (const [w, h, poster, landscape] of [
      [834, 1194, 191, 395],
      [1194, 834, 170, 445],
    ] as const) {
      await setDevice(w, h);
      expect([width('Test Show'), width(/^Test Show, S1:E2/)]).toEqual([poster, landscape]);
    }
    const sources = screen.getAllByTestId('artwork-image').map((n) => (n.props.source as { uri: string }[])[0].uri);
    expect(sources.some((uri) => uri.includes('/show/Images/Primary?fillWidth=') && !uri.includes('=240&'))).toBe(true);
  });

  it('fills a tablet row with placeholders while it loads', async () => {
    routes = { '/UserViews': 'pending', '/UserItems/Resume': 'pending', '/Shows/NextUp': 'pending' };
    await setDevice(1194, 834);
    await render(<Home />);
    const row = screen.getByLabelText('Loading Recently Added');
    expect(within(row).getAllByTestId('card-placeholder', { includeHiddenElements: true })).toHaveLength(5);
  });

  it('uses the next episode as the hero when nothing is in progress', async () => {
    routes['/UserItems/Resume'] = items();
    await render(<Home />);
    expect(await screen.findByRole('button', { name: /^Up Next, Test Show, S1:E2/ })).toBeOnTheScreen();
    expect(screen.queryByText('Continue Watching')).toBeNull();
    expect(screen.queryByText('Next Up')).toBeNull();
  });

  it('shows placeholders while rows load', async () => {
    routes = { '/UserViews': 'pending', '/UserItems/Resume': 'pending', '/Shows/NextUp': 'pending' };
    await render(<Home />);
    expect(screen.getByTestId('hero-placeholder', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.getByLabelText('Loading Continue Watching')).toBeOnTheScreen();
    expect(screen.getByLabelText('Loading Next Up')).toBeOnTheScreen();
    expect(screen.getByLabelText('Loading Recently Added')).toBeOnTheScreen();
  });

  it('retries a failed row on its own', async () => {
    routes['/Shows/NextUp'] = new ApiError('http', 500);
    await render(<Home />);
    expect(await screen.findByText('The server ran into a problem. Try again in a moment.')).toBeOnTheScreen();
    routes['/Shows/NextUp'] = items(episode(2));
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('button', { name: 'Test Show, S1:E2 · Episode 2' })).toBeOnTheScreen();
    expect(calls('/Shows/NextUp')).toBe(2);
    expect(calls('/UserItems/Resume')).toBe(1);
  });

  it('server out of reach, nothing loaded: one offline state with Retry + Go to Downloads, no row errors', async () => {
    const offline = new ApiError('network');
    routes = { '/UserViews': offline, '/UserItems/Resume': offline, '/Shows/NextUp': offline };
    await render(<Home />);
    expect(await screen.findByText("Check your connection, or watch something you've downloaded.")).toBeOnTheScreen();
    expect(screen.getAllByRole('button', { name: 'Retry' })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Go to Downloads' })).toBeOnTheScreen();
  });

  it('a row out of reach is hidden; the rows that loaded stay', async () => {
    fullServer();
    routes['/Shows/NextUp'] = new ApiError('network');
    await render(<Home />);
    expect(await screen.findByRole('button', { name: /^Continue Watching, Sintel/ })).toBeOnTheScreen();
    expect(screen.queryByText('Next Up')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  // Regression: the library list loaded but every other row went offline → Home was blank, no message or Retry.
  it('library list loaded, the rest out of reach: the card on top, what loaded below', async () => {
    fullServer();
    const offline = new ApiError('network');
    Object.assign(routes, { '/UserItems/Resume': offline, '/Shows/NextUp': offline, 'latest:lib-s': offline });
    await render(<Home />);
    expect(await screen.findByText("Check your connection, or watch something you've downloaded.")).toBeOnTheScreen();
    expect(await screen.findByText('Recently Added in Movies')).toBeOnTheScreen();
    expect(screen.queryByText('Recently Added in Shows')).toBeNull();
  });

  it('Retry keeps the card up (Retry busy) while it asks; back online, Home loads', async () => {
    const offline = new ApiError('network');
    routes = { '/UserViews': offline, '/UserItems/Resume': offline, '/Shows/NextUp': offline };
    await render(<Home />);
    expect(await screen.findByText("Check your connection, or watch something you've downloaded.")).toBeOnTheScreen();
    routes = { '/UserViews': 'pending', '/UserItems/Resume': 'pending', '/Shows/NextUp': 'pending' };
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    expect(screen.getByText("Check your connection, or watch something you've downloaded.")).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeDisabled();
    expect(screen.queryByTestId('hero-placeholder')).toBeNull();
  });

  it('shows one error with Retry when the server fails', async () => {
    const broken = new ApiError('http', 500);
    routes = { '/UserViews': broken, '/UserItems/Resume': broken, '/Shows/NextUp': broken };
    await render(<Home />);
    expect(await screen.findByText('The server ran into a problem. Try again in a moment.')).toBeOnTheScreen();
    expect(screen.getAllByRole('button', { name: 'Retry' })).toHaveLength(1);
    fullServer();
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('button', { name: /^Continue Watching, Sintel/ })).toBeOnTheScreen();
    expect(await screen.findByText('Recently Added in Movies')).toBeOnTheScreen();
  });

  it('hides empty rows and says so when there is nothing at all', async () => {
    routes = { '/UserViews': items(), '/UserItems/Resume': items(), '/Shows/NextUp': items() };
    await render(<Home />);
    expect(await screen.findByText(/^Nothing to watch yet/)).toBeOnTheScreen();
    expect(screen.queryByTestId('hero-placeholder', { includeHiddenElements: true })).toBeNull();
    expect(screen.queryByText('Continue Watching')).toBeNull();
  });

  it('says nothing to watch when the libraries exist but are empty', async () => {
    routes = {
      '/UserViews': items(movies, shows),
      '/UserItems/Resume': items(),
      '/Shows/NextUp': items(),
      'latest:lib-m': [],
      'latest:lib-s': [],
    };
    await render(<Home />);
    expect(await screen.findByText(/^Nothing to watch yet/)).toBeOnTheScreen();
    expect(screen.queryByText('Recently Added in Movies')).toBeNull();
  });

  it('opens movies and episodes as items, series as series', async () => {
    await render(<Home />);
    await fireEvent.press(await screen.findByRole('button', { name: /^Continue Watching, Sintel/ }));
    expect(router.push).toHaveBeenLastCalledWith({ pathname: '/item/[id]', params: { id: 'sintel' } });
    await fireEvent.press(await screen.findByRole('button', { name: 'Test Show' }));
    expect(router.push).toHaveBeenLastCalledWith({ pathname: '/series/[id]', params: { id: 'show' } });
  });

  it('refetches every row on pull to refresh', async () => {
    await render(<Home />);
    await screen.findByText('Recently Added in Shows');
    let answer!: () => void;
    routes['/UserItems/Resume'] = new Promise((resolve) => (answer = () => resolve(items(tears))));
    await act(() => refreshControl().onRefresh?.());
    expect(refreshControl().refreshing).toBe(true);
    await act(() => answer());
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^Continue Watching, Tears of Steel/ })).toBeOnTheScreen(),
    );
    // Held briefly after the rows answer, so the native control ends its pull animation first.
    expect(refreshControl().refreshing).toBe(true);
    await waitFor(() => expect(refreshControl().refreshing).toBe(false));
    for (const route of ['/UserViews', '/UserItems/Resume', '/Shows/NextUp', 'latest:lib-m', 'latest:lib-s']) {
      expect(calls(route)).toBe(2);
    }
  });
});

describe('Home on Apple TV', () => {
  const isTV = Object.getOwnPropertyDescriptor(Platform, 'isTV')!;
  beforeEach(() => {
    Object.defineProperty(Platform, 'isTV', { get: () => true, configurable: true });
  });
  afterEach(() => {
    Object.defineProperty(Platform, 'isTV', isTV);
  });

  it('opens on the full-screen hero with focus on Play, which resumes', async () => {
    await render(<Home />);
    await screen.findByTestId('tv-hero');
    expect(screen.getByText('CONTINUE WATCHING')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Sintel' })).toBeOnTheScreen();
    expect(screen.getByText('2010 · 15m')).toBeOnTheScreen();
    const play = screen.getByRole('button', { name: 'Resume, 13m left' });
    expect(play.props.hasTVPreferredFocus).toBe(true);
    await fireEvent.press(play);
    expect(router.push).toHaveBeenLastCalledWith(
      expect.objectContaining({ pathname: '/player', params: expect.objectContaining({ start: '120' }) }),
    );
    // Started: Play from Start beside it, then More (the item menu).
    await fireEvent.press(screen.getByRole('button', { name: 'Play from Start' }));
    expect(router.push).toHaveBeenLastCalledWith(
      expect.objectContaining({ pathname: '/player', params: expect.objectContaining({ start: '0' }) }),
    );
    await fireEvent.press(screen.getByRole('button', { name: 'More' }));
    expect(screen.getByText('Sintel · 2010')).toBeOnTheScreen();
  });

  it('names the episode on an Up Next hero, no Play from Start when not started', async () => {
    routes['/UserItems/Resume'] = items();
    await render(<Home />);
    await screen.findByTestId('tv-hero');
    expect(screen.getByText('UP NEXT')).toBeOnTheScreen();
    expect(screen.getByText('S1, E2 · Episode 2')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Play S1, E2' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Play from Start' })).toBeNull();
  });

  it('has no title, no pull to refresh, and the avatar opens Settings', async () => {
    await render(<Home />);
    await screen.findByTestId('tv-hero');
    expect(screen.queryByText('Home')).toBeNull();
    expect(screen.getByTestId('home-scroll').props.refreshControl).toBeUndefined();
    await fireEvent.press(screen.getByRole('button', { name: 'Settings' }));
    expect(router.push).toHaveBeenCalledWith('/settings');
  });
});
