// SPDX-License-Identifier: GPL-3.0-or-later
// Apple TV movie / episode detail (screen draft 07): everything on the art, focus on Play, the round buttons, the
// summary panel.
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { BackHandler, Platform } from 'react-native';

import * as api from '@/api';
import type { BaseItemDto } from '@/api';
import ItemDetail from '@/app/item/[id]';
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

const LONG = 'A wandering warrior finds an unlikely friend in the form of a young dragon. '.repeat(5).trim();
const sintel: BaseItemDto = {
  Id: 'ecdda3284954ff60759e87e5ddb37fb8',
  Name: 'Sintel',
  Type: 'Movie',
  ProductionYear: 2010,
  RunTimeTicks: 6_789_160_000,
  OfficialRating: 'PG',
  CommunityRating: 7.3,
  Overview: 'A wandering warrior finds an unlikely friend.',
  Genres: ['Animation', 'Fantasy'],
  BackdropImageTags: ['bd'],
  UserData: { PlaybackPositionTicks: 0, Played: false, IsFavorite: true },
  MediaSources: [
    {
      Id: 'ms',
      Size: 1_200_000_000,
      Container: 'mkv',
      MediaStreams: [
        { Type: 'Video', Index: 0, DisplayTitle: '4K H264 SDR', Width: 4096, Height: 1744, VideoRangeType: 'SDR' },
        { Type: 'Audio', Index: 1, DisplayTitle: 'English - Dolby Digital - 5.1', IsDefault: true, Channels: 6 },
        { Type: 'Audio', Index: 2, DisplayTitle: 'German - AAC - Stereo', Channels: 2 },
      ],
    },
  ],
  People: [
    { Id: 'p1', Name: 'Halina Reijn', Role: 'Sintel (voice)', Type: 'Actor' },
    { Id: 'p2', Name: 'Colin Levy', Role: 'Director', Type: 'Director' },
  ],
};
const episode: BaseItemDto = {
  Id: '18e738617382d907c7906c228445061b',
  Name: 'Test Show S01E02',
  Type: 'Episode',
  IndexNumber: 2,
  ParentIndexNumber: 1,
  SeriesId: '2f2b4d74c89506a4e27483ec91db59e2',
  SeriesName: 'Test Show',
  RunTimeTicks: 1_200_210_000,
  Overview: LONG,
  UserData: { PlaybackPositionTicks: 400_000_000, Played: false },
};
let item: BaseItemDto;

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
  item = sintel;
  useLocalSearchParams.mockImplementation(() => ({ id: item.Id }));
  request.mockImplementation(() => Promise.resolve(item) as Promise<never>);
});
afterEach(() => {
  Object.defineProperty(Platform, 'isTV', isTV);
});

const renderTv = () =>
  render(
    <ToastProvider>
      <ItemMenuProvider>
        <TvMenuHost>
          <ItemDetail />
        </TvMenuHost>
      </ItemMenuProvider>
    </ToastProvider>,
  );

