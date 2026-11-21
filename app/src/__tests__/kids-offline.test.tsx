// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import * as api from '@/api';
import type { BaseItemDto } from '@/api';
import Kids from '@/app/kids';
import KidsDownloadsRoute from '@/app/kids-downloads';
import KidsSearchRoute from '@/app/kids-search';
import KidsShowRoute from '@/app/kids-show/[id]';
import * as snapshots from '@/downloadSnapshot';
import * as downloads from '@/downloads';
import type { Download } from '@/downloads';
import { forgetKids, setKids } from '@/kidsSettings';
import * as session from '@/session';
import { KIDS_SEARCH_DEBOUNCE_MS } from '@/useKidsSearch';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({ id: 'trains' }),
  useNavigation: () => ({ addListener: () => () => {} }),
}));
const { router } = jest.requireMock<{ router: { push: jest.Mock } }>('expo-router');

const server = { id: 'srv', url: 'https://jf.example.com', name: 'Home server', version: '12.1.0' };
let active: session.Account;
let seq = 0;
let now = 9_000_000;

const ep = (Id: string, IndexNumber: number, Played = false): BaseItemDto => ({
  Id,
  Name: Id,
  Type: 'Episode',
  SeriesId: 'trains',
  SeriesName: 'Tiny Trains',
  ParentIndexNumber: 1,
  IndexNumber,
  UserData: { PlaybackPositionTicks: 0, Played },
});
const movie = (Id: string): BaseItemDto => ({
  Id,
  Name: Id,
  Type: 'Movie',
  UserData: { PlaybackPositionTicks: 0, Played: false },
});
const saved = new Map<string, BaseItemDto>(
  [ep('The Dining Car', 1, true), ep('Station Day', 2), movie('Pond Jumpers'), movie('Scary Night')].map((i) => [
    i.Id,
    i,
  ]),
);
const dl = (itemId: string, fields: Partial<Download> = {}): Download => ({
  id: `${active.id}:${itemId}:${itemId}`,
  accountId: active.id,
  itemId,
  sourceId: itemId,
  title: itemId,
  path: `downloads/x/${itemId}/f.mkv`,
  status: 'done',
  bytes: 1,
  total: 1,
  createdAt: 0,
  pinned: false,
  snapshot: { poster: `p/${itemId}`, still: `s/${itemId}`, subtitles: [] },
  ...fields,
});
let list: Download[] = [];

beforeEach(() => {
  jest.clearAllMocks();
  active = { id: `srv.o${++seq}`, server, userId: `o${seq}`, userName: 'mia', deviceId: 'dev' };
  jest.spyOn(session, 'useSession').mockImplementation(() => ({ accounts: [active], active }));
  jest.spyOn(session, 'getSession').mockImplementation(() => ({ accounts: [active], active }));
  jest.spyOn(session, 'connectionFor').mockImplementation((a) => ({
    baseUrl: a.server.url,
    deviceId: a.deviceId,
    token: 'tok',
    accountId: a.id,
  }));
  now += 10_000;
  jest.spyOn(Date, 'now').mockImplementation(() => now);
  // Out of reach: the flag is up, every request fails.
  jest.spyOn(api, 'useOffline').mockReturnValue(true);
  jest.spyOn(api, 'request').mockRejectedValue(new api.ApiError('network'));
  list = [
    dl('The Dining Car', { seriesId: 'trains', seriesName: 'Tiny Trains', rating: 0 }),
    dl('Station Day', { seriesId: 'trains', seriesName: 'Tiny Trains', rating: 0 }),
    dl('Pond Jumpers', { rating: 0 }),
    dl('Scary Night', { rating: 17 }),
  ];
  jest.spyOn(downloads, 'useDownloadList').mockImplementation(() => list);
  jest.spyOn(snapshots, 'readSnapshotItem').mockImplementation((path) => saved.get(path.split('/')[2]) ?? null);
  jest.spyOn(snapshots, 'onDisk').mockReturnValue(true);
  jest.spyOn(snapshots, 'documentUri').mockImplementation((path) => `file:///${path}`);
  setKids(active.id, { account: true });
});

afterEach(() => {
  forgetKids(active.id);
  jest.mocked(Date.now).mockRestore();
});

describe('Kids mode offline', () => {
  it('Home: the downloaded shows and movies, the offline bar, no Offline card', async () => {
    await render(<Kids />);
    expect(screen.getByTestId('kids-downloaded')).toBeOnTheScreen();
    expect(screen.getByText("✈︎ Offline · showing what's downloaded")).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /^Tiny Trains/ })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /^Pond Jumpers/ })).toBeOnTheScreen();
    expect(screen.queryByText(/Can't reach/)).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: /^Tiny Trains/ }));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/kids-show/[id]', params: { id: 'trains' } });
  });

  it('a shared phone: only downloads that pass the age (the saved score)', async () => {
    setKids(active.id, { account: false, shared: true, age: 7 });
    await render(<Kids />);
    expect(screen.getByRole('button', { name: /^Pond Jumpers/ })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^Scary Night/ })).toBeNull();
  });

  it('nothing downloaded: the moon, nothing to press', async () => {
    list = [];
    await render(<Kids />);
    expect(screen.getByText('Nothing to watch offline')).toBeOnTheScreen();
    expect(screen.queryByText('Nothing to watch yet.')).toBeNull();
  });

  it('kids Downloads with nothing downloaded: says so', async () => {
    list = [];
    await render(<KidsDownloadsRoute />);
    expect(screen.getByText('Nothing Downloaded')).toBeOnTheScreen();
  });

  it("a show's page with none of its episodes left on the phone: says so", async () => {
    list = [];
    await render(<KidsShowRoute />);
    expect(screen.getByText('None of its episodes are on this phone.')).toBeOnTheScreen();
  });

  it("a show's page: its downloaded episodes, the first not watched marked next", async () => {
    await render(<KidsShowRoute />);
    expect(screen.getByRole('button', { name: /The Dining Car/ })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /^Next: .*Station Day/ })).toBeOnTheScreen();
  });

  it('search: only the downloads, by name (an episode by its show too)', async () => {
    jest.useFakeTimers({ doNotFake: ['Date'] });
    await render(<KidsSearchRoute />);
    await fireEvent.changeText(screen.getByLabelText('Find a show'), 'train');
    await act(() => jest.advanceTimersByTime(KIDS_SEARCH_DEBOUNCE_MS));
    expect(screen.getByRole('button', { name: /^Tiny Trains/ })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /Station Day/ })).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('Find a show'), 'zzq');
    await act(() => jest.advanceTimersByTime(KIDS_SEARCH_DEBOUNCE_MS));
    expect(screen.getByText('Nothing called that.')).toBeOnTheScreen();
    jest.useRealTimers();
  });
});
