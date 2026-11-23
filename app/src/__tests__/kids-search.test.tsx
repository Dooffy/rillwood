// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { TextInput } from 'react-native';

import * as api from '@/api';
import { ApiError, type BaseItemDto, type RequestOptions } from '@/api';
import KidsSearchRoute from '@/app/kids-search';
import { forgetKids, setKids } from '@/kidsSettings';
import * as navigation from '@/navigation';
import * as session from '@/session';
import { KIDS_SEARCH_DEBOUNCE_MS } from '@/useKidsSearch';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useNavigation: () => mockNavigation,
}));
/** The screen's transition events: the test fires transitionEnd itself. */
const listeners: ((e: { data: { closing: boolean } }) => void)[] = [];
const mockNavigation = {
  addListener: (_event: string, listener: (e: { data: { closing: boolean } }) => void) => {
    listeners.push(listener);
    return () => {};
  },
};
const { router } = jest.requireMock<{ router: { push: jest.Mock; back: jest.Mock } }>('expo-router');

const server = { id: 'srv', url: 'https://jf.example.com', name: 'Home server', version: '12.1.0' };
let active: session.Account;
let seq = 0;
let now = 5_000_000;

const items = (...list: BaseItemDto[]) => ({ Items: list, TotalRecordCount: list.length });
const named = (Id: string, Type: string, extra: Partial<BaseItemDto> = {}): BaseItemDto => ({
  Id,
  Name: Id,
  Type,
  ImageTags: { Primary: `p-${Id}` },
  UserData: { PlaybackPositionTicks: 0, Played: false },
  ...extra,
});

const request = jest.spyOn(api, 'request');
/** Answers by what's asked: titles, episodes, or the allowed shows. */
let answers: { titles: unknown; episodes: unknown; shows: unknown };
const queries: NonNullable<RequestOptions['query']>[] = [];

beforeEach(() => {
  jest.clearAllMocks();
  // Timers for the typing pause; Date stays real (the double-tap guard reads a mocked Date.now).
  jest.useFakeTimers({ doNotFake: ['Date'] });
  queries.length = 0;
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
  answers = {
    titles: items(named('Dino Bakery', 'Series'), named('Dinosaur Picnic', 'Movie')),
    episodes: items(
      named('The Dining Car', 'Episode', { SeriesId: 'Trains' }),
      named('Dinner Time', 'Episode', { SeriesId: 'Grown-up Show' }),
    ),
    shows: items(named('Trains', 'Series'), named('Dino Bakery', 'Series')),
  };
  request.mockImplementation((_conn, _path, options) => {
    const q = options?.query ?? {};
    queries.push(q);
    const answer = q.includeItemTypes === 'Episode' ? answers.episodes : q.searchTerm ? answers.titles : answers.shows;
    return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer as never);
  });
});

afterEach(() => {
  forgetKids(active.id);
  jest.mocked(Date.now).mockRestore();
  jest.useRealTimers();
});

async function type(text: string) {
  await fireEvent.changeText(screen.getByLabelText('Find a show'), text);
  await act(() => jest.advanceTimersByTime(KIDS_SEARCH_DEBOUNCE_MS));
}

describe('Kids search', () => {
  it('focuses the field once the screen is in (not while it animates)', async () => {
    setKids(active.id, { account: true });
    await render(<KidsSearchRoute />);
    // The test TextInput's methods sit on its prototype.
    const focus = jest.spyOn(TextInput.prototype as { focus: () => void }, 'focus');
    focus.mockClear();
    // Opening: nothing yet. Once in: focus. Closing: no focus.
    expect(listeners.length).toBeGreaterThan(0);
    expect(focus).not.toHaveBeenCalled();
    await act(() => listeners.at(-1)?.({ data: { closing: true } }));
    expect(focus).not.toHaveBeenCalled();
    await act(() => listeners.at(-1)?.({ data: { closing: false } }));
    expect(focus).toHaveBeenCalled();
    focus.mockRestore();
  });

  it('asks nothing before typing', async () => {
    setKids(active.id, { account: true });
    await render(<KidsSearchRoute />);
    expect(screen.getByLabelText('Find a show')).toBeOnTheScreen();
    expect(request).not.toHaveBeenCalled();
  });

  it('kids account: shows + movies as posters, episodes as stills - the server filters', async () => {
    setKids(active.id, { account: true });
    await render(<KidsSearchRoute />);
    await type('din');
    expect(await screen.findByRole('button', { name: /^Dino Bakery/ })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /^Dinosaur Picnic/ })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /^The Dining Car/ })).toBeOnTheScreen();
    // No app filter on a kids account: every episode the server sends.
    expect(screen.getByRole('button', { name: /^Dinner Time/ })).toBeOnTheScreen();
    expect(queries.every((q) => q.maxOfficialRating === undefined)).toBe(true);
  });

  it('shared phone: the age on each request, episodes only from allowed shows', async () => {
    setKids(active.id, { shared: true, age: 7 });
    await render(<KidsSearchRoute />);
    await type('din');
    expect(await screen.findByRole('button', { name: /^The Dining Car/ })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^Dinner Time/ })).toBeNull();
    expect(queries.filter((q) => q.searchTerm === 'din').every((q) => q.maxOfficialRating === '7')).toBe(true);
  });

  it('a show opens its page, a movie and an episode play', async () => {
    const play = jest.spyOn(navigation, 'playItem').mockImplementation(() => {});
    setKids(active.id, { account: true });
    await render(<KidsSearchRoute />);
    await type('din');
    await fireEvent.press(await screen.findByRole('button', { name: /^Dino Bakery/ }));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/kids-show/[id]', params: { id: 'Dino Bakery' } });
    now += 10_000;
    await fireEvent.press(screen.getByRole('button', { name: /^Dinosaur Picnic/ }));
    expect(play).toHaveBeenLastCalledWith(expect.objectContaining({ Id: 'Dinosaur Picnic' }));
    now += 10_000;
    await fireEvent.press(screen.getByRole('button', { name: /^The Dining Car/ }));
    expect(play).toHaveBeenLastCalledWith(expect.objectContaining({ Id: 'The Dining Car' }));
    play.mockRestore();
  });

  it('nothing found: says so', async () => {
    setKids(active.id, { account: true });
    answers.titles = items();
    answers.episodes = items();
    await render(<KidsSearchRoute />);
    await type('zzq');
    expect(await screen.findByText('Nothing called that.')).toBeOnTheScreen();
  });

  it('a failed search offers Retry', async () => {
    setKids(active.id, { account: true });
    answers.titles = new ApiError('http', 500);
    await render(<KidsSearchRoute />);
    await type('din');
    expect(await screen.findByText('The server ran into a problem. Try again in a moment.')).toBeOnTheScreen();
    request.mockClear();
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    expect(request).toHaveBeenCalled();
  });

  it('✕ goes back to Home', async () => {
    setKids(active.id, { account: true });
    await render(<KidsSearchRoute />);
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(router.back).toHaveBeenCalled();
  });
});
