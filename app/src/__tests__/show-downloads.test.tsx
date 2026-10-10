// SPDX-License-Identifier: GPL-3.0-or-later
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Paths } from 'expo-file-system';
import { Alert, type AlertButton } from 'react-native';

import type { BaseItemDto } from '@/api';
import ShowDownloads from '@/app/show-downloads/[id]';
import { downloadId, initDownloads, startDownloads } from '@/downloads';
import * as session from '@/session';
import type { Account } from '@/session';

import NativeDownloads from '../../modules/downloads';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({ id: 'show', name: 'Test Show' }),
}));
jest.mock('expo-file-system/legacy', () => ({ getFreeDiskStorageAsync: async () => 500e9 }));
const { router } = jest.requireMock<{ router: { push: jest.Mock; back: jest.Mock } }>('expo-router');

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
  it('lists its episodes by season in episode order, not other shows', async () => {
    await download(episode(2, 1), episode(1, 2), episode(1, 1), episode(1, 1, 'other'));
    await render(<ShowDownloads />);

    expect(screen.getByText('3 episodes · 3.2 GB')).toBeOnTheScreen();
    expect(screen.getAllByRole('header').map((h) => h.props.children)).toEqual(['Season 1', 'Season 2']);
    const rows = screen.getAllByLabelText(/^\d\. Episode/).map((r) => r.props.accessibilityLabel);
    expect(rows).toEqual([
      '1. Episode 1, Waiting · 0 MB of 1.1 GB',
      '2. Episode 2, Waiting · 0 MB of 1.1 GB',
      '1. Episode 1, Waiting · 0 MB of 1.1 GB',
    ]);
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
    expect(router.push).toHaveBeenCalledWith({ pathname: '/player', params: { id: e2.Id, start: '0' } });
  });

  it('goes back once the last episode is deleted', async () => {
    const e1 = episode(1, 1);
    await download(e1);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await render(<ShowDownloads />);

    await fireEvent.press(screen.getByRole('button', { name: 'Delete Episode 1' }));
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
