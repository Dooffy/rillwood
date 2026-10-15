// SPDX-License-Identifier: GPL-3.0-or-later
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act } from '@testing-library/react-native';

import type * as Api from './api';
import type { Download } from './downloads';
import type { Account, SessionState } from './session';
import type * as Sync from './sync';

const account = (id: string): Account => ({
  id,
  server: { id: 'srv', url: 'https://jf.example.com', name: 'Home', version: '12.1.0' },
  userId: id,
  userName: id,
  deviceId: `dev-${id}`,
});
const anna = account('srv.a');
const ben = account('srv.b');

const mockSession: { state: SessionState; listeners: Set<() => void> } = {
  state: { accounts: [anna, ben], active: anna },
  listeners: new Set(),
};
jest.mock('./session', () => ({
  getSession: () => mockSession.state,
  subscribeSession: (l: () => void) => {
    mockSession.listeners.add(l);
    return () => mockSession.listeners.delete(l);
  },
  connectionFor: (a: Account) => ({ baseUrl: a.server.url, deviceId: a.deviceId, token: 'tok', accountId: a.id }),
}));

const mockDownloads: { list: Partial<Download>[] } = { list: [] };
jest.mock('./downloads', () => ({ getDownloads: () => mockDownloads.list }));
jest.mock('./downloadSnapshot', () => ({ writeSnapshotUserData: jest.fn(async () => {}) }));
jest.mock('./useFetch', () => ({ invalidate: jest.fn() }));
jest.mock('./connection', () => ({ onReconnect: jest.fn() }));
jest.mock('./api', () => ({
  ...jest.requireActual<typeof Api>('./api'),
  isOffline: jest.fn(() => false),
  getUserData: jest.fn(),
  setPlayed: jest.fn(),
  updateUserData: jest.fn(),
  getItemsById: jest.fn(),
}));

const MIN = 60 * 10_000_000;
const RUNTIME = 100 * MIN;
const SESSION = '2026-10-14T10:00:00.000Z';
const later = (iso: string, ms: number) => new Date(Date.parse(iso) + ms).toISOString();

/* eslint-disable @typescript-eslint/no-require-imports -- fresh module state per test */
let sync: typeof Sync;
let api: jest.Mocked<typeof Api>;
let Storage: { getItemSync(k: string): string | null; setItemSync(k: string, v: string): void; clearSync(): boolean };
let invalidate: jest.Mock;
let writeSnapshotUserData: jest.Mock;
let onReconnect: jest.Mock;
let appState: (state: string) => void;

beforeEach(() => {
  jest.resetModules();
  mockSession.state = { accounts: [anna, ben], active: anna };
  mockSession.listeners.clear();
  mockDownloads.list = [];
  Storage = require('expo-sqlite/kv-store').Storage;
  Storage.clearSync();
  const { AppState } = require('react-native') as typeof import('react-native');
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    appState = listener as (state: string) => void;
    return { remove: () => {} };
  });
  api = require('./api');
  invalidate = require('./useFetch').invalidate;
  writeSnapshotUserData = require('./downloadSnapshot').writeSnapshotUserData;
  onReconnect = require('./connection').onReconnect;
  sync = require('./sync');
  api.getUserData.mockResolvedValue({ PlaybackPositionTicks: 0, Played: false });
  api.setPlayed.mockResolvedValue({ PlaybackPositionTicks: 0, Played: true });
  api.updateUserData.mockResolvedValue({ PlaybackPositionTicks: 0, Played: false });
  api.getItemsById.mockResolvedValue({ Items: [], TotalRecordCount: 0 });
});
/* eslint-enable @typescript-eslint/no-require-imports */

const record = (fields: Partial<Parameters<typeof Sync.recordProgress>[0]> = {}) =>
  sync.recordProgress({
    accountId: anna.id,
    itemId: 'film',
    positionTicks: 30 * MIN,
    runtimeTicks: RUNTIME,
    startedAt: SESSION,
    ...fields,
  });
