// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import * as api from '@/api';
import type { BaseItemDto, RequestOptions } from '@/api';
import KidsShowDownloadsRoute from '@/app/kids-show-downloads/[id]';
import { ToastProvider } from '@/components/Toast';
import * as snapshots from '@/downloadSnapshot';
import * as downloads from '@/downloads';
import type { Download, DownloadSummary } from '@/downloads';
import { forgetKids, getKids, setKids } from '@/kidsSettings';
import * as notifications from '@/notificationPermission';
import { episodeLine, episodeSeasons, showFacts } from '@/screens/kids/KidsShowDownloads';
import * as session from '@/session';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({ id: 'Kittens' }),
  Stack: { Screen: jest.fn(() => null) },
}));
jest.mock('expo-file-system/legacy', () => ({ getFreeDiskStorageAsync: async () => 500e9 }));
const { Stack } = jest.requireMock<{ Stack: { Screen: jest.Mock } }>('expo-router');
type Options = {
  title: string;
  headerRight?: () => React.ReactElement;
  unstable_headerRightItems?: () => { label: string; onPress: () => void }[];
};
const options = () => (Stack.Screen.mock.lastCall?.[0] as { options: Options }).options;

const server = { id: 'srv', url: 'https://jf.example.com', name: 'Home server', version: '12.1.0' };
let active: session.Account;
let seq = 0;

const items = (...list: BaseItemDto[]) => ({ Items: list, TotalRecordCount: list.length });
const ep = (Id: string, season: number, IndexNumber: number, Played = false): BaseItemDto => ({
  Id,
  Name: Id,
  Type: 'Episode',
  SeriesId: 'Kittens',
  SeriesName: 'Kittens',
  SeasonId: `s${season}`,
  ParentIndexNumber: season,
  IndexNumber,
  RunTimeTicks: 22 * 600_000_000,
  UserData: { PlaybackPositionTicks: 0, Played },
  MediaSources: [{ Id: `${Id}-ms`, Size: 3e8, Container: 'mkv' }],
});
/** A minisode: in the Specials season, no season number from the server. */
const special: BaseItemDto = { ...ep('mini', 0, 1, true), SeasonId: 'sp', ParentIndexNumber: undefined };
const episodes = [special, ep('e1', 1, 1, true), ep('e2', 1, 2), ep('e3', 1, 3), ep('e4', 2, 1), ep('e5', 2, 2)];

const request = jest.spyOn(api, 'request');
const started = jest.spyOn(downloads, 'startDownloads');
const deleted = jest.spyOn(downloads, 'deleteDownloads');

function answer(path: string, _options?: RequestOptions) {
  if (path === '/Users/Me') return { Id: 'u', Name: 'mia', Policy: { EnableContentDownloading: true } };
  if (path === '/Shows/NextUp') return items(episodes.find((e) => e.Id === 'e2') as BaseItemDto);
  if (path.endsWith('/Episodes')) return items(...episodes);
  if (path.endsWith('/Seasons'))
    return items(
      { Id: 'sp', Name: 'Specials', Type: 'Season', IndexNumber: 0 },
      { Id: 's1', Name: 'Season 1', Type: 'Season', IndexNumber: 1 },
      { Id: 's2', Name: 'Season 2', Type: 'Season', IndexNumber: 2 },
    );
  return { Id: 'Kittens', Name: 'Kittens', Type: 'Series' };
}

/** Item ids on the phone (done). */
let here: string[] = [];
const done = (ids: string[]): DownloadSummary => ({
  state: 'done',
  progress: 1,
  ids: ids.map((i) => `dl-${i}`),
  itemIds: ids,
  done: ids.length,
  size: 3e8 * ids.length,
  running: 0,
  failed: 0,
  waitingForNetwork: false,
});
const summaryOf = (group: string | null) => {
  if (!group) return null;
  const [, kind, id] = group.split('|');
  const ids = kind === 'r' ? here : here.filter((i) => i === id);
  return ids.length > 0 ? done(ids) : null;
};

