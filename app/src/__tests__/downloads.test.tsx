// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Paths } from 'expo-file-system';
import { Alert, StyleSheet, type AlertButton } from 'react-native';

import * as api from '@/api';
import type { BaseItemDto } from '@/api';
import Downloads from '@/app/(tabs)/downloads';
import * as store from '@/downloads';
import { deleteDownloads, downloadId, initDownloads, startDownloads } from '@/downloads';
import * as session from '@/session';
import { setDownloadLimit, setOffloadDays, setOffloadWatched } from '@/settings';
import { recordProgress } from '@/sync';
import type { Account } from '@/session';
import { DOWNLOAD_POSTER } from '@/components/DownloadRow';
import { resetDevice, setDevice } from '@/testDevice';

import NativeDownloads from '../../modules/downloads';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), navigate: jest.fn() } }));
// Swipe actions: the hidden Delete button is rendered (off screen until the row slides).
const { router } = jest.requireMock<{ router: { push: jest.Mock; navigate: jest.Mock } }>('expo-router');

const GB = 1024 ** 3;
// Free space as iOS Settings shows it (the screen and the store's pre-flight read it).
jest.mock('expo-file-system/legacy', () => ({ getFreeDiskStorageAsync: async () => 120e9 }));

const server = { id: 'srv', url: 'https://jf.example.com', name: 'Home server', version: '12.1.0' };
let seq = 0;
let account: Account;
let accounts: Account[];
const native = jest.mocked(NativeDownloads);
// The store registers its native listeners once per module: keep them past `clearAllMocks`.
initDownloads();
const listeners = [...native.addListener.mock.calls];
const emit = (event: string, payload: object) =>
  listeners.filter(([e]) => e === event).forEach(([, fn]) => (fn as (p: object) => void)(payload));

const newAccount = (): Account => ({
  id: `srv.u${++seq}`,
  server,
  userId: `u${seq}`,
  userName: 'anna',
  deviceId: 'dev',
});
const signIn = (a: Account) => {
  account = a;
  accounts = [...accounts.filter((x) => x.id !== a.id), a];
};

const movie: BaseItemDto = { Id: 'sintel', Name: 'Sintel', Type: 'Movie' };
// The movie's detail as the server answers it (resume point).
let sintel: () => Promise<BaseItemDto>;
const episode = (n: number): BaseItemDto => ({
  Id: `ep${n}`,
  Name: `Episode ${n}`,
  Type: 'Episode',
  SeriesId: 'show',
  SeasonId: 'season1',
  SeriesName: 'Test Show',
  ParentIndexNumber: 1,
  IndexNumber: n,
});
const download = (...items: BaseItemDto[]) =>
  startDownloads(items.map((item) => ({ item, source: { Id: `${item.Id}-ms`, Size: 2 * GB, Container: 'mkv' } })));
const idOf = (item: BaseItemDto) => downloadId(account.id, item.Id, `${item.Id}-ms`);

beforeEach(() => {
  jest.clearAllMocks();
  // Auto-remove off: rows show no timer unless a test turns it on.
  setOffloadDays(0);
  setOffloadWatched(0);
  // A new account per test: the store outlives a test, and other accounts' downloads never show.
  accounts = [];
  sintel = async () => movie;
  signIn(newAccount());
  jest.spyOn(session, 'useSession').mockImplementation(() => ({ accounts, active: account }));
  jest.spyOn(session, 'getSession').mockImplementation(() => ({ accounts, active: account }));
  jest.spyOn(session, 'connectionFor').mockImplementation((a) => ({
    baseUrl: a.server.url,
    deviceId: a.deviceId,
    token: 'tok',
    accountId: a.id,
  }));
  jest
    .spyOn(api, 'request')
    .mockImplementation(
      (_conn, path) =>
        (path === '/Items/show'
          ? Promise.resolve({ Id: 'show', Name: 'Test Show', Type: 'Series' })
          : path === '/Items/sintel'
            ? sintel()
            : new Promise(() => {})) as Promise<never>,
    );
  jest.spyOn(Paths, 'totalDiskSpace', 'get').mockReturnValue(1000 * GB);
});

afterEach(resetDevice);