describe('Item detail on Apple TV', () => {
  it('shows everything on the art; focus starts on Play; credits bottom right; no phone header', async () => {
    await renderTv();
    expect(await screen.findByRole('header', { name: 'Sintel' })).toBeOnTheScreen();
    expect(screen.getByText('Movie · Animation · Fantasy')).toBeOnTheScreen();
    expect(screen.getByText(/^2010 · 12m · Ends at .+ · ★ 7\.3$/)).toBeOnTheScreen();
    // On the art, and again in About (Details below).
    expect(screen.getAllByText('A wandering warrior finds an unlikely friend.')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Play' }).props.hasTVPreferredFocus).toBe(true);
    expect(within(screen.getByTestId('tv-credits')).getByText('Colin Levy')).toBeOnTheScreen();
    // Not started: no Play from Start. A short summary isn't a button.
    expect(screen.queryByRole('button', { name: 'Play from Start' })).toBeNull();
    expect(screen.queryByText('More')).toBeNull();
    expect(screen.queryByTestId('detail-hero')).toBeNull();
  });

  it('plays, and the round buttons name what a click does', async () => {
    const setPlayed = jest.spyOn(api, 'setPlayed').mockReturnValue(new Promise(() => {}));
    const setFavourite = jest.spyOn(api, 'setFavourite').mockReturnValue(new Promise(() => {}));
    await renderTv();
    await fireEvent.press(await screen.findByRole('button', { name: 'Play' }));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/player', params: { id: sintel.Id, start: '0' } });
    // On: a lighter fill, read as selected.
    expect(screen.getByRole('button', { name: 'Remove from Favourites' }).props.accessibilityState).toMatchObject({
      selected: true,
    });
    expect(screen.getByRole('button', { name: 'Mark Watched' }).props.accessibilityState).toMatchObject({
      selected: false,
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Mark Watched' }));
    expect(setPlayed).toHaveBeenCalledWith(expect.anything(), sintel.Id, true);
    // A favourite already: the button takes it off.
    await fireEvent.press(screen.getByRole('button', { name: 'Remove from Favourites' }));
    expect(setFavourite).toHaveBeenCalledWith(expect.anything(), sintel.Id, false);
  });

  it('an episode in progress: series name on top, Resume with time left, Play from Start', async () => {
    item = episode;
    await renderTv();
    expect(await screen.findByText('TEST SHOW')).toBeOnTheScreen();
    const resume = screen.getByRole('button', { name: /^Resume, .+ left$/ });
    expect(resume.props.hasTVPreferredFocus).toBe(true);
    await fireEvent.press(resume);
    expect(router.push).toHaveBeenLastCalledWith({ pathname: '/player', params: { id: episode.Id, start: '40' } });
    await fireEvent.press(screen.getByRole('button', { name: 'Play from Start' }));
    expect(router.push).toHaveBeenLastCalledWith({ pathname: '/player', params: { id: episode.Id, start: '0' } });
  });

  it('loading: a placeholder laid out like the TV screen, not the tablet one', async () => {
    request.mockImplementation(() => new Promise(() => {}));
    await renderTv();
    expect(screen.getByTestId('tv-detail-placeholder')).toBeOnTheScreen();
    expect(screen.queryByTestId('detail-placeholder')).toBeNull();
  });

  it('a long summary is focusable and opens the whole text in a panel', async () => {
    item = episode;
    await renderTv();
    await fireEvent.press(await screen.findByRole('button', { name: LONG }));
    const panel = within(screen.getByTestId('tv-menu-card'));
    expect(panel.getByText(LONG)).toBeOnTheScreen();
    await fireEvent.press(panel.getByRole('button', { name: 'Done' }));
    expect(screen.queryByTestId('tv-menu')).toBeNull();
  });

  it('below the hero: Cast & Crew, More Like This and Details; the Media card opens every track', async () => {
    request.mockImplementation(
      (_conn, path) =>
        (String(path).includes('/Similar')
          ? Promise.resolve({ Items: [{ Id: 'tears', Name: 'Tears of Steel', Type: 'Movie', ProductionYear: 2012 }] })
          : Promise.resolve(item)) as Promise<never>,
    );
    await renderTv();
    expect(await screen.findByRole('header', { name: 'Cast & Crew' })).toBeOnTheScreen();
    // Focusable so the shelf scrolls, nothing to click yet.
    expect(screen.getByRole('button', { name: 'Halina Reijn, Sintel (voice)' })).toBeOnTheScreen();
    expect(await screen.findByRole('header', { name: 'More Like This' })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Tears of Steel, 2012' }));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/item/[id]', params: { id: 'tears' } });
    const details = within(screen.getByTestId('tv-details'));
    expect(details.getByRole('header', { name: 'About' })).toBeOnTheScreen();
    expect(details.getByText('Audio (2)')).toBeOnTheScreen();
    await fireEvent.press(details.getByRole('button', { name: 'Media' }));
    const panel = within(screen.getByTestId('tv-menu-card'));
    expect(panel.getByLabelText('English - Dolby Digital - 5.1, default')).toBeOnTheScreen();
    expect(panel.getByLabelText('German - AAC - Stereo')).toBeOnTheScreen();
  });

  it('scrolled below the hero: the art dims and Back comes back up instead of leaving', async () => {
    const back: (() => boolean)[] = [];
    const add = jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_, handler) => {
      back.push(handler as () => boolean);
      return { remove: () => {} };
    });
    await renderTv();
    await screen.findByRole('header', { name: 'Sintel' });
    expect(screen.queryByTestId('tv-detail-dim')).toBeNull();
    expect(back).toHaveLength(0);
    await fireEvent.scroll(screen.getByTestId('tv-detail-scroll'), { nativeEvent: { contentOffset: { y: 900 } } });
    expect(screen.getByTestId('tv-detail-dim')).toBeOnTheScreen();
    let handled = false;
    await act(() => {
      handled = back.at(-1)!();
    });
    expect(handled).toBe(true);
    add.mockRestore();
  });
});
