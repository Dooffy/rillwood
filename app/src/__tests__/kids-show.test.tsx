// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { Dimensions, FlatList } from 'react-native';

import * as api from '@/api';
import { ApiError, type BaseItemDto, type RequestOptions } from '@/api';
import KidsShowRoute from '@/app/kids-show/[id]';
import { episodeName } from '@/components/kids/KidsCards';
import { forgetKids, setKids } from '@/kidsSettings';
import { episodeColumns } from '@/screens/kids/KidsShow';
import * as session from '@/session';
import { resetDevice, setDevice } from '@/testDevice';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({ id: 'dino' }),
}));
const { router } = jest.requireMock<{ router: { push: jest.Mock; back: jest.Mock } }>('expo-router');

const server = { id: 'srv', url: 'https://jf.example.com', name: 'Home server', version: '12.1.0' };
let active: session.Account;
let seq = 0;
let now = 50_000_000;

const request = jest.spyOn(api, 'request');
// Replies by route: 'show' (/Items/{id}), 'episodes', 'next' (/Shows/NextUp).
let routes: Record<string, unknown>;
const queries: Record<string, RequestOptions['query']> = {};

function routeOf(path: string) {
  if (path.endsWith('/Episodes')) return 'episodes';
  if (path === '/Shows/NextUp') return 'next';
  return 'show';
}

const items = (...list: BaseItemDto[]) => ({ Items: list, TotalRecordCount: list.length });
const ep = (id: string, season: number, n: number, extra: Partial<BaseItemDto> = {}): BaseItemDto => ({
  Id: id,
  Name: id,
  Type: 'Episode',
  SeriesId: 'dino',
  SeriesName: 'Dino Bakery',
  ParentIndexNumber: season,
  IndexNumber: n,
  RunTimeTicks: 6_000_000_000,
  ImageTags: { Primary: `still-${id}` },
  UserData: { PlaybackPositionTicks: 0, Played: false },
  ...extra,
});

beforeEach(() => {
  jest.clearAllMocks();
  active = { id: `srv.s${++seq}`, server, userId: `s${seq}`, userName: 'mia', deviceId: 'dev' };
  jest.spyOn(session, 'useSession').mockImplementation(() => ({ accounts: [active], active }));
  jest.spyOn(session, 'getSession').mockImplementation(() => ({ accounts: [active], active }));
  jest.spyOn(session, 'connectionFor').mockImplementation((a) => ({
    baseUrl: a.server.url,
    deviceId: a.deviceId,
    token: 'tok-secret',
    accountId: a.id,
  }));
  now += 10_000;
  jest.spyOn(Date, 'now').mockImplementation(() => now);
  setKids(active.id, { account: true });
  routes = {
    show: { Id: 'dino', Name: 'Dino Bakery', Type: 'Series', BackdropImageTags: ['bd'] },
    episodes: items(
      ep('Knead', 1, 1, { UserData: { PlaybackPositionTicks: 0, Played: true } }),
      ep('Muffin', 1, 2, { UserData: { PlaybackPositionTicks: 1_200_000_000, Played: false } }),
      ep('Donut', 2, 1),
    ),
    next: items(ep('Muffin', 1, 2)),
  };
  request.mockImplementation((_conn, path, options) => {
    const route = routeOf(path);
    queries[route] = options?.query;
    const reply = routes[route];
    if (reply === 'pending') return new Promise<never>(() => {});
    if (reply instanceof Error) return Promise.reject(reply);
    return Promise.resolve(reply as never);
  });
});

afterEach(() => {
  forgetKids(active.id);
  resetDevice();
  jest.mocked(Date.now).mockRestore();
});

