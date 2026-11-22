// SPDX-License-Identifier: GPL-3.0-or-later
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { File, Paths } from 'expo-file-system';
import { Alert, type AlertButton } from 'react-native';

import type { BaseItemDto } from '@/api';
import ShowDownloads from '@/app/show-downloads/[id]';
import { downloadId, initDownloads, startDownloads } from '@/downloads';
import * as session from '@/session';
import { setOffloadDays, setOffloadWatched } from '@/settings';
import type { Account } from '@/session';

import NativeDownloads from '../../modules/downloads';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({ id: 'show', name: 'Test Show' }),
  Stack: { Screen: jest.fn(() => null) },
}));
jest.mock('expo-file-system/legacy', () => ({ getFreeDiskStorageAsync: async () => 500e9 }));
const { router, Stack } = jest.requireMock<{
  router: { push: jest.Mock; back: jest.Mock };
  Stack: { Screen: jest.Mock };
}>('expo-router');
/** The header ⋯ (iOS: a native bar button). */
const headerButton = () =>
  (
    Stack.Screen.mock.lastCall?.[0] as {
      options: { unstable_headerRightItems: () => { label: string; onPress: () => void }[] };
    }
  ).options.unstable_headerRightItems()[0];

const GB = 1024 ** 3;
const native = jest.mocked(NativeDownloads);
initDownloads();
const listeners = [...native.addListener.mock.calls];
const emit = (event: string, payload: object) =>
  listeners.filter(([e]) => e === event).forEach(([, fn]) => (fn as (p: object) => void)(payload));

let seq = 0;
let account: Account;
const episode = (season: number, n: number, seriesId = 'show'): BaseItemDto => ({
  Id: `${seriesId}-s${season}e${n}`,
  Name: `Episode ${n}`,
  Type: 'Episode',
  SeriesId: seriesId,
  SeasonId: `${seriesId}-s${season}`,
  SeriesName: 'Test Show',
  ParentIndexNumber: season,
  IndexNumber: n,
});
const download = (...items: BaseItemDto[]) =>
  startDownloads(items.map((item) => ({ item, source: { Id: `${item.Id}-ms`, Size: GB, Container: 'mkv' } })));
const idOf = (item: BaseItemDto) => downloadId(account.id, item.Id, `${item.Id}-ms`);

beforeEach(() => {
  jest.clearAllMocks();
  // Auto-remove off: rows show no timer unless a test turns it on.
  setOffloadDays(0);
  setOffloadWatched(0);
  // A new account per test: the store outlives a test.
  account = {
    id: `srv.u${++seq}`,
    server: { id: 'srv', url: 'https://jf.example.com', name: 'Home', version: '12.1.0' },
    userId: `u${seq}`,
    userName: 'anna',
    deviceId: 'dev',
  };
  jest.spyOn(session, 'useSession').mockImplementation(() => ({ accounts: [account], active: account }));
  jest.spyOn(session, 'getSession').mockImplementation(() => ({ accounts: [account], active: account }));
  jest.spyOn(session, 'connectionFor').mockImplementation((a) => ({
    baseUrl: a.server.url,
    deviceId: a.deviceId,
    token: 'tok',
    accountId: a.id,
  }));
  jest.spyOn(Paths, 'totalDiskSpace', 'get').mockReturnValue(1000 * GB);
});

