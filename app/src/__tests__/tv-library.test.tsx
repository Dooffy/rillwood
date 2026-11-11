// SPDX-License-Identifier: GPL-3.0-or-later
// Apple TV Library (screen draft 05): type pills + Sort, All = Movies and Shows shelves, one type = a TV-sized grid.
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Dimensions, Platform, StyleSheet } from 'react-native';

import * as api from '@/api';
import type { BaseItemDto, Query, RequestOptions } from '@/api';
import Library from '@/app/(tabs)/library';
import { ItemMenuProvider } from '@/components/ItemMenu';
import { ToastProvider } from '@/components/Toast';
import { TvMenuHost } from '@/components/tv/TvMenu';
import * as session from '@/session';
import { tv } from '@/theme';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const server = { id: 'srv', url: 'https://jf.example.com', name: 'Home server', version: '12.1.0' };
let seq = 0;
const request = jest.spyOn(api, 'request');
const movie = (i: number): BaseItemDto => ({ Id: `m${i}`, Name: `Movie ${i}`, Type: 'Movie', ProductionYear: 2026 });
const ep = (n: number): BaseItemDto => ({
  Id: `ep-${n}`,
  Name: `Episode ${n}`,
  Type: 'Episode',
  IndexNumber: n,
  ParentIndexNumber: 1,
  SeriesId: 'show',
  SeriesName: 'Test Show',
});
let items: BaseItemDto[];

function answer(q: Query) {
  const types = String(q.includeItemTypes).split(',');
  const matching = items.filter((i) => types.includes(i.Type));
  const start = Number(q.startIndex ?? 0);
  return { Items: matching.slice(start, start + Number(q.limit)), TotalRecordCount: matching.length };
}

const isTV = Object.getOwnPropertyDescriptor(Platform, 'isTV')!;
const window = Dimensions.get('window');
beforeEach(async () => {
  jest.clearAllMocks();
  Object.defineProperty(Platform, 'isTV', { get: () => true, configurable: true });
  await act(() => Dimensions.set({ window: { ...window, width: 1920, height: 1080 } }));
  const account = { id: `srv.u${++seq}`, server, userId: `u${seq}`, userName: 'anna', deviceId: 'dev' };
  jest.spyOn(session, 'useSession').mockImplementation(() => ({ accounts: [account], active: account }));
  jest.spyOn(session, 'getSession').mockImplementation(() => ({ accounts: [account], active: account }));
  jest.spyOn(session, 'connectionFor').mockImplementation((a) => ({
    baseUrl: a.server.url,
    deviceId: a.deviceId,
    token: 'tok-secret',
    accountId: a.id,
  }));
  items = [
    ...Array.from({ length: 11 }, (_, i) => movie(i)),
    { Id: 'show', Name: 'Test Show', Type: 'Series', ProductionYear: 2026 },
    ep(1),
    ep(2),
  ];
  request.mockImplementation(
    (_conn, _path, options?: RequestOptions) => Promise.resolve(answer(options?.query ?? {})) as Promise<never>,
  );
});
afterEach(async () => {
  // FlatList renders more cells on a timer: let it run inside act.
  await act(() => new Promise((resolve) => setTimeout(resolve, 100)));
  Object.defineProperty(Platform, 'isTV', isTV);
  await act(() => Dimensions.set({ window }));
});

const renderTv = () =>
  render(
    <ToastProvider>
      <ItemMenuProvider>
        <TvMenuHost>
          <Library />
        </TvMenuHost>
      </ItemMenuProvider>
    </ToastProvider>,
  );
const width = (name: string) => StyleSheet.flatten(screen.getByRole('button', { name }).props.style).width as number;

describe('Library on Apple TV', () => {
  it('opens on All: pills, Sort, a Movies and a Shows shelf, no search field', async () => {
    await renderTv();
    expect(screen.getByRole('button', { name: 'All', selected: true })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Episodes', selected: false })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Sort: Name' })).toBeOnTheScreen();
    expect(await screen.findByRole('header', { name: 'Movies' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Shows' })).toBeOnTheScreen();
    expect(screen.queryByLabelText('Movies, shows, episodes')).toBeNull();
  });

  it('a type pill opens its grid: TV-sized posters, 6 across, and the count', async () => {
    await renderTv();
    await fireEvent.press(screen.getByRole('button', { name: 'Movies' }));
    expect(await screen.findByText('11 movies · by Name')).toBeOnTheScreen();
    // 1920 less the safe margins (2 × 90), 6 posters with 40 pt gaps.
    expect(width('Movie 0, 2026')).toBe(256);
  });

  it('episodes: landscape cards, 4 across', async () => {
    await renderTv();
    await fireEvent.press(screen.getByRole('button', { name: 'Episodes' }));
    expect(await screen.findByText('2 episodes · by Name')).toBeOnTheScreen();
    const card = screen.getAllByRole('button').find((b) => String(b.props.accessibilityLabel).startsWith('Test Show'))!;
    expect(StyleSheet.flatten(card.props.style).width).toBe(405);
  });

  it('Sort opens a side panel with the current choice checked; a pick re-sorts', async () => {
    await renderTv();
    await fireEvent.press(screen.getByRole('button', { name: 'Movies' }));
    await screen.findByText('11 movies · by Name');
    await fireEvent.press(screen.getByRole('button', { name: 'Sort: Name' }));
    // Down the right edge, full height - not the centred menu.
    expect(StyleSheet.flatten(screen.getByTestId('tv-menu-card').props.style)).toMatchObject({
      width: tv.menu.sideWidth,
      height: '100%',
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Date Added' }));
    expect(await screen.findByText('11 movies · by Date Added')).toBeOnTheScreen();
    expect(request.mock.calls.filter(([, p]) => p === '/Items').at(-1)?.[2]?.query).toMatchObject({
      sortBy: 'DateCreated,SortName',
    });
    expect(screen.queryByTestId('tv-menu')).toBeNull();
  });

  it('an empty server: no pull to refresh in the message', async () => {
    items = [];
    await renderTv();
    expect(await screen.findByText(/^Nothing on the server yet/)).toHaveTextContent(
      'Nothing on the server yet. Add some in Jellyfin, then come back here.',
    );
  });
});