describe('Kids show page', () => {
  it("shows the show's name and every episode as a picture, seasons divided", async () => {
    await render(<KidsShowRoute />);
    expect(await screen.findByRole('header', { name: 'Dino Bakery' })).toBeOnTheScreen();
    await screen.findByRole('button', { name: /Donut/ });
    expect(screen.getByRole('button', { name: 'Season 1, Episode 1, Knead, watched' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /^Season 2, Episode 1, Donut/ })).toBeOnTheScreen();
    expect(screen.getByText('Season 1')).toBeOnTheScreen();
    expect(screen.getByText('Season 2')).toBeOnTheScreen();
    // The episode name on its picture; watched is an icon, not a word.
    expect(screen.getByText('Donut')).toBeOnTheScreen();
    const knead = screen.getByRole('button', { name: /Knead, watched/ });
    expect(within(knead).getByTestId('kids-watched')).toBeOnTheScreen();
    expect(screen.queryByText('Watched')).toBeNull();
    expect(screen.getAllByTestId('kids-watched')).toHaveLength(1);
  });

  it("draws the show's title logo when it has one (its name read out), else the name as text", async () => {
    routes.show = { Id: 'dino', Name: 'Dino Bakery', Type: 'Series', ImageTags: { Logo: 'logo-tag' } };
    await render(<KidsShowRoute />);
    const logo = await screen.findByTestId('kids-show-logo');
    expect(logo.props.accessibilityLabel).toBe('Dino Bakery');
    expect(JSON.stringify(logo.props.source)).toContain('/Items/dino/Images/Logo');
    expect(screen.queryByText('Dino Bakery')).toBeNull();
  });

  it("a logo that doesn't load: the name as text", async () => {
    routes.show = { Id: 'dino', Name: 'Dino Bakery', Type: 'Series', ImageTags: { Logo: 'logo-tag' } };
    await render(<KidsShowRoute />);
    await fireEvent(await screen.findByTestId('kids-show-logo'), 'error', { error: 'gone', nativeEvent: {} });
    expect(screen.queryByTestId('kids-show-logo')).toBeNull();
    expect(screen.getByRole('header', { name: 'Dino Bakery' })).toBeOnTheScreen();
  });

  it('opens at the top - the next episode is marked, not scrolled to', async () => {
    const scrollTo = jest.spyOn(FlatList.prototype as unknown as { scrollToIndex: () => void }, 'scrollToIndex');
    await render(<KidsShowRoute />);
    await screen.findByRole('button', { name: /Donut/ });
    expect(scrollTo).not.toHaveBeenCalled();
    scrollTo.mockRestore();
  });

  it('marks the next episode and plays it, resuming where it stopped', async () => {
    await render(<KidsShowRoute />);
    const next = await screen.findByRole('button', { name: /^Next: Season 1, Episode 2, Muffin/ });
    expect(within(next).getByTestId('kids-next')).toBeOnTheScreen();
    expect(screen.getAllByTestId('kids-next')).toHaveLength(1);
    // Started: the progress bar under its name.
    expect(within(next).getByTestId('progress-bar')).toBeOnTheScreen();
    await fireEvent.press(next);
    expect(router.push).toHaveBeenCalledWith({ pathname: '/player', params: { id: 'Muffin', start: '120' } });
  });

  it('plays any episode on one tap', async () => {
    await render(<KidsShowRoute />);
    await fireEvent.press(await screen.findByRole('button', { name: /Donut/ }));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/player', params: { id: 'Donut', start: '0' } });
  });

  it('goes back with the big round button', async () => {
    await render(<KidsShowRoute />);
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(router.back).toHaveBeenCalled();
  });

  it('leaves out the divider for a one-season show', async () => {
    routes.episodes = items(ep('Knead', 1, 1), ep('Muffin', 1, 2));
    await render(<KidsShowRoute />);
    expect(await screen.findByRole('button', { name: /^Episode 1, Knead/ })).toBeOnTheScreen();
    expect(screen.queryByText('Season 1')).toBeNull();
  });

  it('sends the age limit on a shared phone, nothing extra on a kids account', async () => {
    await render(<KidsShowRoute />);
    await screen.findByRole('button', { name: /Donut/ });
    expect(queries.episodes).toEqual({ isMissing: false });
    setKids(active.id, { account: false, shared: true, age: 10 });
    await screen.findByRole('button', { name: /Donut/ });
    expect(queries.episodes).toMatchObject({ maxOfficialRating: '10' });
  });

  it('lays episodes out in one column on phones, a grid on tablets', async () => {
    await render(<KidsShowRoute />);
    const { columns, tileWidth } = episodeColumns(Dimensions.get('window').width, true);
    expect(columns).toBeGreaterThan(1);
    expect(await screen.findByRole('button', { name: /Donut/ })).toHaveStyle({ width: tileWidth });
    await setDevice(390, 844);
    expect(screen.getByRole('button', { name: /Donut/ })).toHaveStyle({ width: 358 });
  });
});

describe('Kids show page - states', () => {
  it('shows placeholders while loading', async () => {
    routes.episodes = 'pending';
    await render(<KidsShowRoute />);
    expect(screen.getByTestId('kids-show-loading')).toBeOnTheScreen();
  });

  it('says so when there are no episodes to play', async () => {
    routes.episodes = items(ep('Special', 0, 1));
    await render(<KidsShowRoute />);
    expect(await screen.findByText('No episodes yet.')).toBeOnTheScreen();
  });

  it('offers Retry when the server fails', async () => {
    routes.episodes = new ApiError('http', 500);
    await render(<KidsShowRoute />);
    expect(await screen.findByText('The server ran into a problem. Try again in a moment.')).toBeOnTheScreen();
    request.mockClear();
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    expect(request).toHaveBeenCalled();
  });

  it('shows the offline card when the server is out of reach', async () => {
    routes = { show: new ApiError('network'), episodes: new ApiError('network'), next: new ApiError('network') };
    await render(<KidsShowRoute />);
    expect(await screen.findByText("Can't reach Home server")).toBeOnTheScreen();
  });
});

describe('episodeName / episodeColumns', () => {
  it('names an episode for VoiceOver, with its season when there are several', () => {
    expect(episodeName(ep('Muffin', 1, 2), false)).toBe('Episode 2, Muffin');
    expect(episodeName(ep('Muffin', 1, 2), true)).toBe('Season 1, Episode 2, Muffin');
    expect(episodeName({ Id: 'x', Name: 'Extra', Type: 'Episode' }, true)).toBe('Extra');
  });

  it('fits one column on phones and whole pictures across wide windows', () => {
    expect(episodeColumns(390, false)).toEqual({ columns: 1, tileWidth: 358, gap: 16 });
    expect(episodeColumns(1024, true).columns).toBe(2);
    expect(episodeColumns(1366, true).columns).toBe(3);
    expect(episodeColumns(600, true).columns).toBe(2);
  });
});
