// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import * as api from '@/api';
import type { BaseItemDto, RequestOptions } from '@/api';
import KidsDownloadsRoute from '@/app/kids-downloads';
import type { DownloadSummary } from '@/downloads';
import { statusLine } from '@/screens/kids/KidsDownloads';
import { ToastProvider } from '@/components/Toast';
import * as downloads from '@/downloads';
import { forgetKids, getKids, setKids } from '@/kidsSettings';
import * as notifications from '@/notificationPermission';
import * as session from '@/session';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('expo-file-system/legacy', () => ({ getFreeDiskStorageAsync: async () => 500e9 }));

const server = { id: 'srv', url: 'https://jf.example.com', name: 'Home server', version: '12.1.0' };
let active: session.Account;
let seq = 0;

const items = (...list: BaseItemDto[]) => ({ Items: list, TotalRecordCount: list.length });
const title = (Id: string, Type: string): BaseItemDto => ({ Id, Name: Id, Type, ImageTags: { Primary: `p-${Id}` } });
const ep = (Id: string, season: number, played = false): BaseItemDto => ({
  Id,
  Name: Id,
  Type: 'Episode',
  SeriesId: 'Kittens',
  ParentIndexNumber: season,
  UserData: { PlaybackPositionTicks: 0, Played: played },
  MediaSources: [{ Id: `${Id}-ms`, Size: 1e9, Container: 'mkv' }],
});
const episodes = [ep('e1', 1, true), ep('e2', 1), ep('e3', 1), ep('e4', 2), ep('e5', 2), ep('e6', 2), ep('e7', 2)];

const request = jest.spyOn(api, 'request');
let me: api.UserDto;

/** Answers by path: the kid's titles, the user, a show's episodes / seasons / Next Up, a season's files. */
function answer(path: string, options?: RequestOptions) {
  const q = options?.query ?? {};
  if (path === '/Users/Me') return me;
  if (path === '/Shows/NextUp') return items(ep('e3', 1));
  if (path.endsWith('/Seasons'))
    return items(
      { Id: 's1', Name: 'Season 1', Type: 'Season', IndexNumber: 1, ChildCount: 3 },
      { Id: 's2', Name: 'Season 2', Type: 'Season', IndexNumber: 2, ChildCount: 4 },
    );
  if (path.endsWith('/Episodes')) return items(...(q.seasonId === 's2' ? episodes.slice(3) : episodes));
  // A movie's detail: its file size.
  if (path.startsWith('/Items/'))
    return { ...title('Pond Jumpers', 'Movie'), MediaSources: [{ Id: 'pj', Size: 1.9e9 }] };
  return items(
    title('Pond Jumpers', 'Movie'),
    { ...title('Kittens', 'Series'), RecursiveItemCount: 7 },
    title('Trains', 'Series'),
  );
}

const started = jest.spyOn(downloads, 'startDownloads');

beforeEach(() => {
  jest.clearAllMocks();
  active = { id: `srv.d${++seq}`, server, userId: `d${seq}`, userName: 'mia', deviceId: 'dev' };
  jest.spyOn(session, 'useSession').mockImplementation(() => ({ accounts: [active], active }));
  jest.spyOn(session, 'getSession').mockImplementation(() => ({ accounts: [active], active }));
  jest.spyOn(session, 'connectionFor').mockImplementation((a) => ({
    baseUrl: a.server.url,
    deviceId: a.deviceId,
    token: 'tok',
    accountId: a.id,
  }));
  me = { Id: 'u', Name: 'mia', Policy: { EnableContentDownloading: true } };
  request.mockImplementation((_conn, path, options) => Promise.resolve(answer(path, options) as never));
  started.mockResolvedValue({ ok: true, started: 1, skipped: 0 });
  jest.spyOn(downloads, 'resumeDownloads').mockImplementation(() => {});
  jest.spyOn(notifications, 'askNotificationsOnce').mockResolvedValue(undefined);
  setKids(active.id, { account: true });
});

afterEach(() => forgetKids(active.id));

const renderPage = () =>
  render(
    <ToastProvider>
      <KidsDownloadsRoute />
    </ToastProvider>,
  );

/** The item ids `startDownloads` got last. */
const startedIds = () => (started.mock.calls.at(-1)?.[0] ?? []).map((r) => r.item.Id);

async function openShowMenu() {
  await renderPage();
  await screen.findByText('Kittens');
  const buttons = screen.getAllByRole('button', { name: 'Download' });
  // Shows come first: Kittens, Trains, then the movie.
  await fireEvent.press(buttons[0]);
}

