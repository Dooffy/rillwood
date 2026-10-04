// SPDX-License-Identifier: GPL-3.0-or-later
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render as rtlRender, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import * as api from '@/api';
import { ApiError, type BaseItemDto } from '@/api';
import ItemDetail from '@/app/item/[id]';
import { ToastProvider } from '@/components/Toast';
import * as session from '@/session';

const render = (ui: ReactElement) => rtlRender(<ToastProvider>{ui}</ToastProvider>);

// Stack.Screen renders its headerRight so the header's Download button is testable.
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useLocalSearchParams: jest.fn(),
  Stack: { Screen: ({ options }: { options?: { headerRight?: () => unknown } }) => options?.headerRight?.() ?? null },
}));
const { router, useLocalSearchParams } = jest.requireMock<{
  router: { push: jest.Mock };
  useLocalSearchParams: jest.Mock;
}>('expo-router');

const server = { id: 'srv', url: 'https://jf.example.com', name: 'Home server', version: '12.1.0' };
let seq = 0;
const request = jest.spyOn(api, 'request');

// Trimmed from the 12.1 dev server.
const sintel: BaseItemDto = {
  Id: 'ecdda3284954ff60759e87e5ddb37fb8',
  Name: 'Sintel',
  Type: 'Movie',
  ProductionYear: 2010,
  RunTimeTicks: 6_789_160_000,
  OfficialRating: 'PG',
  CommunityRating: 7.3,
  Overview: 'A wandering warrior finds an unlikely friend in the form of a young dragon.',
  Genres: ['Animation', 'Fantasy'],
  ImageTags: { Primary: 'p' },
  BackdropImageTags: ['bd'],
  UserData: { PlaybackPositionTicks: 0, Played: false },
  MediaSources: [
    {
      Id: 'ms',
      Name: 'Sintel (2010)',
      MediaStreams: [
        { Type: 'Video', Index: 0, DisplayTitle: '4K H264 SDR', Width: 4096, Height: 1744, VideoRangeType: 'SDR' },
        { Type: 'Audio', Index: 1, DisplayTitle: 'English - Dolby Digital - 5.1', IsDefault: true, Channels: 6 },
        { Type: 'Subtitle', Index: 2, DisplayTitle: 'German - Default - SUBRIP', IsDefault: true },
        { Type: 'Subtitle', Index: 3, DisplayTitle: 'English - SUBRIP' },
      ],
    },
  ],
  People: [
    { Id: 'p1', Name: 'Halina Reijn', Role: 'Sintel (voice)', Type: 'Actor', PrimaryImageTag: 'hr' },
    { Id: 'p2', Name: 'Colin Levy', Role: 'Director', Type: 'Director' },
    { Id: 'p3', Name: 'Ton Roosendaal', Type: 'Producer' },
  ],
};

const episode: BaseItemDto = {
  Id: '18e738617382d907c7906c228445061b',
  Name: 'Test Show S01E02',
  Type: 'Episode',
  IndexNumber: 2,
  ParentIndexNumber: 1,
  SeasonName: 'Season 1',
  SeriesId: '2f2b4d74c89506a4e27483ec91db59e2',
  SeriesName: 'Test Show',
  RunTimeTicks: 1_200_210_000,
  ImageTags: { Primary: 'still' },
  UserData: { PlaybackPositionTicks: 400_000_000, Played: false },
};

let reply: () => Promise<unknown>;

beforeEach(() => {
  jest.clearAllMocks();
  // A new account per test: the useFetch cache outlives a test, and accounts never share entries.
  const account = { id: `srv.u${++seq}`, server, userId: `u${seq}`, userName: 'anna', deviceId: 'dev' };
  jest.spyOn(session, 'useSession').mockImplementation(() => ({ accounts: [account], active: account }));
  jest.spyOn(session, 'getSession').mockImplementation(() => ({ accounts: [account], active: account }));
  jest.spyOn(session, 'connectionFor').mockImplementation((a) => ({
    baseUrl: a.server.url,
    deviceId: a.deviceId,
    token: 'tok-secret',
    accountId: a.id,
  }));
  useLocalSearchParams.mockReturnValue({ id: sintel.Id });
  reply = () => Promise.resolve(sintel);
  request.mockImplementation(() => reply() as Promise<never>);
});