describe("A show's downloads", () => {
  it('the show header, then one season at a time (pills) in episode order, not other shows', async () => {
    await download(episode(2, 1), episode(1, 2), episode(1, 1), episode(1, 1, 'other'));
    await render(<ShowDownloads />);

    expect(screen.getByRole('header', { name: 'Test Show' })).toBeOnTheScreen();
    expect(screen.getByText('3 episodes · 3.2 GB')).toBeOnTheScreen();
    // Running: what it's doing and a bar.
    expect(screen.getByText('Waiting · 0 of 3')).toBeOnTheScreen();
    expect(screen.getByRole('progressbar', { name: '0% downloaded' })).toBeOnTheScreen();
    const pills = ['Season 1', 'Season 2'].map((name) => screen.getByRole('button', { name }));
    expect(pills.map((p) => p.props.accessibilityState?.selected)).toEqual([true, false]);
    const rows = () => screen.getAllByLabelText(/^\d\. Episode/).map((r) => r.props.accessibilityLabel);
    expect(rows()).toEqual(['1. Episode 1, Waiting · 0 MB of 1.1 GB', '2. Episode 2, Waiting · 0 MB of 1.1 GB']);
    await fireEvent.press(pills[1]);
    expect(rows()).toEqual(['1. Episode 1, Waiting · 0 MB of 1.1 GB']);
  });

  it('one season: no pills; done: the next timer, no bar', async () => {
    setOffloadDays(30);
    const e1 = episode(1, 1);
    await download(e1);
    await act(() => emit('done', { id: idOf(e1) }));
    await render(<ShowDownloads />);

    expect(screen.queryByRole('button', { name: 'Season 1' })).toBeNull();
    expect(screen.getByText(/^Next expires in (29|30) days$/)).toBeOnTheScreen();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it("the header ⋯: the show row's menu - Reset Timers (with a timer), Delete Downloads", async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const e1 = episode(1, 1);
    await download(e1, episode(1, 2));
    await render(<ShowDownloads />);

    // Nothing finished: no timers yet.
    await act(async () => headerButton().onPress());
    expect(screen.queryByRole('menuitem', { name: 'Reset Timers' })).toBeNull();
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Delete Downloads' }));
    expect(alert.mock.calls[0][0]).toBe('Delete the downloads of Test Show?');

    setOffloadDays(30);
    await act(() => emit('done', { id: idOf(e1) }));
    await act(async () => headerButton().onPress());
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Reset Timers' }));
    expect(alert.mock.calls[1][0]).toBe('Reset the timers of Test Show?');
    alert.mockRestore();
  });

  it('pauses an episode from its ring and plays a ready one', async () => {
    const e1 = episode(1, 1);
    const e2 = episode(1, 2);
    await download(e1, e2);
    await act(() => emit('done', { id: idOf(e2) }));
    await render(<ShowDownloads />);

    await fireEvent.press(screen.getByRole('button', { name: 'Downloading' }));
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Pause Download' }));
    expect(native.pause).toHaveBeenCalledWith(idOf(e1));
    await fireEvent.press(screen.getByRole('button', { name: '2. Episode 2, 1.1 GB' }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/player',
      params: { id: e2.Id, start: '0', source: `${e2.Id}-ms` },
    });
  });

  it("the header shows the show's poster, each episode its own still", async () => {
    // The snapshot's fetches land on disk.
    const spies = [
      jest.spyOn(File, 'downloadFileAsync').mockResolvedValue(new File(Paths.document, 'x')),
      jest.spyOn(File.prototype, 'exists', 'get').mockReturnValue(true),
      jest.spyOn(File.prototype, 'write').mockResolvedValue(undefined),
    ];
    const e1 = { ...episode(1, 1), SeriesPrimaryImageTag: 'sp', ImageTags: { Primary: 'still' } };
    await download(e1);
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    spies.forEach((s) => s.mockRestore());
    await render(<ShowDownloads />);

    const [header, row] = screen.getAllByTestId('artwork-image').map((i) => i.props.source);
    expect(header).toEqual([{ uri: expect.stringMatching(/\/show-s1e1\/poster\.jpg$/) }]);
    expect(row).toEqual([{ uri: expect.stringMatching(/\/show-s1e1\/still\.jpg$/) }]);
  });

  it('goes back once the last episode is deleted', async () => {
    const e1 = episode(1, 1);
    await download(e1);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await render(<ShowDownloads />);

    await fireEvent.press(screen.getByRole('button', { name: 'Delete 1. Episode 1' }));
    const buttons = alert.mock.calls[0][2] as AlertButton[];
    await act(() => buttons.find((b) => b.style === 'destructive')?.onPress?.());
    expect(native.cancel).toHaveBeenCalledWith(idOf(e1));
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('says so when nothing of the show is downloaded (a stale link)', async () => {
    await render(<ShowDownloads />);
    expect(screen.getByText('Nothing downloaded from this show.')).toBeOnTheScreen();
    expect(router.back).not.toHaveBeenCalled();
  });
});
