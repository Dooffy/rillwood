// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';

import * as api from '@/api';
import type { BaseItemDto } from '@/api';
import Kids from '@/app/kids';
import KidsDownloadsRoute from '@/app/kids-downloads';
import KidsSearchRoute from '@/app/kids-search';
import KidsShowRoute from '@/app/kids-show/[id]';
import { ToastProvider } from '@/components/Toast';
import * as snapshots from '@/downloadSnapshot';
import * as downloads from '@/downloads';
import type { Download } from '@/downloads';
import { forgetKids, getKids, setKids } from '@/kidsSettings';
import * as session from '@/session';
import { KIDS_SEARCH_DEBOUNCE_MS } from '@/useKidsSearch';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({ id: 'trains' }),
  useNavigation: () => ({ addListener: () => () => {} }),
  Stack: { Screen: jest.fn(() => null) },
}));
const { Stack } = jest.requireMock<{ Stack: { Screen: jest.Mock } }>('expo-router');
/** The page's header button (rendered by the native header, so drawn here on its own). */
const headerRight = () =>
  (Stack.Screen.mock.lastCall?.[0] as { options: { headerRight: () => React.ReactElement } }).options.headerRight();
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

  it('kids Downloads on a shared phone: what the age keeps out is counted under the list, not listed', async () => {
    setKids(active.id, { account: false, shared: true, age: 7 });
    await render(
      <ToastProvider>
        <KidsDownloadsRoute />
      </ToastProvider>,
    );
    expect(screen.getByText('Pond Jumpers')).toBeOnTheScreen();
    expect(screen.queryByText('Scary Night')).toBeNull();
    expect(
      screen.getByText(/^1 download not for Kids Mode \(.+\) isn't shown here\. Delete All removes it too\.$/),
    ).toBeOnTheScreen();
  });

  it('regression: downloads made before scores were saved show once scored (not counted unrated)', async () => {
    setKids(active.id, { account: false, shared: true, age: 7, unrated: false });
    list = list.map(({ rating: _, ...d }) => d);
    await render(<Kids />);
    expect(screen.getByText('Nothing to watch offline')).toBeOnTheScreen();
    // The next sync run scores them (`scoreUnrated`, downloads.test.ts).
    list = list.map((d) => ({ ...d, rating: d.itemId === 'Scary Night' ? 17 : 0 }));
    await render(<Kids />);
    expect(screen.getByRole('button', { name: /^Pond Jumpers/ })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /^Tiny Trains/ })).toBeOnTheScreen();
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

  describe('removing downloads (task 11)', () => {
    const done = (ids: string[]): downloads.DownloadSummary => ({
      state: 'done',
      progress: 1,
      ids,
      itemIds: ids,
      done: ids.length,
      size: ids.length,
      running: 0,
      failed: 0,
      waitingForNetwork: false,
    });

    beforeEach(() => {
      jest
        .spyOn(downloads, 'useDownloadSummary')
        .mockImplementation((group) => (group?.includes('trains') ? done(['d1', 'd2']) : group ? done(['m1']) : null));
    });

    it("offline, a show's menu offers only what works without the server", async () => {
      setKids(active.id, { account: true, kept: ['trains'] });
      await render(
        <ToastProvider>
          <KidsDownloadsRoute />
        </ToastProvider>,
      );
      await fireEvent.press(screen.getAllByRole('button', { name: 'Downloaded, more' })[0]);
      const labels = screen.getAllByRole('menuitem').map((m) => m.props.accessibilityLabel);
      expect(labels).toEqual(['Stop Keeping, The episodes here stay', 'Delete Downloads']);
    });

    it('Delete All (the header trash) asks first (count + size), then deletes every download and stops keeping', async () => {
      const alert = jest.spyOn(Alert, 'alert');
      const deleted = jest.spyOn(downloads, 'deleteDownloads').mockImplementation(() => {});
      setKids(active.id, { account: true, kept: ['trains'] });
      await render(
        <ToastProvider>
          <KidsDownloadsRoute />
        </ToastProvider>,
      );
      await render(headerRight());
      await fireEvent.press(screen.getByRole('button', { name: 'Delete All Downloads' }));
      const [title, text, buttons] = alert.mock.calls[0];
      expect(title).toBe("Delete all of mia's downloads?");
      expect(text).toMatch(/^4 downloads \(.+\) are removed from this phone\. Kept shows stop topping up\./);
      expect(deleted).not.toHaveBeenCalled();
      await act(async () => buttons?.find((b) => b.text === 'Delete All')?.onPress?.());
      expect(deleted).toHaveBeenCalledWith(list.map((d) => d.id));
      expect(getKids(active.id).kept).toBeUndefined();
      alert.mockRestore();
    });

    it('nothing downloaded: Delete All is there but off', async () => {
      list = [];
      await render(
        <ToastProvider>
          <KidsDownloadsRoute />
        </ToastProvider>,
      );
      await render(headerRight());
      expect(screen.getByRole('button', { name: 'Delete All Downloads' })).toBeDisabled();
    });
  });
});
