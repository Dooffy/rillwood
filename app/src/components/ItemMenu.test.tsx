// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Keyboard } from 'react-native';

import * as api from '@/api';
import type { BaseItemDto } from '@/api';
import * as session from '@/session';

import { PosterCard } from './Card';
import { downloadActions, type DownloadControl } from '@/useDownloadControl';

import { itemActions, ItemMenuProvider, useItemMenu } from './ItemMenu';
import { ToastProvider } from './Toast';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
const { router } = jest.requireMock<{ router: { push: jest.Mock } }>('expo-router');

const TICKS = 10_000_000;
const item = (over: Partial<BaseItemDto>): BaseItemDto => ({ Id: 'i', Name: 'Dune', Type: 'Movie', ...over });
const download = { label: 'Download', onPress: jest.fn() };
const labels = (x: BaseItemDto, withDownload = true) =>
  itemActions(x, { mark: jest.fn(), download: withDownload ? [download] : undefined }).map((a) => a.label);

describe('itemActions', () => {
  it('details asked (Apple TV episode cards, where a click plays): Episode Details, before the download', () => {
    const ep = item({ Type: 'Episode', RunTimeTicks: 2400 * TICKS });
    const actions = itemActions(ep, { mark: jest.fn(), download: [download], details: true });
    expect(actions.map((a) => a.label)).toEqual([
      'Play',
      'Mark as Watched',
      'Add to Favourites',
      'Episode Details',
      'Download',
    ]);
    expect(labels(item({}))).not.toContain('Details');
  });

  it('a movie not started: Play, watched, favourite, download', () => {
    expect(labels(item({ RunTimeTicks: 7200 * TICKS }))).toEqual([
      'Play',
      'Mark as Watched',
      'Add to Favourites',
      'Download',
    ]);
  });

  it('in progress: Resume and Play from Start; the labels follow watched / favourite', () => {
    const started = item({
      Type: 'Episode',
      RunTimeTicks: 2400 * TICKS,
      UserData: { PlaybackPositionTicks: 600 * TICKS, Played: false, IsFavorite: true },
    });
    expect(labels(started)).toEqual([
      'Resume',
      'Play from Start',
      'Mark as Watched',
      'Remove from Favourites',
      'Download',
    ]);
    expect(labels(item({ UserData: { PlaybackPositionTicks: 0, Played: true } }))).toContain('Mark as Unwatched');
  });

  it('a show has no Play (its detail picks the episode); no download action, no Download', () => {
    expect(labels(item({ Type: 'Series' }))).toEqual(['Mark as Watched', 'Add to Favourites', 'Download']);
    expect(labels(item({ Type: 'BoxSet' }), false)).toEqual(['Mark as Watched', 'Add to Favourites']);
  });
});

describe('downloadActions', () => {
  const control = (over: Partial<DownloadControl>): DownloadControl => ({
    available: true,
    summary: null,
    partial: false,
    starting: false,
    start: jest.fn(),
    pause: jest.fn(),
    resume: jest.fn(),
    remove: jest.fn(),
    cancel: jest.fn(),
    ...over,
  });
  const summary = (state: 'downloading' | 'paused' | 'done', done = state === 'done' ? 1 : 0) => ({
    state,
    progress: 0.5,
    ids: ['x', 'y'],
    itemIds: ['i'],
    done,
  });
  const labels = (over: Partial<DownloadControl>) => downloadActions(control(over)).map((a) => a.label);

  it('follows the download state; none when it is not available', () => {
    const c = control({});
    expect(downloadActions(c)).toEqual([{ label: 'Download', onPress: c.start }]);
    expect(labels({ summary: summary('downloading') })).toEqual(['Pause Download', 'Cancel Download']);
    expect(labels({ summary: summary('paused') })).toEqual(['Resume Download', 'Cancel Download']);
    expect(labels({ summary: summary('done') })).toEqual(['Delete Download']);
    expect(labels({ available: false })).toEqual([]);
  });

  it('Cancel Download stops at once (red); Delete Download (asks) too once part of it is done', () => {
    const c = control({ summary: summary('downloading', 1) });
    const actions = downloadActions(c);
    expect(actions.map((a) => a.label)).toEqual(['Pause Download', 'Cancel Download', 'Delete Download']);
    expect(actions[1]).toEqual({ label: 'Cancel Download', destructive: true, onPress: c.cancel });
    expect(actions[2].onPress).toBe(c.remove);
    expect(labels({ summary: summary('paused', 1) })).toEqual([
      'Resume Download',
      'Cancel Download',
      'Delete Download',
    ]);
  });

  it('a partial season offers the rest and delete; while downloading pause + cancel', () => {
    expect(labels({ summary: summary('done'), partial: true })).toEqual(['Download', 'Delete Download']);
    expect(labels({ summary: summary('paused', 1), partial: true })).toEqual([
      'Download',
      'Cancel Download',
      'Delete Download',
    ]);
    expect(labels({ summary: summary('downloading', 1), partial: true })).toEqual([
      'Pause Download',
      'Cancel Download',
      'Delete Download',
    ]);
  });
});