describe('Kids downloads', () => {
  it("lists the kid's shows and movies, A-Z, with a search", async () => {
    await renderPage();
    expect(await screen.findByRole('header', { name: 'SHOWS' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'MOVIES' })).toBeOnTheScreen();
    expect(screen.getByText('Kittens')).toBeOnTheScreen();
    expect(screen.getByText('Pond Jumpers')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('Find a show or movie'), 'tra');
    expect(screen.getByText('Trains')).toBeOnTheScreen();
    expect(screen.queryByText('Kittens')).toBeNull();
    expect(screen.queryByRole('header', { name: 'MOVIES' })).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Find a show or movie'), 'zzq');
    expect(screen.getByText('Nothing called that.')).toBeOnTheScreen();
  });

  it('a row says how much is in it: a show 0/7 episodes, a movie its size', async () => {
    await renderPage();
    expect(await screen.findByText('0/7 episodes')).toBeOnTheScreen();
    expect(await screen.findByText('1.9 GB')).toBeOnTheScreen();
  });

  it("a show's button offers Next 5, Whole Show and each season", async () => {
    await openShowMenu();
    expect(await screen.findByRole('menuitem', { name: 'Season 2, 4 episodes' })).toBeOnTheScreen();
    expect(
      screen.getByRole('menuitem', { name: 'Keep Next 5 Episodes, Swaps watched ones for new ones' }),
    ).toBeOnTheScreen();
    expect(screen.getByRole('menuitem', { name: 'Whole Show' })).toBeOnTheScreen();
    expect(screen.getByRole('menuitem', { name: 'Season 1, 3 episodes' })).toBeOnTheScreen();
  });

  it('Keep Next 5 asks first, then keeps the show and downloads from Next Up on, across seasons', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    await openShowMenu();
    await fireEvent.press(await screen.findByRole('menuitem', { name: /^Keep Next 5 Episodes/ }));
    const [title, text, buttons] = alert.mock.calls[0];
    expect(title).toBe('Keep 5 episodes of Kittens?');
    expect(text).toBe(
      "Rillwood keeps the next 5 episodes on this phone. An episode is removed a day after it's watched, and the next one downloads (on Wi-Fi).",
    );
    expect(started).not.toHaveBeenCalled();
    await act(async () => buttons?.find((b) => b.text === 'Keep')?.onPress?.());
    expect(getKids(active.id).kept).toEqual(['Kittens']);
    await waitFor(() => expect(started).toHaveBeenCalled());
    expect(startedIds()).toEqual(['e3', 'e4', 'e5', 'e6', 'e7']);
    // The row says so; the menu offers Stop Keeping instead.
    expect(await screen.findByText(/^Keeping 5/)).toBeOnTheScreen();
    await fireEvent.press(screen.getAllByRole('button', { name: 'Download' })[0]);
    await fireEvent.press(await screen.findByRole('menuitem', { name: 'Stop Keeping, The episodes here stay' }));
    expect(getKids(active.id).kept).toBeUndefined();
    alert.mockRestore();
  });

  it('Whole Show downloads every episode; a season only its own', async () => {
    await openShowMenu();
    await fireEvent.press(await screen.findByRole('menuitem', { name: 'Whole Show' }));
    await waitFor(() => expect(started).toHaveBeenCalledTimes(1));
    expect(startedIds()).toEqual(['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7']);
    await act(() => Promise.resolve());
    await fireEvent.press(screen.getAllByRole('button', { name: 'Download' })[0]);
    await fireEvent.press(await screen.findByRole('menuitem', { name: /^Season 2/ }));
    await waitFor(() => expect(started).toHaveBeenCalledTimes(2));
    expect(startedIds()).toEqual(['e4', 'e5', 'e6', 'e7']);
  });

  it('says so when the server turned downloads off for the user', async () => {
    me = { Id: 'u', Name: 'mia', Policy: { EnableContentDownloading: false } };
    await renderPage();
    expect(await screen.findByText('Downloads Turned Off')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Find a show or movie')).toBeNull();
  });
});

describe('statusLine', () => {
  const sum = (
    state: 'downloading' | 'paused' | 'done',
    done: number,
    ids: number,
    more: Partial<DownloadSummary> = {},
  ): DownloadSummary => ({
    state,
    progress: 0.12,
    ids: Array.from({ length: ids }, (_, i) => `d${i}`),
    itemIds: Array.from({ length: ids }, (_, i) => `e${i}`),
    done,
    size: 1.4e9,
    running: 0,
    failed: 0,
    waitingForNetwork: false,
    ...more,
  });

  it('a show: on the phone / in the show + size before and after', () => {
    expect(statusLine(null, true, 32)).toBe('0/32 episodes');
    expect(statusLine(sum('done', 5, 5), true, 32)).toBe('5/32 episodes · 1.4 GB');
    // The server didn't say how many.
    expect(statusLine(null, true, undefined)).toBeUndefined();
    expect(statusLine(sum('done', 1, 1), true, undefined)).toBe('1 episode · 1.4 GB');
  });

  it('on the way: what it is doing, like the Downloads tab - a percent while it transfers', () => {
    expect(statusLine(sum('downloading', 2, 5, { running: 2 }), true, 32)).toBe('Downloading 12% · 2 of 5');
    expect(statusLine(sum('downloading', 0, 44), true, 155)).toBe('Waiting · 0 of 44');
    expect(statusLine(sum('downloading', 0, 44, { waitingForNetwork: true }), true, 155)).toBe(
      'Waiting for Wi-Fi · 0 of 44',
    );
    expect(statusLine(sum('downloading', 0, 2, { waitingForNetwork: true }), true, 9, undefined, 'any')).toBe(
      'Waiting for network · 0 of 2',
    );
    expect(statusLine(sum('paused', 2, 5), true, 32)).toBe('Paused · 2 of 5');
    expect(statusLine(sum('paused', 2, 5, { failed: 1 }), true, 32)).toBe('Failed · 2 of 5');
  });

  it('a movie: its size, what it is doing, then on this phone', () => {
    expect(statusLine(null, false, undefined, 1.9e9)).toBe('1.9 GB');
    expect(statusLine(null, false, undefined)).toBeUndefined();
    expect(statusLine(sum('downloading', 0, 1, { running: 1 }), false, undefined)).toBe('Downloading 12%');
    expect(statusLine(sum('downloading', 0, 1), false, undefined)).toBe('Waiting');
    expect(statusLine(sum('done', 1, 1, { size: 1.9e9 }), false, undefined)).toBe('On this phone · 1.9 GB');
  });
});
