// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render as rtlRender, screen } from '@testing-library/react-native';
import { Paths } from 'expo-file-system';
import type { ReactElement } from 'react';
import { Alert, type AlertButton } from 'react-native';

import * as api from '@/api';
import { ApiError, type BaseItemDto } from '@/api';
import ItemDetail from '@/app/item/[id]';
import { ItemMenuProvider } from '@/components/ItemMenu';
import { ToastProvider } from '@/components/Toast';
import * as downloads from '@/downloads';
import { initDownloads } from '@/downloads';
import * as session from '@/session';
import { setDownloadLimit } from '@/settings';

import NativeDownloads from '../../modules/downloads';

const render = (ui: ReactElement) =>
  rtlRender(
    <ToastProvider>
      <ItemMenuProvider>{ui}</ItemMenuProvider>
    </ToastProvider>,
  );

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
let me: api.UserDto;
const GB = 1024 ** 3;
const native = jest.mocked(NativeDownloads);
// Native events, as the store's listeners get them.
const emit = (event: string, payload: object) =>
  native.addListener.mock.calls.filter(([e]) => e === event).forEach(([, fn]) => (fn as (p: object) => void)(payload));

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
  me = { Id: `u${seq}`, Name: 'anna', Policy: { EnableContentDownloading: true } };
  request.mockImplementation((_conn, path) => (path === '/Users/Me' ? Promise.resolve(me) : reply()) as Promise<never>);
  jest.spyOn(Paths, 'availableDiskSpace', 'get').mockReturnValue(500 * GB);
  jest.spyOn(Paths, 'totalDiskSpace', 'get').mockReturnValue(1000 * GB);
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

  it('opens a media row to list every track, default ticked, and closes it again', async () => {
    await render(<ItemDetail />);
    const subtitles = await screen.findByRole('button', { name: 'Subtitles (2)' });
    expect(screen.queryByText('English - SUBRIP')).toBeNull();

    await fireEvent.press(subtitles);
    expect(screen.getByText('Off')).toBeOnTheScreen();
    expect(screen.getByText('German - Default - SUBRIP')).toBeOnTheScreen();
    expect(screen.getByText('English - SUBRIP')).toBeOnTheScreen();
    expect(subtitles.props.accessibilityState).toMatchObject({ expanded: true });

    await fireEvent.press(subtitles);
    expect(screen.queryByText('English - SUBRIP')).toBeNull();
    // One short track: plain row, nothing to open.
    expect(screen.queryByRole('button', { name: 'Video' })).toBeNull();
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

  it('downloads from the header: ring while downloading, pause / resume, ✓ when done, delete after asking', async () => {
    const withSize = { ...sintel, MediaSources: [{ ...sintel.MediaSources![0], Container: 'mkv', Size: 2 * GB }] };
    reply = () => Promise.resolve(withSize);
    initDownloads(); // native event listeners (cleared mocks: register them inside this test)
    await render(<ItemDetail />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Download' }));
    expect(native.enqueue).toHaveBeenCalledWith(
      [expect.objectContaining({ url: 'https://jf.example.com/Items/ms/Download', size: 2 * GB })],
      { cellular: false },
    );
    const id = native.enqueue.mock.calls[0][0][0].id;

    await act(() => emit('progress', { id, bytes: GB }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Downloading', value: { text: '50%' } }));
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Pause Download' }));
    expect(native.pause).toHaveBeenCalledWith(id);
    await fireEvent.press(screen.getByRole('button', { name: 'Download paused' }));
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Resume Download' }));
    expect(native.resume).toHaveBeenCalledWith(id);

    await act(() => emit('done', { id }));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await fireEvent.press(screen.getByRole('button', { name: 'Downloaded, delete download' }));
    const buttons = alert.mock.calls[0][2] as AlertButton[];
    await act(() => buttons.find((b) => b.style === 'destructive')?.onPress?.());
    expect(native.cancel).toHaveBeenCalledWith(id);
    expect(screen.getByRole('button', { name: 'Download' })).toBeOnTheScreen();
  });

  it('hides Download when the user may not download', async () => {
    me = { ...me, Policy: { EnableContentDownloading: false } };
    await render(<ItemDetail />);
    expect(await screen.findByRole('header', { name: 'Sintel' })).toBeOnTheScreen();
    expect(request).toHaveBeenCalledWith(expect.anything(), '/Users/Me', expect.anything());
    expect(screen.queryByRole('button', { name: 'Download' })).toBeNull();
  });

  it('says when the server sends no file size', async () => {
    await render(<ItemDetail />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Download' }));
    expect(await screen.findByText("Nothing to download - the server didn't send a file.")).toBeOnTheScreen();
  });

  it('says when there is not enough space', async () => {
    reply = () => Promise.resolve({ ...sintel, MediaSources: [{ ...sintel.MediaSources![0], Size: 600 * GB }] });
    await render(<ItemDetail />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Download' }));
    expect(await screen.findByText('Not enough free space on this device.')).toBeOnTheScreen();
  });

  it('says when the download would go over the storage limit', async () => {
    setDownloadLimit(1);
    try {
      reply = () => Promise.resolve({ ...sintel, MediaSources: [{ ...sintel.MediaSources![0], Size: 2 * GB }] });
      await render(<ItemDetail />);
      await fireEvent.press(await screen.findByRole('button', { name: 'Download' }));
      expect(
        await screen.findByText('This would go over your download storage limit. Change it in Settings.'),
      ).toBeOnTheScreen();
    } finally {
      setDownloadLimit(0);
    }
  });

  it('marks as watched at once, before the server answers', async () => {
    const setPlayed = jest.spyOn(api, 'setPlayed').mockReturnValue(new Promise(() => {}));
    await render(<ItemDetail />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Watched', selected: false }));
    expect(screen.getByRole('button', { name: 'Watched', selected: true })).toBeOnTheScreen();
    expect(setPlayed).toHaveBeenCalledWith(expect.objectContaining({ accountId: expect.any(String) }), sintel.Id, true);
  });

  it('puts a failed favourite back and says why', async () => {
    jest.spyOn(api, 'setFavourite').mockRejectedValue(new ApiError('network'));
    await render(<ItemDetail />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Favourite' }));
    expect(
      await screen.findByText("Couldn't add to favourites. Check your connection and try again."),
    ).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Favourite', selected: false })).toBeOnTheScreen();
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
    // Long press: the item's menu.
    await fireEvent(screen.getByRole('button', { name: 'Tears of Steel, 2012' }), 'longPress');
    expect(screen.getByText('Tears of Steel · 2012')).toBeOnTheScreen();
    expect(screen.getByRole('menuitem', { name: 'Play' })).toBeOnTheScreen();
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
    expect(await screen.findByRole('button', { name: 'Watched', selected: true })).toBeOnTheScreen();
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

  it('shows a placeholder, then an error with Retry + Go to Downloads when offline', async () => {
    let fail!: () => void;
    reply = () => new Promise((_, reject) => (fail = () => reject(new ApiError('network'))));
    await render(<ItemDetail />);
    expect(screen.getByTestId('detail-placeholder')).toBeOnTheScreen();
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
    expect(screen.queryByTestId('spinner')).toBeNull();
    fail();
    expect(await screen.findByText("Check your connection, or watch something you've downloaded.")).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Go to Downloads' })).toBeOnTheScreen();
    reply = () => Promise.resolve(sintel);
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('header', { name: 'Sintel' })).toBeOnTheScreen();
  });

  describe('offline, with a download of it', () => {
    const art = 'file:///docs/downloads/a/m/backdrop.jpg';
    const saved = { item: { ...sintel, Overview: 'Saved with the download.' }, art };
    beforeEach(() => {
      jest.spyOn(downloads, 'savedItem').mockReturnValue(saved);
    });
    afterEach(() => {
      jest.mocked(downloads.savedItem).mockRestore();
    });

    it('shows the item saved with the download instead of the error: its own art, no More Like This', async () => {
      reply = () => Promise.reject(new ApiError('network'));
      await render(<ItemDetail />);
      expect(await screen.findByText('Showing the details saved with the download.')).toBeOnTheScreen();
      expect(downloads.savedItem).toHaveBeenCalledWith(expect.stringMatching(/^srv\.u/), sintel.Id);
      expect(screen.getByRole('header', { name: 'Sintel' })).toBeOnTheScreen();
      expect(screen.getByText('Saved with the download.')).toBeOnTheScreen();
      expect(screen.getByTestId('detail-backdrop').props.source).toEqual([expect.objectContaining({ uri: art })]);
      expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    });

    it('known offline: at once, without waiting for the request; the server answer replaces it', async () => {
      const offline = jest.spyOn(api, 'useOffline').mockReturnValue(true);
      let answer!: () => void;
      reply = () => new Promise((resolve) => (answer = () => resolve(sintel)));
      await render(<ItemDetail />);
      expect(screen.getByText('Showing the details saved with the download.')).toBeOnTheScreen();
      answer();
      expect(await screen.findByText(/^A wandering warrior/)).toBeOnTheScreen();
      expect(screen.queryByText('Showing the details saved with the download.')).toBeNull();
      offline.mockRestore();
    });

    it('a 404 (gone from the server) still shows it - the file on the phone plays', async () => {
      reply = () => Promise.reject(new ApiError('http', 404));
      await render(<ItemDetail />);
      expect(await screen.findByText('Showing the details saved with the download.')).toBeOnTheScreen();
    });

    it('online, the server answer wins and the saved copy stays hidden while loading', async () => {
      let answer!: () => void;
      reply = () => new Promise((resolve) => (answer = () => resolve(sintel)));
      await render(<ItemDetail />);
      expect(screen.getByTestId('detail-placeholder')).toBeOnTheScreen();
      answer();
      expect(await screen.findByText(/^A wandering warrior/)).toBeOnTheScreen();
      expect(screen.queryByText('Showing the details saved with the download.')).toBeNull();
    });
  });
});