const saved = () => JSON.parse(Storage.getItemSync('sync') ?? 'null');

describe('resumeRules (server defaults, applied offline)', () => {
  it.each([
    ['below 5% → 0', 4.9 * MIN, { positionTicks: 0, watched: false }],
    ['5% → kept', 5 * MIN, { positionTicks: 5 * MIN, watched: false }],
    ['just below 90% → kept', 89.9 * MIN, { positionTicks: 89.9 * MIN, watched: false }],
    ['90% → watched, 0', 90 * MIN, { positionTicks: 0, watched: true }],
    ['past the end → watched', 120 * MIN, { positionTicks: 0, watched: true }],
    ['negative → 0', -5, { positionTicks: 0, watched: false }],
  ])('%s', (_name, position, expected) => {
    expect(sync.resumeRules(position, RUNTIME)).toEqual(expected);
  });

  it('items under 5 minutes: watched from 5% (as the server: 1 s of 30 s → nothing, 10 s → played)', () => {
    expect(sync.resumeRules(0, 4.9 * MIN)).toEqual({ positionTicks: 0, watched: false });
    expect(sync.resumeRules(0.2 * MIN, 4.9 * MIN)).toEqual({ positionTicks: 0, watched: false });
    expect(sync.resumeRules(MIN, 4.9 * MIN)).toEqual({ positionTicks: 0, watched: true });
  });

  it('unknown runtime: the position as is', () => {
    expect(sync.resumeRules(30 * MIN, 0)).toEqual({ positionTicks: 30 * MIN, watched: false });
  });
});

describe('recordProgress', () => {
  it('keeps the progress per account + item, saved in kv-store', () => {
    record();
    const p = { accountId: anna.id, itemId: 'film', positionTicks: 30 * MIN, lastPlayedAt: SESSION, watched: false };
    expect(sync.getPendingProgress(anna.id, 'film')).toEqual(p);
    expect(sync.getPendingProgress(ben.id, 'film')).toBeNull();
    expect(saved()).toEqual({ version: 1, items: [p] });
  });

  it('a later report replaces the position; watched stays while pending (a rewatch below 90%)', () => {
    record({ positionTicks: 95 * MIN });
    record({ positionTicks: 40 * MIN, startedAt: later(SESSION, 3_600_000) });
    expect(sync.getPendingProgress(anna.id, 'film')).toMatchObject({
      positionTicks: 40 * MIN,
      watched: true,
      lastPlayedAt: later(SESSION, 3_600_000),
    });
  });

  it('read from kv-store on first use', () => {
    const p = { accountId: anna.id, itemId: 'film', positionTicks: 5, lastPlayedAt: SESSION, watched: false };
    Storage.setItemSync('sync', JSON.stringify({ version: 1, items: [p] }));
    expect(sync.getPendingProgress(anna.id, 'film')).toEqual(p);
  });

  it('an unreadable saved queue is left as it is', () => {
    Storage.setItemSync('sync', '{bad');
    record();
    expect(Storage.getItemSync('sync')).toBe('{bad');
  });
});

describe('clearProgress', () => {
  it("drops the session's own record once the server heard a later report", () => {
    record();
    sync.clearProgress(anna.id, 'film', SESSION);
    expect(sync.getPendingProgress(anna.id, 'film')).toBeNull();
  });

  it("keeps another session's record, and a watched one", () => {
    record();
    sync.clearProgress(anna.id, 'film', later(SESSION, 1000));
    expect(sync.getPendingProgress(anna.id, 'film')).not.toBeNull();
    record({ itemId: 'show', positionTicks: 95 * MIN });
    sync.clearProgress(anna.id, 'show', SESSION);
    expect(sync.getPendingProgress(anna.id, 'show')).not.toBeNull();
  });
});