describe('ItemMenuProvider', () => {
  function Card({ of }: { of: BaseItemDto }) {
    const menu = useItemMenu();
    return <PosterCard title={of.Name} onPress={() => {}} onLongPress={() => menu(of)} />;
  }
  const show = (of: BaseItemDto) =>
    render(
      <ToastProvider>
        <ItemMenuProvider>
          <Card of={of} />
        </ItemMenuProvider>
      </ToastProvider>,
    );

  beforeEach(() => {
    jest.clearAllMocks();
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('a long press opens the menu titled like the card; Resume plays from the saved position', async () => {
    await show(
      item({
        Type: 'Episode',
        Name: 'Pilot',
        SeriesName: 'Show',
        ParentIndexNumber: 1,
        IndexNumber: 2,
        RunTimeTicks: 2400 * TICKS,
        UserData: { PlaybackPositionTicks: 600 * TICKS, Played: false },
      }),
    );
    await fireEvent(screen.getByRole('button', { name: 'Pilot' }), 'longPress');
    expect(screen.getByText('Show · S1:E2 · Pilot')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Resume' }));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/player', params: { id: 'i', start: '600' } });
  });

  it('Mark as Watched goes to the server; no Download until the user may download (/Users/Me)', async () => {
    const account = { id: 'a', server: 'https://jf.example.com', userId: 'u', userName: 'me', deviceId: 'd' };
    jest.spyOn(session, 'getSession').mockReturnValue({ accounts: [account], active: account } as never);
    jest.spyOn(session, 'connectionFor').mockReturnValue({} as never);
    const setPlayed = jest.spyOn(api, 'setPlayed').mockReturnValue(new Promise(() => {}));
    await show(item({}));
    await fireEvent(screen.getByRole('button', { name: 'Dune' }), 'longPress');
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Mark as Watched' }));
    expect(setPlayed).toHaveBeenCalledWith(expect.anything(), 'i', true);
    await fireEvent(screen.getByRole('button', { name: 'Dune' }), 'longPress');
    expect(screen.queryByRole('menuitem', { name: 'Download' })).toBeNull();
  });

  it('closes the keyboard first; another account (switch, sign-out) closes the menu', async () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss');
    const useSession = jest.spyOn(session, 'useSession');
    useSession.mockReturnValue({ accounts: [], active: { id: 'a' } } as never);
    const { rerender } = await show(item({}));
    await fireEvent(screen.getByRole('button', { name: 'Dune' }), 'longPress');
    expect(dismiss).toHaveBeenCalled();
    expect(screen.getByRole('menuitem', { name: 'Play' })).toBeOnTheScreen();
    useSession.mockReturnValue({ accounts: [], active: undefined } as never);
    await rerender(
      <ToastProvider>
        <ItemMenuProvider>
          <Card of={item({})} />
        </ItemMenuProvider>
      </ToastProvider>,
    );
    expect(screen.queryByRole('menuitem', { name: 'Play' })).toBeNull();
  });
});