beforeEach(() => {
  jest.clearAllMocks();
  active = { id: `srv.k${++seq}`, server, userId: `k${seq}`, userName: 'mia', deviceId: 'dev' };
  jest.spyOn(session, 'useSession').mockImplementation(() => ({ accounts: [active], active }));
  jest.spyOn(session, 'getSession').mockImplementation(() => ({ accounts: [active], active }));
  jest.spyOn(session, 'connectionFor').mockImplementation((a) => ({
    baseUrl: a.server.url,
    deviceId: a.deviceId,
    token: 'tok',
    accountId: a.id,
  }));
  request.mockImplementation((_conn, path, opts) => Promise.resolve(answer(path, opts) as never));
  started.mockResolvedValue({ ok: true, started: 1, skipped: 0 });
  deleted.mockImplementation(() => {});
  jest.spyOn(downloads, 'resumeDownloads').mockImplementation(() => {});
  jest.spyOn(downloads, 'useDownloadSummary').mockImplementation(summaryOf);
  jest.spyOn(downloads, 'useHasDownloads').mockImplementation((g) => summaryOf(g) !== null);
  jest.spyOn(notifications, 'askNotificationsOnce').mockResolvedValue(undefined);
  here = ['e1', 'e2'];
  setKids(active.id, { account: true });
});

afterEach(() => forgetKids(active.id));

const renderPage = async () => {
  await render(
    <ToastProvider>
      <KidsShowDownloadsRoute />
    </ToastProvider>,
  );
  await screen.findByText('1. e1');
};

describe("Kids Downloads: a show's episodes", () => {
  it("one season at a time: pills (Specials last), opens on the next episode's season", async () => {
    await renderPage();
    const pills = ['Season 1', 'Season 2', 'Specials'].map((name) => screen.getByRole('button', { name }));
    expect(pills.map((p) => p.props.accessibilityState?.selected)).toEqual([true, false, false]);
    expect(screen.getByText('Watched · On this phone · 300 MB')).toBeOnTheScreen();
    expect(screen.getAllByText('22 min')).toHaveLength(1);
    expect(screen.queryByText('1. e4')).toBeNull();
    // The card: how big, how much is here, a bar.
    expect(screen.getByText('6 episodes')).toBeOnTheScreen();
    expect(screen.getByText('2 seasons + Specials')).toBeOnTheScreen();
    expect(screen.getByText('2 downloaded · 600 MB')).toBeOnTheScreen();
    expect(screen.getByRole('progressbar', { name: '33% downloaded' })).toBeOnTheScreen();
    await waitFor(() => expect(options().title).toBe('Kittens'));
    await fireEvent.press(screen.getByRole('button', { name: 'Specials' }));
    expect(screen.getByText('1. mini')).toBeOnTheScreen();
    expect(screen.queryByText('1. e1')).toBeNull();
  });

  it('↓ downloads just that episode', async () => {
    await renderPage();
    await fireEvent.press(screen.getByRole('button', { name: 'Season 2' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Download e4' }));
    await waitFor(() => expect(started).toHaveBeenCalled());
    expect(started.mock.calls[0][0].map((r) => r.item.Id)).toEqual(['e4']);
  });

  it('not kept: ✓ asks the usual question', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    await renderPage();
    await fireEvent.press(screen.getAllByRole('button', { name: 'Downloaded, delete download' })[1]);
    expect(alert.mock.calls[0][0]).toBe('Delete the download of e2?');
    alert.mockRestore();
  });

  it('kept: the next 5 marked; deleting one asks to stop keeping, then stops and deletes it (the rest stay)', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    setKids(active.id, { kept: ['Kittens'] });
    await renderPage();
    expect(screen.getByText('2 downloaded · 600 MB · Keeping next 5')).toBeOnTheScreen();
    // Next Up is e2: e2-e5 (only 4 left).
    expect(await screen.findByText('Next 5 · On this phone · 300 MB')).toBeOnTheScreen();
    expect(screen.getAllByText('Next 5 · 22 min')).toHaveLength(1);
    // e1 (watched, before Next Up) isn't one of them: the usual question.
    await fireEvent.press(screen.getAllByRole('button', { name: 'Downloaded, delete download' })[0]);
    expect(alert.mock.calls[0][0]).toBe('Delete the download of e1?');
    await fireEvent.press(screen.getAllByRole('button', { name: 'Downloaded, delete download' })[1]);
    const [title, text, buttons] = alert.mock.calls[1];
    expect(title).toBe('Stop keeping Kittens?');
    expect(text).toBe(
      'e2 is one of the next 5 Rillwood keeps, so it would download again. Stop keeping the show to delete it.',
    );
    expect(deleted).not.toHaveBeenCalled();
    await act(async () => buttons?.find((b) => b.text === 'Stop Keeping and Delete')?.onPress?.());
    expect(getKids(active.id).kept).toBeUndefined();
    expect(deleted).toHaveBeenCalledWith(['dl-e2']);
    alert.mockRestore();
  });

  it("the header ⋯ opens the show row's menu", async () => {
    await renderPage();
    await waitFor(() => expect(options().headerRight).toBeDefined());
    // iOS: a native header button (Android: the same as our own, `headerRight`).
    const [button] = options().unstable_headerRightItems?.() ?? [];
    expect(button.label).toBe('Download Menu');
    await act(async () => button.onPress());
    expect(await screen.findByRole('menuitem', { name: 'Whole Show' })).toBeOnTheScreen();
  });

  it("offline: only what's on the phone, from the saved items - delete only", async () => {
    jest.spyOn(api, 'useOffline').mockReturnValue(true);
    request.mockRejectedValue(new api.ApiError('network'));
    const saved = new Map(episodes.map((e) => [e.Id, e]));
    const dl = (itemId: string): Download => ({
      id: `dl-${itemId}`,
      accountId: active.id,
      itemId,
      sourceId: itemId,
      seriesId: 'Kittens',
      seriesName: 'Kittens',
      title: itemId,
      path: `downloads/x/${itemId}/f.mkv`,
      status: 'done',
      bytes: 3e8,
      total: 3e8,
      createdAt: 0,
      pinned: false,
      rating: 0,
    });
    jest.spyOn(downloads, 'useDownloadList').mockImplementation(() => here.map(dl));
    jest.spyOn(snapshots, 'readSnapshotItem').mockImplementation((path) => saved.get(path.split('/')[2]) ?? null);
    await renderPage();
    expect(screen.getByText('2. e2')).toBeOnTheScreen();
    expect(screen.queryByText('3. e3')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Download e/ })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Downloaded, delete download' })).toHaveLength(2);
    expect(screen.getByText('2 episodes')).toBeOnTheScreen();
    expect(screen.getByText('2 downloaded · 600 MB')).toBeOnTheScreen();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });
});