describe('withPendingProgress', () => {
  it('the saved item shows the progress made offline', () => {
    record({ positionTicks: 95 * MIN });
    const item = {
      Id: 'film',
      Name: 'Film',
      Type: 'Movie',
      UserData: { PlaybackPositionTicks: 10, Played: false, PlayCount: 2 },
    };
    expect(sync.withPendingProgress(item, sync.getPendingProgress(anna.id, 'film')).UserData).toEqual({
      PlaybackPositionTicks: 0,
      Played: true,
      PlayCount: 2,
      LastPlayedDate: SESSION,
    });
    expect(sync.withPendingProgress(item, null)).toBe(item);
  });
});

describe('syncProgress (replay)', () => {
  it('progress: GET, then UserData with the position + session start; dropped, everything refetches', async () => {
    record();
    await sync.syncProgress();
    expect(api.getUserData).toHaveBeenCalledWith(expect.objectContaining({ accountId: anna.id }), 'film');
    expect(api.updateUserData).toHaveBeenCalledWith(expect.anything(), 'film', {
      PlaybackPositionTicks: 30 * MIN,
      LastPlayedDate: SESSION,
    });
    expect(api.setPlayed).not.toHaveBeenCalled();
    expect(sync.getPendingProgress(anna.id, 'film')).toBeNull();
    expect(saved().items).toEqual([]);
    expect(invalidate).toHaveBeenCalled();
  });

  it('watched: UserPlayedItems with the session start, no UserData at position 0', async () => {
    record({ positionTicks: 95 * MIN });
    await sync.syncProgress();
    expect(api.setPlayed).toHaveBeenCalledWith(expect.anything(), 'film', true, SESSION);
    expect(api.updateUserData).not.toHaveBeenCalled();
  });

  it('watched, then rewatched below 90%: played + the resume point (as online)', async () => {
    record({ positionTicks: 95 * MIN });
    record({ positionTicks: 40 * MIN });
    await sync.syncProgress();
    expect(api.setPlayed).toHaveBeenCalledWith(expect.anything(), 'film', true, SESSION);
    expect(api.updateUserData).toHaveBeenCalledWith(expect.anything(), 'film', {
      PlaybackPositionTicks: 40 * MIN,
      LastPlayedDate: SESSION,
    });
    expect(api.setPlayed.mock.invocationCallOrder[0]).toBeLessThan(api.updateUserData.mock.invocationCallOrder[0]);
  });

  it('played elsewhere after the session started: the server wins, nothing sent', async () => {
    record();
    api.getUserData.mockResolvedValue({
      PlaybackPositionTicks: 0,
      Played: false,
      LastPlayedDate: later(SESSION, sync.SAME_SESSION_MS + 1000),
    });
    await sync.syncProgress();
    expect(api.updateUserData).not.toHaveBeenCalled();
    expect(sync.getPendingProgress(anna.id, 'film')).toBeNull();
  });

  it('server date within a minute of the session start (the same session, started online): sent', async () => {
    record();
    api.getUserData.mockResolvedValue({
      PlaybackPositionTicks: 0,
      Played: false,
      LastPlayedDate: later(SESSION, 30_000),
    });
    await sync.syncProgress();
    expect(api.updateUserData).toHaveBeenCalled();
  });

  it('oldest session first; only the active account', async () => {
    record({ itemId: 'b', startedAt: later(SESSION, 1000) });
    record({ itemId: 'a' });
    record({ accountId: ben.id, itemId: 'c' });
    await sync.syncProgress();
    expect(api.getUserData.mock.calls.map((c) => c[1])).toEqual(['a', 'b']);
    expect(sync.getPendingProgress(ben.id, 'c')).not.toBeNull();
  });

  it('offline again: stops, everything stays for the next run', async () => {
    record({ itemId: 'a' });
    record({ itemId: 'b', startedAt: later(SESSION, 1000) });
    api.getUserData.mockRejectedValueOnce(new api.ApiError('network'));
    await sync.syncProgress();
    expect(api.getUserData).toHaveBeenCalledTimes(1);
    expect(sync.getPendingProgress(anna.id, 'a')).not.toBeNull();
    expect(sync.getPendingProgress(anna.id, 'b')).not.toBeNull();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('401: stops and keeps (retried after signing in again)', async () => {
    record();
    api.updateUserData.mockRejectedValueOnce(new api.ApiError('http', 401));
    await sync.syncProgress();
    expect(sync.getPendingProgress(anna.id, 'film')).not.toBeNull();
  });

  it('item gone (404): dropped; server error (500): kept; the rest goes on', async () => {
    record({ itemId: 'gone' });
    record({ itemId: 'broken', startedAt: later(SESSION, 1000) });
    record({ itemId: 'fine', startedAt: later(SESSION, 2000) });
    api.getUserData
      .mockRejectedValueOnce(new api.ApiError('http', 404))
      .mockRejectedValueOnce(new api.ApiError('http', 500));
    await sync.syncProgress();
    expect(sync.getPendingProgress(anna.id, 'gone')).toBeNull();
    expect(sync.getPendingProgress(anna.id, 'broken')).not.toBeNull();
    expect(sync.getPendingProgress(anna.id, 'fine')).toBeNull();
  });

  it("an answer that isn't JSON (a proxy page): kept, the rest goes on", async () => {
    record({ itemId: 'odd' });
    record({ itemId: 'fine', startedAt: later(SESSION, 1000) });
    api.getUserData.mockRejectedValueOnce(new api.ApiError('parse'));
    await sync.syncProgress();
    expect(sync.getPendingProgress(anna.id, 'odd')).not.toBeNull();
    expect(sync.getPendingProgress(anna.id, 'fine')).toBeNull();
  });

  it('a newer record while asking (the session went on) is kept and not overwritten', async () => {
    record();
    api.getUserData.mockImplementationOnce(async () => {
      record({ positionTicks: 50 * MIN });
      return { PlaybackPositionTicks: 0, Played: false };
    });
    await sync.syncProgress();
    expect(sync.getPendingProgress(anna.id, 'film')).toMatchObject({ positionTicks: 50 * MIN });
  });

  it('known offline or signed out: nothing sent', async () => {
    record();
    api.isOffline.mockReturnValueOnce(true);
    await sync.syncProgress();
    mockSession.state = { accounts: [anna], active: null };
    await sync.syncProgress();
    expect(api.getUserData).not.toHaveBeenCalled();
  });

  it('one run at a time: a call meanwhile runs again after', async () => {
    record();
    let answer: (v: Api.UserItemDataDto) => void = () => {};
    api.getUserData.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
    const first = sync.syncProgress();
    const second = sync.syncProgress();
    record({ itemId: 'next' });
    answer({ PlaybackPositionTicks: 0, Played: false });
    await Promise.all([first, second]);
    expect(api.getUserData.mock.calls.map((c) => c[1])).toEqual(['film', 'next']);
  });

  it('onSynced: once after every run, the pull included; also when skipped offline', async () => {
    const synced = jest.fn();
    const off = sync.onSynced(synced);
    api.isOffline.mockReturnValueOnce(true);
    await sync.syncProgress();
    expect(synced).toHaveBeenCalledTimes(1);
    record();
    const first = sync.syncProgress();
    const second = sync.syncProgress();
    await Promise.all([first, second]);
    expect(synced).toHaveBeenCalledTimes(2);
    off();
    await sync.syncProgress();
    expect(synced).toHaveBeenCalledTimes(2);
  });

  it("then the server's UserData goes into the saved items of the account's downloads", async () => {
    mockDownloads.list = [
      { accountId: anna.id, itemId: 'film', path: 'downloads/srv.a/film/v1.mkv' },
      { accountId: anna.id, itemId: 'film', path: 'downloads/srv.a/film/v2.mkv' },
      { accountId: anna.id, itemId: 'ep', path: 'downloads/srv.a/ep/v.mkv' },
      { accountId: ben.id, itemId: 'other', path: 'downloads/srv.b/other/v.mkv' },
    ];
    const userData = { PlaybackPositionTicks: 0, Played: true };
    api.getItemsById.mockResolvedValue({
      Items: [{ Id: 'film', Name: 'Film', Type: 'Movie', UserData: userData }],
      TotalRecordCount: 1,
    });
    await sync.syncProgress();
    expect(api.getItemsById).toHaveBeenCalledWith(expect.objectContaining({ accountId: anna.id }), ['film', 'ep']);
    expect(writeSnapshotUserData).toHaveBeenCalledTimes(1);
    expect(writeSnapshotUserData).toHaveBeenCalledWith('downloads/srv.a/film/v1.mkv', userData);
  });

  it('the pull runs again after 10 min, or at once when the replay sent something', async () => {
    mockDownloads.list = [{ accountId: anna.id, itemId: 'film', path: 'downloads/srv.a/film/v1.mkv' }];
    jest.useFakeTimers({ now: Date.parse(SESSION) });
    try {
      await sync.syncProgress();
      await sync.syncProgress();
      expect(api.getItemsById).toHaveBeenCalledTimes(1);
      record();
      await sync.syncProgress();
      expect(api.getItemsById).toHaveBeenCalledTimes(2);
      jest.setSystemTime(Date.parse(SESSION) + sync.PULL_EVERY_MS);
      await sync.syncProgress();
      expect(api.getItemsById).toHaveBeenCalledTimes(3);
    } finally {
      jest.useRealTimers();
    }
  });

  it('pullNextRun: the next run pulls within the 10 min (the player closed)', async () => {
    mockDownloads.list = [{ accountId: anna.id, itemId: 'film', path: 'downloads/srv.a/film/v1.mkv' }];
    api.getItemsById.mockResolvedValue({ Items: [], TotalRecordCount: 0 });
    await sync.syncProgress();
    await sync.syncProgress();
    expect(api.getItemsById).toHaveBeenCalledTimes(1);
    sync.pullNextRun(anna.id);
    await sync.syncProgress();
    expect(api.getItemsById).toHaveBeenCalledTimes(2);
  });

  it('nothing downloaded: no pull request', async () => {
    await sync.syncProgress();
    expect(api.getItemsById).not.toHaveBeenCalled();
  });
});

describe('initSync', () => {
  const flush = () => act(async () => {});

  it('runs at launch, on reconnect and back from the background', async () => {
    record();
    sync.initSync();
    await flush();
    expect(api.getUserData).toHaveBeenCalledTimes(1);

    record();
    (onReconnect.mock.calls[0][0] as () => void)();
    await flush();
    expect(api.getUserData).toHaveBeenCalledTimes(2);

    record();
    appState('inactive');
    appState('active');
    await flush();
    expect(api.getUserData).toHaveBeenCalledTimes(2); // a quick switch
    appState('background');
    appState('active');
    await flush();
    expect(api.getUserData).toHaveBeenCalledTimes(3);
  });

  it("an account switch replays the new account's queue; a removed account's queue goes", async () => {
    sync.initSync();
    await flush();
    record({ accountId: ben.id });
    mockSession.state = { accounts: [anna, ben], active: ben };
    mockSession.listeners.forEach((l) => l());
    await flush();
    expect(api.getUserData).toHaveBeenCalledWith(expect.objectContaining({ accountId: ben.id }), 'film');

    record({ accountId: ben.id });
    api.getUserData.mockClear();
    mockSession.state = { accounts: [anna], active: anna };
    mockSession.listeners.forEach((l) => l());
    await flush();
    expect(sync.getPendingProgress(ben.id, 'film')).toBeNull();
  });
});
