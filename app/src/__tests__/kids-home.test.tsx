// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { Dimensions } from 'react-native';

import * as api from '@/api';
import { ApiError, type BaseItemDto, type RequestOptions } from '@/api';
import Kids from '@/app/kids';
import { once } from '@/components/kids/KidsCards';
import { forgetKids, setKids } from '@/kidsSettings';
import { kidsColumns } from '@/screens/kids/KidsHome';
import * as session from '@/session';
import { resetDevice, setDevice } from '@/testDevice';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
const { router } = jest.requireMock<{ router: { push: jest.Mock } }>('expo-router');

const server = { id: 'srv', url: 'https://jf.example.com', name: 'Home server', version: '12.1.0' };
let active: session.Account;
let seq = 0;
let now = 1_000_000;

const request = jest.spyOn(api, 'request');
let reply: unknown;
let lastQuery: RequestOptions['query'];

const items = (...list: BaseItemDto[]) => ({ Items: list, TotalRecordCount: list.length });
const movie = (id: string, extra: Partial<BaseItemDto> = {}): BaseItemDto => ({
  Id: id,
  Name: id,
  Type: 'Movie',
  RunTimeTicks: 6_000_000_000,
  ImageTags: { Primary: `p-${id}` },
  UserData: { PlaybackPositionTicks: 0, Played: false },
  ...extra,
});
const show = (id: string): BaseItemDto => ({ Id: id, Name: id, Type: 'Series', ImageTags: { Primary: `p-${id}` } });
const started = movie('Started', { UserData: { PlaybackPositionTicks: 1_200_000_000, Played: false } });