describe('episode lines and seasons', () => {
  it('Next 5 and Watched first, then the download, else the length', () => {
    const e = ep('x', 1, 1, true);
    expect(episodeLine(e, null, false)).toBe('Watched · 22 min');
    expect(episodeLine(e, done(['x']), true)).toBe('Next 5 · Watched · On this phone · 300 MB');
    expect(episodeLine({ ...e, RunTimeTicks: undefined, UserData: undefined }, null, false)).toBe('');
  });

  it('by season id in season order, Specials (no number) last, missing ones left out', () => {
    const list = [special, ep('b', 2, 1), ep('a', 1, 1), { ...ep('gone', 1, 2), LocationType: 'Virtual' as const }];
    const named = (seasons?: BaseItemDto[]) =>
      episodeSeasons(list, seasons).map((s) => [s.name, s.episodes.map((e) => e.Id)]);
    // Offline: names from the episodes; online the server's.
    expect(named()).toEqual([
      ['Season 1', ['a']],
      ['Season 2', ['b']],
      ['Specials', ['mini']],
    ]);
    expect(named([{ Id: 's1', Name: 'Pilot Year', Type: 'Season', IndexNumber: 1 }])[0]).toEqual(['Pilot Year', ['a']]);
  });

  it("the card's words: how big, how much is here (or what it's doing), kept", () => {
    const seasons = episodeSeasons([ep('a', 1, 1), ep('b', 1, 2), ep('c', 2, 1), special]);
    expect(showFacts(seasons, null, false, false)).toEqual({
      title: '4 episodes',
      seasons: '2 seasons + Specials',
      line: 'None downloaded yet',
      progress: 0,
    });
    expect(showFacts(seasons, done(['a']), false, true)).toMatchObject({
      line: '1 downloaded · 300 MB · Keeping next 5',
      progress: 0.25,
    });
    const running = { ...done(['a', 'b']), state: 'downloading' as const, done: 1, running: 1, progress: 0.4 };
    expect(showFacts(seasons, running, false, false).line).toBe('Downloading 40% · 1 of 2');
    expect(showFacts(episodeSeasons([ep('a', 1, 1)]), done(['a']), true, false)).toEqual({
      title: '1 episode',
      seasons: '1 season',
      line: '1 downloaded · 300 MB',
      progress: undefined,
    });
  });
});
