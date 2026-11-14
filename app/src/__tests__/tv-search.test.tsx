// SPDX-License-Identifier: GPL-3.0-or-later
// Apple TV Search tab (screen draft 06, keyboard on the left): our on-screen keys type, results update as shelves on the
// right; recent searches as pills before typing; "No results for ..." when nothing matches.
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { Platform, StyleSheet } from 'react-native';

import * as api from '@/api';
import type { BaseItemDto, Query, RequestOptions } from '@/api';
import Search from '@/app/(tabs)/search';
import { ItemMenuProvider } from '@/components/ItemMenu';
import { ToastProvider } from '@/components/Toast';
import { TvMenuHost } from '@/components/tv/TvMenu';
import { addRecentSearch } from '@/recentSearches';
import * as session from '@/session';
import { tv } from '@/theme';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
const { router } = jest.requireMock<{ router: { push: jest.Mock } }>('expo-router');

const server = { id: 'srv', url: 'https://jf.example.com', name: 'Home server', version: '12.1.0' };
let seq = 0;
let accountId = '';
const request = jest.spyOn(api, 'request');

const items: BaseItemDto[] = [
  { Id: 'sintel', Name: 'Sintel', Type: 'Movie', ProductionYear: 2010 },
  { Id: 'show', Name: 'Sintel Stories', Type: 'Series', ProductionYear: 2020 },
  {
    Id: 'ep',
    Name: 'Sintel Returns',
    Type: 'Episode',
    IndexNumber: 1,
    ParentIndexNumber: 1,
    SeriesName: 'Sintel Stories',
  },
];

/** Like the server: types and word-start search. */
function answer(q: Query) {
  const types = String(q.includeItemTypes).split(',');
  const term = q.searchTerm ? String(q.searchTerm).toLowerCase() : undefined;
  const matching = items.filter(
    (i) =>
      types.includes(i.Type) &&
      (!term ||
        i.Name.toLowerCase()
          .split(/\s+/)
          .some((w) => w.startsWith(term))),
  );
  return { Items: matching, TotalRecordCount: matching.length };
}

const isTV = Object.getOwnPropertyDescriptor(Platform, 'isTV')!;
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  Object.defineProperty(Platform, 'isTV', { get: () => true, configurable: true });
  const account = { id: `srv.u${++seq}`, server, userId: `u${seq}`, userName: 'anna', deviceId: 'dev' };
  accountId = account.id;
  jest.spyOn(session, 'useSession').mockImplementation(() => ({ accounts: [account], active: account }));
  jest.spyOn(session, 'getSession').mockImplementation(() => ({ accounts: [account], active: account }));
  jest.spyOn(session, 'connectionFor').mockImplementation((a) => ({
    baseUrl: a.server.url,
    deviceId: a.deviceId,
    token: 'tok-secret',
    accountId: a.id,
  }));
  request.mockImplementation(
    (_conn, _path, options?: RequestOptions) => Promise.resolve(answer(options?.query ?? {})) as Promise<never>,
  );
});
afterEach(() => {
  jest.useRealTimers();
  Object.defineProperty(Platform, 'isTV', isTV);
});

const renderTv = () =>
  render(
    <ToastProvider>
      <TvMenuHost>
        <ItemMenuProvider>
          <Search />
        </ItemMenuProvider>
      </TvMenuHost>
    </ToastProvider>,
  );

/** Types on the on-screen keyboard; the search runs once typing pauses. */
async function type(text: string) {
  const keyboard = within(screen.getByTestId('tv-keyboard'));
  for (const char of text) await fireEvent.press(keyboard.getByRole('button', { name: char === ' ' ? 'Space' : char }));
  await act(() => jest.advanceTimersByTimeAsync(400));
}

describe('Search on Apple TV', () => {
  it('results update as you type: Movies, Shows and Episodes shelves', async () => {
    await renderTv();
    await type('sin');
    expect(await screen.findByRole('header', { name: 'Movies' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Shows' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Episodes' })).toBeOnTheScreen();
    expect(request.mock.calls.at(-1)?.[2]?.query).toMatchObject({ searchTerm: 'sin' });
    await fireEvent.press(screen.getByRole('button', { name: 'Sintel, 2010' }));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/item/[id]', params: { id: 'sintel' } });
  });

  it('nothing found: says so', async () => {
    await renderTv();
    await type('zzz');
    // A proper empty state: icon, title, what to do next - read as one.
    expect(
      await screen.findByLabelText('No results for "zzz". Check the spelling or try another word.'),
    ).toBeOnTheScreen();
    expect(StyleSheet.flatten(screen.getByText('No results for "zzz"').props.style)).toMatchObject({
      fontSize: tv.type.shelf.fontSize,
    });
  });

  it('before typing: recent searches as pills; picking one searches it', async () => {
    addRecentSearch(accountId, 'sintel');
    await renderTv();
    await fireEvent.press(screen.getByRole('button', { name: 'sintel' }));
    await act(() => jest.advanceTimersByTimeAsync(400));
    expect(await screen.findByRole('header', { name: 'Movies' })).toBeOnTheScreen();
    expect(request.mock.calls.at(-1)?.[2]?.query).toMatchObject({ searchTerm: 'sintel' });
  });

  it('letters by default; 123 swaps in digits and title characters', async () => {
    await renderTv();
    const keyboard = within(screen.getByTestId('tv-keyboard'));
    expect(keyboard.getByRole('button', { name: 'abc' }).props.accessibilityState).toMatchObject({ selected: true });
    expect(keyboard.queryByRole('button', { name: '1' })).toBeNull();
    await fireEvent.press(keyboard.getByRole('button', { name: '123' }));
    expect(keyboard.queryByRole('button', { name: 'a' })).toBeNull();
    await fireEvent.press(keyboard.getByRole('button', { name: '2' }));
    await fireEvent.press(keyboard.getByRole('button', { name: '-' }));
    expect(screen.getByRole('button', { name: 'Search' }).props.accessibilityValue).toEqual({ text: '2-' });
  });

  it('Delete takes the last character off, Clear empties; the field shows what is typed', async () => {
    await renderTv();
    await type('sinx');
    const keyboard = within(screen.getByTestId('tv-keyboard'));
    await fireEvent.press(keyboard.getByRole('button', { name: 'Delete' }));
    await act(() => jest.advanceTimersByTimeAsync(400));
    expect(screen.getByRole('button', { name: 'Search' }).props.accessibilityValue).toEqual({ text: 'sin' });
    expect(await screen.findByRole('header', { name: 'Movies' })).toBeOnTheScreen();
    await fireEvent.press(keyboard.getByRole('button', { name: 'Clear' }));
    await act(() => jest.advanceTimersByTimeAsync(400));
    expect(screen.queryByRole('header', { name: 'Movies' })).toBeNull();
  });
});