beforeEach(() => {
  jest.clearAllMocks();
  // A new account per test: the useFetch cache outlives a test.
  active = { id: `srv.k${++seq}`, server, userId: `k${seq}`, userName: 'mia', deviceId: 'dev' };
  jest.spyOn(session, 'useSession').mockImplementation(() => ({ accounts: [active], active }));
  jest.spyOn(session, 'getSession').mockImplementation(() => ({ accounts: [active], active }));
  jest.spyOn(session, 'connectionFor').mockImplementation((a) => ({
    baseUrl: a.server.url,
    deviceId: a.deviceId,
    token: 'tok-secret',
    accountId: a.id,
  }));
  // Taps in different tests are far apart (the double-tap guard is app-wide).
  now += 10_000;
  jest.spyOn(Date, 'now').mockImplementation(() => now);
  reply = items(show('Rabbits'), started, show('Trains'), movie('Pond'));
  request.mockImplementation((_conn, _path, options) => {
    lastQuery = options?.query;
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

const poster = (name: RegExp | string) => screen.findByRole('button', { name });

describe('Kids Home', () => {
  beforeEach(() => setKids(active.id, { account: true }));

  it('shows every show and movie once, in the order the server sends (last watched first)', async () => {
    await render(<Kids />);
    await poster('Pond');
    const labels = screen
      .getAllByRole('button')
      .map((b) => b.props.accessibilityLabel as string)
      .filter((l) => l !== 'Grown-ups');
    expect(labels).toEqual(['Rabbits', expect.stringMatching(/^Started, \d+% watched/), 'Trains', 'Pond']);
    expect(screen.getByLabelText('Rillwood kids')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Grown-ups' })).toBeOnTheScreen();
    // No words on the posters.
    expect(screen.queryByText('Pond')).toBeNull();
  });

  it('stacks show posters (there is more inside), not movies', async () => {
    await render(<Kids />);
    expect(within(await poster('Rabbits')).getByTestId('kids-stack')).toBeOnTheScreen();
    expect(within(screen.getByRole('button', { name: 'Pond' })).queryByTestId('kids-stack')).toBeNull();
    expect(screen.getAllByTestId('kids-stack')).toHaveLength(2);
    // The whole stack fills a movie's tile: same width, the poster inside makes room (1.5x down keeps 2:3).
    await setDevice(390, 844);
    expect(screen.getByRole('button', { name: 'Rabbits' })).toHaveStyle({
      width: 171,
      paddingRight: 12,
      paddingBottom: 18,
    });
    expect(screen.getByRole('button', { name: 'Pond' })).toHaveStyle({ width: 171 });
    expect(screen.getByRole('button', { name: 'Pond' })).not.toHaveStyle({ paddingRight: 12 });
  });

  it('opens a show on its kids page and plays a movie (resuming a started one)', async () => {
    await render(<Kids />);
    await fireEvent.press(await poster('Rabbits'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/kids-show/[id]', params: { id: 'Rabbits' } });
    now += 1_000;
    await fireEvent.press(screen.getByRole('button', { name: /^Started/ }));
    expect(router.push).toHaveBeenLastCalledWith({ pathname: '/player', params: { id: 'Started', start: '120' } });
  });

  it('opens one screen for a fast double tap', async () => {
    await render(<Kids />);
    const button = await poster('Pond');
    await fireEvent.press(button);
    await fireEvent.press(button);
    expect(router.push).toHaveBeenCalledTimes(1);
  });

  it('adds no filter on a kids account (the server filters)', async () => {
    await render(<Kids />);
    await poster('Pond');
    expect(lastQuery).not.toHaveProperty('maxOfficialRating');
  });

  it('lays posters out two across on phones, more across on tablets', async () => {
    await render(<Kids />);
    const { columns, tileWidth } = kidsColumns(Dimensions.get('window').width, true);
    expect(columns).toBeGreaterThan(2);
    expect(await poster('Pond')).toHaveStyle({ width: tileWidth });
    await setDevice(390, 844);
    expect(screen.getByRole('button', { name: 'Pond' })).toHaveStyle({ width: 171 });
  });
});

describe('Kids Home - shared phone', () => {
  it('sends the age limit and hides unrated titles', async () => {
    setKids(active.id, { shared: true, age: 7 });
    await render(<Kids />);
    await poster('Pond');
    expect(lastQuery).toMatchObject({
      includeItemTypes: 'Movie,Series',
      maxOfficialRating: 'TV-Y7',
      hasParentalRating: true,
    });
  });

  it('lets unrated titles in when the grown-up allowed them', async () => {
    setKids(active.id, { shared: true, age: 13, unrated: true });
    await render(<Kids />);
    await poster('Pond');
    expect(lastQuery).toMatchObject({ maxOfficialRating: 'PG-13' });
    expect(lastQuery).not.toHaveProperty('hasParentalRating');
  });
});

describe('Kids Home - states', () => {
  beforeEach(() => setKids(active.id, { account: true }));

  it('shows poster placeholders while loading', async () => {
    reply = 'pending';
    await render(<Kids />);
    expect(screen.getByTestId('kids-loading')).toBeOnTheScreen();
  });

  it('says so when there is nothing to watch', async () => {
    reply = items();
    await render(<Kids />);
    expect(await screen.findByText('Nothing to watch yet.')).toBeOnTheScreen();
  });

  it('offers Retry when the server fails', async () => {
    reply = new ApiError('http', 500);
    await render(<Kids />);
    expect(await screen.findByText('The server ran into a problem. Try again in a moment.')).toBeOnTheScreen();
    request.mockClear();
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    expect(request).toHaveBeenCalled();
  });

  it('shows the offline card when the server is out of reach', async () => {
    reply = new ApiError('network');
    await render(<Kids />);
    expect(await screen.findByText("Can't reach Home server")).toBeOnTheScreen();
    expect(screen.queryByText('Nothing to watch yet.')).toBeNull();
  });
});

describe('kids parts', () => {
  it('fits two posters across on phones and whole posters across wide windows', () => {
    expect(kidsColumns(390, false)).toEqual({ columns: 2, tileWidth: 171, gap: 16 });
    expect(kidsColumns(1024, true).columns).toBe(4);
    expect(kidsColumns(1366, true).columns).toBe(6);
    // Never fewer than three on a wide window.
    expect(kidsColumns(600, true).columns).toBe(3);
  });

  it('runs one action per tap window', () => {
    const action = jest.fn();
    once(action, 5_000_000);
    once(action, 5_000_500);
    once(action, 5_000_900);
    expect(action).toHaveBeenCalledTimes(2);
  });
});