describe('Downloads', () => {
  // Tablets: two columns of the tab's width (less the sidebar in landscape); a lone last row stays one column wide.
  it('lays the rows out in two columns on tablets', async () => {
    await download(movie, episode(1));
    await setDevice(390, 844);
    await render(<Downloads />);
    const widths = () =>
      screen.getAllByTestId('download-cell').map((n) => StyleSheet.flatten(n.props.style)?.width as number | undefined);
    expect(widths()).toEqual([undefined, undefined]);
    // iPad portrait: (834 - 2 x 16 - 24) / 2. Landscape beside the sidebar: (934 - 2 x 16 - 24) / 2.
    for (const [w, h, cell] of [
      [834, 1194, 389],
      [1194, 834, 439],
    ] as const) {
      await setDevice(w, h);
      expect(widths()).toEqual([cell, cell]);
    }
    // The storage limit counts every account's downloads: leave none for the next tests.
    await act(() => deleteDownloads([idOf(movie), idOf(episode(1))]));
  });

  // Regression: phone-size 56pt posters looked lost in a 13" iPad's columns.
  it('shows bigger posters on wide screens', async () => {
    await download(movie, episode(1));
    await setDevice(390, 844);
    await render(<Downloads />);
    const widths = () =>
      screen.getAllByTestId('download-art').map((n) => StyleSheet.flatten(n.props.style)?.width as number);
    expect(widths()).toEqual([DOWNLOAD_POSTER.phone, DOWNLOAD_POSTER.phone]);
    await setDevice(834, 1194);
    expect(widths()).toEqual([DOWNLOAD_POSTER.wide, DOWNLOAD_POSTER.wide]);
    await act(() => deleteDownloads([idOf(movie), idOf(episode(1))]));
  });

  it('says what to do when nothing is downloaded', async () => {
    await render(<Downloads />);
    expect(screen.getByText('No Downloads Yet')).toBeOnTheScreen();
    expect(screen.queryByText('Downloading')).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Browse Library' }));
    expect(router.navigate).toHaveBeenCalledWith('/library');
  });

  it('shows the storage limit, free = the device when it has less room than the limit', async () => {
    setDownloadLimit(200);
    try {
      await download(movie);
      await render(<Downloads />);
      // 200 GB - 2.1 GB left under the limit, 120 GB on the device.
      expect(await screen.findByLabelText('Downloads 2.1 GB of 200 GB · 120 GB free')).toBeOnTheScreen();
    } finally {
      await act(() => setDownloadLimit(0));
    }
  });

  it('with several accounts the limit total says it counts them all', async () => {
    setDownloadLimit(200);
    try {
      const first = account;
      signIn(newAccount());
      await download(movie);
      signIn(first);
      await download(movie);
      await render(<Downloads />);
      // Earlier tests' accounts keep their downloads in the store: only the wording is checked.
      expect(await screen.findByLabelText(/^Downloads [\d.]+ GB all accounts of 200 GB · /)).toBeOnTheScreen();
    } finally {
      await act(() => setDownloadLimit(0));
    }
  });

  it('lists movies and shows in one list, newest first, with the storage bar', async () => {
    await download(episode(1), episode(2));
    await download(movie);
    await act(() => emit('done', { id: idOf(episode(1)) }));
    await render(<Downloads />);

    expect(await screen.findByLabelText(/^Downloads 6\.4 GB · 120 GB free$/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText(/^Downloads 6\.4 GB/));
    expect(router.push).toHaveBeenCalledWith('/download-storage');
    expect(screen.queryByRole('header', { name: 'Downloading' })).toBeNull();
    const rows = screen.getAllByLabelText(/^(Sintel|Test Show), /).map((r) => r.props.accessibilityLabel);
    expect(rows).toEqual(['Sintel, Waiting · 0 MB of 2.1 GB', 'Test Show, 2 episodes · 4.3 GB, Downloading']);
    // Episodes live on the show's own screen.
    expect(screen.queryByText('Episode 1')).toBeNull();
  });

  it('narrows the list by search and type; Delete All still counts every download', async () => {
    await download(episode(1), episode(2));
    await download(movie);
    await render(<Downloads />);
    const rows = () => screen.queryAllByLabelText(/^(Sintel|Test Show), /).map((r) => r.props.accessibilityLabel);

    await fireEvent.press(screen.getByRole('button', { name: 'Shows' }));
    expect(rows()).toEqual(['Test Show, 2 episodes · 4.3 GB, Downloading']);
    await fireEvent.press(screen.getByRole('button', { name: 'Movies' }));
    expect(rows()).toEqual(['Sintel, Waiting · 0 MB of 2.1 GB']);

    await fireEvent.press(screen.getByRole('button', { name: 'All' }));
    await fireEvent.changeText(screen.getByLabelText('Search downloads'), 'episode 2');
    expect(rows()).toEqual(['Test Show, 2 episodes · 4.3 GB, Downloading']);
    await fireEvent.changeText(screen.getByLabelText('Search downloads'), 'zzz');
    expect(rows()).toEqual([]);
    expect(screen.getByText('No downloads match "zzz".')).toBeOnTheScreen();

    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await fireEvent.press(screen.getByRole('button', { name: 'More' }));
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Delete All Downloads' }));
    expect(alert.mock.calls[0][1]).toMatch(/^3 downloads /);
  });

  it('Episodes lists every episode on its own row, newest first; search matches its show or title', async () => {
    // Two batches in the same millisecond: the later one still lists first.
    const now = jest.spyOn(Date, 'now').mockReturnValue(1000);
    await download(episode(1));
    await download(movie, episode(2));
    now.mockRestore();
    await render(<Downloads />);
    const rows = () => screen.queryAllByLabelText(/^(Sintel|Test Show)/).map((r) => r.props.accessibilityLabel);

    await fireEvent.press(screen.getByRole('button', { name: 'Episodes' }));
    expect(rows()).toEqual([
      'Test Show · S1:E2 · Episode 2, Waiting · 0 MB of 2.1 GB',
      'Test Show · S1:E1 · Episode 1, Waiting · 0 MB of 2.1 GB',
    ]);
    await fireEvent.changeText(screen.getByLabelText('Search downloads'), 'episode 1');
    expect(rows()).toEqual(['Test Show · S1:E1 · Episode 1, Waiting · 0 MB of 2.1 GB']);
    // Swipe Delete names the row as shown (the show too).
    expect(screen.getByRole('button', { name: 'Delete Test Show · S1:E1 · Episode 1' })).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('Search downloads'), 'sintel');
    expect(rows()).toEqual([]);
    expect(screen.getByText('No downloads match "sintel".')).toBeOnTheScreen();
  });

  it("opens a show's episodes; its ring follows them and goes once all are done", async () => {
    await download(episode(1), episode(2));
    await render(<Downloads />);
    expect(screen.getByRole('progressbar', { name: 'Downloading' })).toBeOnTheScreen();

    await act(() => emit('done', { id: idOf(episode(1)) }));
    await act(() => emit('done', { id: idOf(episode(2)) }));
    expect(screen.queryByRole('progressbar', { name: 'Downloading' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Test Show, 2 episodes · 4.3 GB' }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/show-downloads/[id]',
      params: { id: 'show', name: 'Test Show' },
    });
  });

  it('swipe Delete on a show deletes every episode after asking', async () => {
    await download(episode(1), episode(2));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await render(<Downloads />);

    await fireEvent.press(screen.getByRole('button', { name: 'Delete Test Show' }));
    expect(alert.mock.calls[0].slice(0, 2)).toEqual([
      'Delete the downloads of Test Show?',
      '2 downloads are removed from this device. You can download them again.',
    ]);
    const buttons = alert.mock.calls[0][2] as AlertButton[];
    await act(() => buttons.find((b) => b.style === 'destructive')?.onPress?.());
    expect(native.cancel).toHaveBeenCalledWith(idOf(episode(1)));
    expect(native.cancel).toHaveBeenCalledWith(idOf(episode(2)));
    expect(screen.getByText('No Downloads Yet')).toBeOnTheScreen();
  });

  it('shows live progress; the ring opens Pause / Resume', async () => {
    await download(movie);
    const id = idOf(movie);
    await render(<Downloads />);

    await act(() => emit('progress', { id, bytes: GB }));
    expect(screen.getByLabelText('Sintel, Downloading · 1.1 GB of 2.1 GB')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Downloading', value: { text: '50%' } }));
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Pause Download' }));
    expect(native.pause).toHaveBeenCalledWith(id);
    expect(screen.getByLabelText(/^Sintel, Paused · /)).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Download paused' }));
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Resume Download' }));
    expect(native.resume).toHaveBeenCalledWith(id);
    expect(screen.getByRole('button', { name: 'Downloading' })).toBeOnTheScreen();
  });

  it('Cancel Download stops a running download and removes it in one step, no question', async () => {
    await download(movie);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await render(<Downloads />);
    await fireEvent.press(screen.getByRole('button', { name: 'Downloading' }));
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Cancel Download' }));
    expect(native.cancel).toHaveBeenCalledWith(idOf(movie));
    expect(alert).not.toHaveBeenCalled();
    expect(screen.getByText('No Downloads Yet')).toBeOnTheScreen();
  });

  it('a row menu closes when its download goes elsewhere and never reopens on a re-download', async () => {
    await download(movie);
    await render(<Downloads />);
    await fireEvent.press(screen.getByRole('button', { name: 'Downloading' }));
    expect(screen.getByRole('menuitem', { name: 'Cancel Download' })).toBeOnTheScreen();
    await act(() => deleteDownloads([idOf(movie)]));
    expect(screen.queryByRole('menuitem')).toBeNull();
    await act(() => download(movie)); // same item + version: the same id
    expect(screen.getByRole('button', { name: 'Downloading' })).toBeOnTheScreen();
    expect(screen.queryByRole('menuitem')).toBeNull();
  });

  it('says why a download stopped', async () => {
    await download(movie);
    await render(<Downloads />);
    await act(() => emit('error', { id: idOf(movie), state: 'error', reason: 'storage', message: 'full' }));
    expect(screen.getByLabelText(/^Sintel, Failed - not enough space · /)).toBeOnTheScreen();
  });

  it("plays a ready download from the server's resume point", async () => {
    sintel = async () => ({
      ...movie,
      RunTimeTicks: 8_880_000_000,
      UserData: { PlaybackPositionTicks: 400_000_000, Played: false },
    });
    await download(movie);
    await act(() => emit('done', { id: idOf(movie) }));
    await render(<Downloads />);
    await fireEvent.press(screen.getByRole('button', { name: 'Sintel, 2.1 GB' }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/player',
      params: { id: 'sintel', start: '40', source: 'sintel-ms' },
    });
  });

  it('plays from the start when the resume point is out of reach', async () => {
    sintel = () => Promise.reject(new api.ApiError('network'));
    await download(movie);
    await act(() => emit('done', { id: idOf(movie) }));
    await render(<Downloads />);
    await fireEvent.press(screen.getByRole('button', { name: 'Sintel, 2.1 GB' }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/player',
      params: { id: 'sintel', start: '0', source: 'sintel-ms' },
    });
  });

  it('known offline: plays from the resume point saved with the download, without asking the server', async () => {
    const offline = jest.spyOn(api, 'isOffline').mockReturnValue(true);
    const saved = jest.spyOn(store, 'savedItem').mockReturnValue({
      item: { ...movie, RunTimeTicks: 8_880_000_000, UserData: { PlaybackPositionTicks: 300_000_000, Played: false } },
    });
    await download(movie);
    await act(() => emit('done', { id: idOf(movie) }));
    jest.mocked(api.request).mockClear();
    await render(<Downloads />);
    await fireEvent.press(screen.getByRole('button', { name: 'Sintel, 2.1 GB' }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/player',
      params: { id: 'sintel', start: '30', source: 'sintel-ms' },
    });
    expect(saved).toHaveBeenCalledWith(account.id, 'sintel');
    expect(api.request).not.toHaveBeenCalled();
    offline.mockRestore();
    saved.mockRestore();
  });

  it('known offline: progress made offline wins over the saved resume point', async () => {
    const offline = jest.spyOn(api, 'isOffline').mockReturnValue(true);
    const saved = jest.spyOn(store, 'savedItem').mockReturnValue({
      item: { ...movie, RunTimeTicks: 8_880_000_000, UserData: { PlaybackPositionTicks: 300_000_000, Played: false } },
    });
    await download(movie);
    await act(() => emit('done', { id: idOf(movie) }));
    recordProgress({
      accountId: account.id,
      itemId: 'sintel',
      positionTicks: 1_200_000_000,
      runtimeTicks: 8_880_000_000,
      startedAt: '2026-10-14T10:00:00.000Z',
    });
    await render(<Downloads />);
    await fireEvent.press(screen.getByRole('button', { name: 'Sintel, 2.1 GB' }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/player',
      params: { id: 'sintel', start: '120', source: 'sintel-ms' },
    });
    offline.mockRestore();
    saved.mockRestore();
  });

  it('the menu opens the details (online or offline)', async () => {
    await download(movie);
    await act(() => emit('done', { id: idOf(movie) }));
    await render(<Downloads />);
    await fireEvent(screen.getByRole('button', { name: 'Sintel, 2.1 GB' }), 'longPress');
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Go to Details' }));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/item/[id]', params: { id: 'sintel' } });
  });

  describe('auto-remove', () => {
    const DAY = 24 * 60 * 60_000;
    const T = Date.parse('2026-10-14T12:00:00.000Z');
    let now: ReturnType<typeof jest.spyOn>;
    beforeEach(() => {
      now = jest.spyOn(Date, 'now').mockReturnValue(T);
    });
    const finished = async (...items: BaseItemDto[]) => {
      await download(...items);
      for (const item of items) await act(() => emit('done', { id: idOf(item) }));
    };

    it('says when a download expires; Reset Timer starts it again', async () => {
      setOffloadDays(30);
      await finished(movie);
      now.mockReturnValue(T + 26 * DAY + 12 * 60 * 60_000);
      await render(<Downloads />);
      const row = screen.getByRole('button', { name: 'Sintel, 2.1 GB, Expires in 3 days' });

      await fireEvent(row, 'longPress');
      await fireEvent.press(screen.getByRole('menuitem', { name: 'Reset Timer' }));
      expect(screen.getByRole('button', { name: 'Sintel, 2.1 GB, Expires in 30 days' })).toBeOnTheScreen();
    });

    it('Remove watched: a watched download says so and goes sooner', async () => {
      setOffloadDays(0);
      setOffloadWatched(24);
      await finished(movie);
      await render(<Downloads />);
      expect(screen.getByRole('button', { name: 'Sintel, 2.1 GB' })).toBeOnTheScreen();
      await act(() => store.setWatched(new Map([[idOf(movie), T + 1]])));
      expect(screen.getByRole('button', { name: 'Sintel, 2.1 GB · Watched, Expires in 24h' })).toBeOnTheScreen();
    });

    it('header menu: Reset All Timers asks first, then resets every download with a timer', async () => {
      setOffloadDays(90);
      await finished(movie, episode(1));
      const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      await render(<Downloads />);
      now.mockReturnValue(T + 10 * DAY);

      await fireEvent.press(screen.getByRole('button', { name: 'More' }));
      await fireEvent.press(screen.getByRole('menuitem', { name: 'Reset All Timers' }));
      expect(alert.mock.calls[0].slice(0, 2)).toEqual([
        'Reset all timers?',
        '2 downloads start their timer again now and are kept for 90 more days.',
      ]);
      const buttons = alert.mock.calls[0][2] as AlertButton[];
      await act(() => buttons.find((b) => b.text === 'Reset')?.onPress?.());
      expect(store.getDownload(idOf(movie))?.resetAt).toBe(T + 10 * DAY);
      expect(store.getDownload(idOf(episode(1)))?.resetAt).toBe(T + 10 * DAY);
    });

    it("a show's long press: Reset Timers for its episodes, or Delete Downloads", async () => {
      setOffloadDays(90);
      await finished(episode(1), episode(2));
      const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      await render(<Downloads />);
      const show = screen.getByLabelText(/^Test Show, 2 episodes · 4\.3 GB, Next expires in 90 days$/);

      await fireEvent(show, 'longPress');
      await fireEvent.press(screen.getByRole('menuitem', { name: 'Reset Timers' }));
      expect(alert.mock.calls[0][0]).toBe('Reset the timers of Test Show?');
      await fireEvent(show, 'longPress');
      await fireEvent.press(screen.getByRole('menuitem', { name: 'Delete Downloads' }));
      expect(alert.mock.calls[1][0]).toBe('Delete the downloads of Test Show?');
    });

    it('Never: no timers, no Reset in the menus', async () => {
      await finished(movie);
      await render(<Downloads />);
      await fireEvent(screen.getByRole('button', { name: 'Sintel, 2.1 GB' }), 'longPress');
      expect(screen.queryByRole('menuitem', { name: 'Reset Timer' })).toBeNull();
    });
  });

  it('deletes from the long-press menu after asking', async () => {
    await download(movie);
    const id = idOf(movie);
    await act(() => emit('done', { id }));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await render(<Downloads />);

    await fireEvent(screen.getByRole('button', { name: 'Sintel, 2.1 GB' }), 'longPress');
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Delete Download' }));
    expect(alert.mock.calls[0][0]).toBe('Delete the download of Sintel?');
    const buttons = alert.mock.calls[0][2] as AlertButton[];
    await act(() => buttons.find((b) => b.style === 'destructive')?.onPress?.());

    expect(native.cancel).toHaveBeenCalledWith(id);
    expect(screen.getByText('No Downloads Yet')).toBeOnTheScreen();
  });

  it('swipe Delete asks first, running downloads too; Cancel keeps it', async () => {
    await download(movie);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await render(<Downloads />);

    await fireEvent.press(screen.getByRole('button', { name: 'Delete Sintel' }));
    expect(alert.mock.calls[0][0]).toBe('Delete the download of Sintel?');
    const buttons = alert.mock.calls[0][2] as AlertButton[];
    await act(() => buttons.find((b) => b.style === 'cancel')?.onPress?.());
    expect(native.cancel).not.toHaveBeenCalled();
    await act(() => buttons.find((b) => b.style === 'destructive')?.onPress?.());

    expect(native.cancel).toHaveBeenCalledWith(idOf(movie));
    expect(screen.getByText('No Downloads Yet')).toBeOnTheScreen();
  });

  it("deletes all of the account's downloads, running ones too, after asking", async () => {
    await download(episode(2));
    const otherAccounts = idOf(episode(2));
    signIn(newAccount());
    await download(movie, episode(1));
    await act(() => emit('done', { id: idOf(movie) }));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await render(<Downloads />);

    await fireEvent.press(screen.getByRole('button', { name: 'More' }));
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Delete All Downloads' }));
    expect(alert.mock.calls[0].slice(0, 2)).toEqual([
      'Delete all downloads?',
      '2 downloads (4.3 GB) are removed from this device. You can download them again.',
    ]);
    const buttons = alert.mock.calls[0][2] as AlertButton[];
    await act(() => buttons.find((b) => b.style === 'destructive')?.onPress?.());

    expect(native.cancel).toHaveBeenCalledWith(idOf(movie));
    expect(native.cancel).toHaveBeenCalledWith(idOf(episode(1)));
    expect(native.cancel).not.toHaveBeenCalledWith(otherAccounts);
    expect(screen.getByText('No Downloads Yet')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'More' })).toBeNull();
  });

  it('starts unnarrowed after an account switch', async () => {
    await download(movie);
    const { rerender } = await render(<Downloads />);
    await fireEvent.press(screen.getByRole('button', { name: 'Shows' }));
    await fireEvent.changeText(screen.getByLabelText('Search downloads'), 'zzz');

    signIn(newAccount());
    await act(() => download(movie));
    await rerender(<Downloads />);
    expect(screen.getByLabelText('Search downloads').props.value).toBe('');
    expect(screen.getByRole('button', { name: 'All' })).toBeSelected();
    expect(screen.getByLabelText(/^Sintel, /)).toBeOnTheScreen();
  });

  it("hides another account's downloads", async () => {
    await download(movie);
    signIn(newAccount());
    await download(episode(1));
    await render(<Downloads />);

    expect(await screen.findByLabelText(/^Test Show, 1 episode /)).toBeOnTheScreen();
    expect(screen.queryByLabelText(/^Sintel, /)).toBeNull();
  });
});