describe('ItemDetail', () => {
  it('loads the item by id and shows title, chips, overview and genres', async () => {
    await render(<ItemDetail />);
    expect(await screen.findByRole('header', { name: 'Sintel' })).toBeOnTheScreen();
    expect(request).toHaveBeenCalledWith(expect.anything(), `/Items/${sintel.Id}`, expect.anything());
    expect(screen.getByLabelText(/^2010, 12m, Ends at .+, PG, ★ 7\.3, 4K, 5\.1, CC$/)).toBeOnTheScreen();
    expect(screen.getByText(/^A wandering warrior/)).toBeOnTheScreen();
    expect(screen.getByText('Movie · Animation · Fantasy')).toBeOnTheScreen();
  });

  it('shows the backdrop from the active server, without a token', async () => {
    await render(<ItemDetail />);
    const backdrop = await screen.findByTestId('detail-backdrop');
    const [{ uri }] = backdrop.props.source as { uri: string }[];
    expect(uri).toMatch(/^https:\/\/jf\.example\.com\/Items\/ecdda3284954ff60759e87e5ddb37fb8\/Images\/Backdrop\?/);
    expect(uri).not.toMatch(/tok-secret|api_?key/i);
  });

  it('shows what plays by default, with track counts', async () => {
    await render(<ItemDetail />);
    expect(await screen.findByText('MEDIA')).toBeOnTheScreen();
    expect(screen.getByText('4K H264 SDR')).toBeOnTheScreen();
    expect(screen.getByText('English - Dolby Digital - 5.1')).toBeOnTheScreen();
    expect(screen.getByText('Subtitles (2)')).toBeOnTheScreen();
    expect(screen.getByText('German - Default - SUBRIP')).toBeOnTheScreen();
    expect(screen.queryByText(/^Version/)).toBeNull();
  });

  it('lists cast, then crew, without producers', async () => {
    await render(<ItemDetail />);
    expect(await screen.findByLabelText('Halina Reijn, Sintel (voice)')).toBeOnTheScreen();
    expect(screen.getByLabelText('Colin Levy, Director')).toBeOnTheScreen();
    expect(screen.queryByText('Ton Roosendaal')).toBeNull();
  });

  it('shows the logo as the title when the item has one', async () => {
    reply = () => Promise.resolve({ ...sintel, ImageTags: { ...sintel.ImageTags, Logo: 'logo' } });
    await render(<ItemDetail />);
    const logo = await screen.findByTestId('detail-logo');
    expect(logo).toHaveProp('accessibilityLabel', 'Sintel');
    expect((logo.props.source as { uri: string }[])[0].uri).toContain('/Images/Logo?');
    expect(screen.queryByText('Sintel')).toBeNull();
  });

  it('clamps a long overview to 3 lines with More / Less', async () => {
    const long = 'A wandering warrior finds an unlikely friend. '.repeat(5).trim();
    reply = () => Promise.resolve({ ...sintel, Overview: long });
    await render(<ItemDetail />);
    const text = await screen.findByText(long);
    expect(text).toHaveProp('numberOfLines', 3);
    await fireEvent.press(screen.getByText('More'));
    expect(screen.getByText(long).props.numberOfLines).toBeUndefined();
    expect(screen.getByText('Less')).toBeOnTheScreen();
  });

  it('shows Atmos and SDH badges from the streams', async () => {
    const [source] = sintel.MediaSources!;
    const streams = source.MediaStreams!.map((st) =>
      st.Type === 'Audio'
        ? { ...st, Profile: 'TrueHD + Atmos' }
        : st.Index === 3
          ? { ...st, IsHearingImpaired: true }
          : st,
    );
    reply = () => Promise.resolve({ ...sintel, MediaSources: [{ ...source, MediaStreams: streams }] });
    await render(<ItemDetail />);
    expect(await screen.findByLabelText(/, 5\.1, Dolby Atmos, SDH$/)).toBeOnTheScreen();
  });

  it('Download is a placeholder for now', async () => {
    await render(<ItemDetail />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Download' }));
    expect(await screen.findByText('Coming in a later build.')).toBeOnTheScreen();
  });

  it('marks as watched at once, before the server answers', async () => {
    const setPlayed = jest.spyOn(api, 'setPlayed').mockReturnValue(new Promise(() => {}));
    await render(<ItemDetail />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Mark as watched', selected: false }));
    expect(screen.getByRole('button', { name: 'Mark as unwatched', selected: true })).toBeOnTheScreen();
    expect(setPlayed).toHaveBeenCalledWith(expect.objectContaining({ accountId: expect.any(String) }), sintel.Id, true);
  });

  it('puts a failed favourite back and says why', async () => {
    jest.spyOn(api, 'setFavourite').mockRejectedValue(new ApiError('network'));
    await render(<ItemDetail />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Add to favourites' }));
    expect(
      await screen.findByText("Couldn't add to favourites. Check your connection and try again."),
    ).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Add to favourites', selected: false })).toBeOnTheScreen();
  });

  it('names the directors and shows More Like This', async () => {
    const similarMovie = { Id: 'tears', Name: 'Tears of Steel', Type: 'Movie', ProductionYear: 2012 };
    request.mockImplementation(
      (_conn, path) =>
        (path.endsWith('/Similar')
          ? Promise.resolve({ Items: [similarMovie], TotalRecordCount: 1 })
          : reply()) as Promise<never>,
    );
    await render(<ItemDetail />);
    expect(await screen.findByText(/^Directed by/)).toHaveTextContent('Directed by Colin Levy');
    expect(await screen.findByText('More Like This')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Tears of Steel, 2012' }));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/item/[id]', params: { id: 'tears' } });
  });

  it('hides More Like This when there is nothing similar', async () => {
    await render(<ItemDetail />);
    await screen.findByRole('header', { name: 'Sintel' });
    expect(screen.queryByText('More Like This')).toBeNull();
  });

  it('plays from the start when nothing is watched', async () => {
    await render(<ItemDetail />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Play' }));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/player', params: { id: sintel.Id, start: '0' } });
    expect(screen.queryByRole('button', { name: 'Play from Start' })).toBeNull();
  });

  it('offers Resume at the saved position and Play from Start for an episode in progress', async () => {
    useLocalSearchParams.mockReturnValue({ id: episode.Id });
    reply = () => Promise.resolve(episode);
    await render(<ItemDetail />);
    expect(await screen.findByRole('header', { name: 'Test Show S01E02' })).toBeOnTheScreen();
    expect(screen.getByText('S1:E2 · Season 1')).toBeOnTheScreen();
    expect(screen.getByText('2m left')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Resume' }));
    expect(router.push).toHaveBeenLastCalledWith({ pathname: '/player', params: { id: episode.Id, start: '40' } });
    await fireEvent.press(screen.getByRole('button', { name: 'Play from Start' }));
    expect(router.push).toHaveBeenLastCalledWith({ pathname: '/player', params: { id: episode.Id, start: '0' } });
  });

  it('shows no bare "left" when the position is at the runtime', async () => {
    useLocalSearchParams.mockReturnValue({ id: episode.Id });
    reply = () => Promise.resolve({ ...episode, UserData: { PlaybackPositionTicks: 1_200_210_000, Played: false } });
    await render(<ItemDetail />);
    expect(await screen.findByRole('button', { name: 'Resume' })).toBeOnTheScreen();
    expect(screen.queryByText(/left$/)).toBeNull();
  });

  it('opens the series from an episode', async () => {
    useLocalSearchParams.mockReturnValue({ id: episode.Id });
    reply = () => Promise.resolve(episode);
    await render(<ItemDetail />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Test Show' }));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/series/[id]', params: { id: episode.SeriesId } });
  });

  it('marks a watched item', async () => {
    reply = () => Promise.resolve({ ...sintel, UserData: { PlaybackPositionTicks: 0, Played: true } });
    await render(<ItemDetail />);
    // The filled ✓ says it; no separate label.
    expect(await screen.findByRole('button', { name: 'Mark as unwatched', selected: true })).toBeOnTheScreen();
    expect(screen.queryByText('✓ Watched')).toBeNull();
    expect(screen.getByRole('button', { name: 'Play' })).toBeOnTheScreen();
  });

  it.each([[''], ['00000000-0000-0000-0000-000000000000']])('never loads the empty id %p', async (id) => {
    useLocalSearchParams.mockReturnValue({ id });
    await render(<ItemDetail />);
    expect(screen.getByText("This item isn't available.")).toBeOnTheScreen();
    expect(request).not.toHaveBeenCalled();
  });

  it('says so when the item is gone (404)', async () => {
    reply = () => Promise.reject(new ApiError('http', 404));
    await render(<ItemDetail />);
    expect(await screen.findByText("This item isn't available.")).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('shows a spinner, then an error with Retry when offline', async () => {
    let fail!: () => void;
    reply = () => new Promise((_, reject) => (fail = () => reject(new ApiError('network'))));
    await render(<ItemDetail />);
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
    fail();
    expect(await screen.findByText("Couldn't reach the server.")).toBeOnTheScreen();
    reply = () => Promise.resolve(sintel);
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('header', { name: 'Sintel' })).toBeOnTheScreen();
  });
});
