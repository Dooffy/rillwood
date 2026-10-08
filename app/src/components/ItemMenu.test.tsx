// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Keyboard } from 'react-native';

import * as api from '@/api';
import type { BaseItemDto } from '@/api';
import * as session from '@/session';

import { PosterCard } from './Card';
import { itemActions, ItemMenuProvider, useItemMenu } from './ItemMenu';
import { ToastProvider } from './Toast';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
const { router } = jest.requireMock<{ router: { push: jest.Mock } }>('expo-router');

const TICKS = 10_000_000;
const item = (over: Partial<BaseItemDto>): BaseItemDto => ({ Id: 'i', Name: 'Dune', Type: 'Movie', ...over });
const labels = (x: BaseItemDto) => itemActions(x, { mark: jest.fn(), download: jest.fn() }).map((a) => a.label);

describe('itemActions', () => {
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

  it('a show has no Play (its detail picks the episode); a collection no Download', () => {
    expect(labels(item({ Type: 'Series' }))).toEqual(['Mark as Watched', 'Add to Favourites', 'Download']);
    expect(labels(item({ Type: 'BoxSet' }))).toEqual(['Mark as Watched', 'Add to Favourites']);
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

  it('Mark as Watched goes to the server; Download is a placeholder', async () => {
    const account = { id: 'a', server: 'https://jf.example.com', userId: 'u', userName: 'me', deviceId: 'd' };
    jest.spyOn(session, 'getSession').mockReturnValue({ accounts: [account], active: account } as never);
    jest.spyOn(session, 'connectionFor').mockReturnValue({} as never);
    const setPlayed = jest.spyOn(api, 'setPlayed').mockReturnValue(new Promise(() => {}));
    await show(item({}));
    await fireEvent(screen.getByRole('button', { name: 'Dune' }), 'longPress');
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Mark as Watched' }));
    expect(setPlayed).toHaveBeenCalledWith(expect.anything(), 'i', true);
    await fireEvent(screen.getByRole('button', { name: 'Dune' }), 'longPress');
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Download' }));
    expect(await screen.findByText('Coming in a later build.')).toBeOnTheScreen();
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
