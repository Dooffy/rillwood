// SPDX-License-Identifier: GPL-3.0-or-later
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Storage } from 'expo-sqlite/kv-store';

import type { BaseItemDto } from './api';
import { keptMessage, offloadMessage, watchedMessage } from './components/OffloadToast';
import type { Download } from './downloads';
import {
  cleanup,
  expiresAt,
  expiryLabel,
  holdPlaying,
  initOffload,
  onOffload,
  onWatched,
  timeLeft,
  watchedSinceReset,
  watchedTime,
} from './offload';
import { setOffloadDays, setOffloadWatched } from './settings';
import type { PendingProgress } from './sync';

const mockStore: {
  list: Download[];
  items: Map<string, BaseItemDto>;
  pending: Map<string, PendingProgress>;
  /** The time a reset stamps (the real one uses Date.now()). */
  now: number;
} = {
  now: 0,
  list: [],
  items: new Map(),
  pending: new Map(),
};
const mockSynced: (() => void)[] = [];
jest.mock('./downloads', () => ({
  getDownloads: () => mockStore.list,
  deleteDownloads: jest.fn((ids: string[]) => {
    mockStore.list = mockStore.list.filter((d) => !ids.includes(d.id));
  }),
  resetTimers: jest.fn((ids: string[], at: number = mockStore.now) => {
    mockStore.list = mockStore.list.map((d) => (ids.includes(d.id) ? { ...d, resetAt: at } : d));
  }),
  setWatched: jest.fn((times: Map<string, number | undefined>) => {
    mockStore.list = mockStore.list.map((d) => (times.has(d.id) ? { ...d, watchedAt: times.get(d.id) } : d));
  }),
}));
jest.mock('./downloadSnapshot', () => ({
  readSnapshotItem: jest.fn((path: string) => mockStore.items.get(path.split('/')[2]) ?? null),
}));
jest.mock('./sync', () => ({
  getPendingProgress: (accountId: string, itemId: string) => mockStore.pending.get(`${accountId}:${itemId}`) ?? null,
  onSynced: (l: () => void) => mockSynced.push(l),
  pullNextRun: jest.fn(),
}));

const { deleteDownloads, setWatched } = jest.requireMock<{ deleteDownloads: jest.Mock; setWatched: jest.Mock }>(
  './downloads',
);
const { readSnapshotItem } = jest.requireMock<{ readSnapshotItem: jest.Mock }>('./downloadSnapshot');
const { pullNextRun } = jest.requireMock<{ pullNextRun: jest.Mock }>('./sync');

const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;
const NOW = Date.parse('2026-10-14T12:00:00.000Z');
const GB = 1e9;
const iso = (t: number) => new Date(t).toISOString();

const dl = (itemId: string, fields: Partial<Download> = {}): Download => ({
  id: `a:${itemId}:${itemId}`,
  accountId: 'a',
  itemId,
  sourceId: itemId,
  title: itemId,
  path: `downloads/a/${itemId}/${itemId}.mkv`,
  status: 'done',
  bytes: GB,
  total: GB,
  createdAt: NOW - 30 * DAY,
  downloadedAt: NOW - 30 * DAY,
  pinned: false,
  ...fields,
});
const played = (at?: number, positionTicks = 0): BaseItemDto => ({
  Id: 'x',
  Name: 'x',
  Type: 'Movie',
  UserData: {
    Played: true,
    PlaybackPositionTicks: positionTicks,
    LastPlayedDate: at === undefined ? undefined : iso(at),
  },
});
const pending = (fields: Partial<PendingProgress>): PendingProgress => ({
  accountId: 'a',
  itemId: 'x',
  positionTicks: 0,
  lastPlayedAt: iso(NOW - 2 * HOUR),
  watched: false,
  ...fields,
});

beforeEach(() => {
  jest.clearAllMocks();
  Storage.clearSync();
  setOffloadDays(90);
  setOffloadWatched(0);
  mockStore.list = [];
  mockStore.items = new Map();
  mockStore.pending = new Map();
});

describe('watchedTime', () => {
  it("the server's played date; not watched, or a rewatch under way (resume point): none", () => {
    expect(watchedTime(played(NOW - DAY), null, undefined, NOW)).toBe(NOW - DAY);
    expect(watchedTime(played(NOW - DAY, 5), null, undefined, NOW)).toBeUndefined();
    expect(watchedTime({ Id: 'x', Name: 'x', Type: 'Movie' }, null, undefined, NOW)).toBeUndefined();
    expect(watchedTime(null, null, 5, NOW)).toBeUndefined();
  });

  it('the end of playback here wins over the session start the server stamps', () => {
    expect(watchedTime(played(NOW - 2 * HOUR), null, NOW - HOUR, NOW)).toBe(NOW - HOUR);
    // A later watch elsewhere moves it on.
    expect(watchedTime(played(NOW - HOUR), null, NOW - DAY, NOW)).toBe(NOW - HOUR);
  });

  it('played without a date: the known time, else now', () => {
    expect(watchedTime(played(), null, 5, NOW)).toBe(5);
    expect(watchedTime(played(), null, undefined, NOW)).toBe(NOW);
  });

  it('progress not synced yet wins: watched offline, rewatched offline, under 5% (the saved state)', () => {
    expect(watchedTime(null, pending({ watched: true }), undefined, NOW)).toBe(NOW - 2 * HOUR);
    expect(watchedTime(played(NOW - DAY), pending({ positionTicks: 9 }), 1, NOW)).toBeUndefined();
    expect(watchedTime(null, pending({ watched: true, positionTicks: 9 }), 1, NOW)).toBeUndefined();
    expect(watchedTime(played(NOW - DAY), pending({}), undefined, NOW)).toBe(NOW - DAY);
  });
});

describe('expiresAt', () => {
  it('days after the download, watched or not; Never: no timer', () => {
    expect(expiresAt(dl('m'), 90, 0)).toBe(NOW + 60 * DAY);
    expect(expiresAt(dl('m', { watchedAt: NOW - DAY }), 90, 0)).toBe(NOW + 60 * DAY);
    expect(expiresAt(dl('m'), 0, 0)).toBeUndefined();
  });

  it('from the last Reset Timer instead', () => {
    expect(expiresAt(dl('m', { resetAt: NOW }), 30, 0)).toBe(NOW + 30 * DAY);
  });

  it('Remove watched: hours after watching when that comes first', () => {
    expect(expiresAt(dl('m', { watchedAt: NOW - HOUR }), 90, 24)).toBe(NOW + 23 * HOUR);
    expect(expiresAt(dl('m', { watchedAt: NOW - HOUR }), 0, 6)).toBe(NOW + 5 * HOUR);
    // The download timer is sooner.
    expect(expiresAt(dl('m', { watchedAt: NOW - HOUR, downloadedAt: NOW - 90 * DAY }), 90, 24)).toBe(NOW);
  });

  it('a watch before the download or the last reset does not count', () => {
    expect(expiresAt(dl('m', { watchedAt: NOW - 40 * DAY }), 0, 24)).toBeUndefined();
    expect(expiresAt(dl('m', { watchedAt: NOW - HOUR, resetAt: NOW }), 30, 24)).toBe(NOW + 30 * DAY);
    expect(watchedSinceReset(dl('m', { watchedAt: NOW, resetAt: NOW }))).toBe(false);
  });

  it('a reset while it was still downloading counts from the finish', () => {
    expect(expiresAt(dl('m', { resetAt: NOW - 5 * DAY, downloadedAt: NOW }), 30, 0)).toBe(NOW + 30 * DAY);
  });

  it('only finished downloads', () => {
    expect(expiresAt(dl('m', { status: 'paused' }), 30, 24)).toBeUndefined();
  });
});

it('time left: days over 72 h, then hours, then minutes (up); due: soon', () => {
  expect(timeLeft(NOW + 90 * DAY, NOW)).toBe('90 days');
  // Days only, never "178d 13h".
  expect(timeLeft(NOW + 178 * DAY + 13 * HOUR, NOW)).toBe('178 days');
  expect(timeLeft(NOW + 3 * DAY + 12 * HOUR, NOW)).toBe('3 days');
  expect(timeLeft(NOW + 72 * HOUR, NOW)).toBe('72h');
  expect(timeLeft(NOW + 5 * HOUR + 20 * 60_000, NOW)).toBe('5h');
  expect(timeLeft(NOW + HOUR, NOW)).toBe('1h');
  expect(timeLeft(NOW + 59 * 60_000 + 1, NOW)).toBe('1h');
  expect(timeLeft(NOW + 59 * 60_000, NOW)).toBe('59m');
  expect(timeLeft(NOW + 30_000, NOW)).toBe('1m');
  expect(timeLeft(NOW, NOW)).toBeUndefined();
  expect(expiryLabel(NOW + 4 * DAY, NOW)).toEqual({ text: 'Expires in 4 days', soon: false });
  expect(expiryLabel(NOW + 5 * HOUR, NOW)).toEqual({ text: 'Expires in 5h', soon: true });
  expect(expiryLabel(NOW - 1, NOW)).toEqual({ text: 'Expires soon', soon: true });
});

describe('cleanup', () => {
  it('removes downloads past their timer; newer, reset and unfinished ones stay', () => {
    mockStore.list = [
      dl('old', { downloadedAt: NOW - 91 * DAY }),
      dl('new'),
      dl('reset', { downloadedAt: NOW - 200 * DAY, resetAt: NOW - DAY }),
      dl('part', { status: 'paused', downloadedAt: undefined, createdAt: NOW - 200 * DAY }),
    ];
    expect(cleanup(NOW)).toEqual({ count: 1, bytes: GB });
    expect(deleteDownloads).toHaveBeenCalledWith(['a:old:old']);
    // The timer alone: no saved item read.
    expect(readSnapshotItem).not.toHaveBeenCalled();
  });

  it('both off: nothing', () => {
    setOffloadDays(0);
    mockStore.list = [dl('old', { downloadedAt: NOW - 900 * DAY })];
    expect(cleanup(NOW)).toBeNull();
  });

  it('Remove watched: watched times saved in one write; gone after the cooldown', () => {
    setOffloadWatched(24);
    mockStore.list = [dl('done'), dl('cooling'), dl('unwatched')];
    mockStore.items.set('done', played(NOW - 25 * HOUR));
    mockStore.items.set('cooling', played(NOW - HOUR));
    expect(cleanup(NOW)).toEqual({ count: 1, bytes: GB });
    expect(deleteDownloads).toHaveBeenCalledWith(['a:done:done']);
    expect(setWatched).toHaveBeenCalledTimes(1);
    expect(mockStore.list.find((d) => d.itemId === 'cooling')?.watchedAt).toBe(NOW - HOUR);
  });

  it('reads the saved item once per item (versions share it); nothing to save when nothing changed', () => {
    setOffloadWatched(24);
    mockStore.list = [dl('m', { id: 'v1' }), dl('m', { id: 'v2' })];
    mockStore.items.set('m', played(NOW - HOUR));
    cleanup(NOW);
    expect(readSnapshotItem).toHaveBeenCalledTimes(1);
    cleanup(NOW);
    expect(setWatched).toHaveBeenCalledTimes(1);
  });

  it('marked unwatched on the server: the watched time goes', () => {
    setOffloadWatched(24);
    mockStore.list = [dl('m', { watchedAt: NOW - HOUR })];
    mockStore.items.set('m', {
      Id: 'm',
      Name: 'm',
      Type: 'Movie',
      UserData: { Played: false, PlaybackPositionTicks: 0 },
    });
    expect(cleanup(NOW)).toBeNull();
    expect(mockStore.list[0].watchedAt).toBeUndefined();
  });

  it('watched offline (not synced yet) counts', () => {
    setOffloadWatched(6);
    mockStore.list = [dl('m')];
    mockStore.pending.set('a:m', pending({ itemId: 'm', watched: true, lastPlayedAt: iso(NOW - 7 * HOUR) }));
    expect(cleanup(NOW)?.count).toBe(1);
  });
});

describe('holdPlaying', () => {
  it('never removes what the player has open; the release asks for a pull', () => {
    mockStore.list = [dl('m', { downloadedAt: NOW - 91 * DAY })];
    const release = holdPlaying('a', 'm');
    expect(cleanup(NOW)).toBeNull();
    release(false);
    expect(pullNextRun).toHaveBeenCalledWith('a');
    expect(setWatched).not.toHaveBeenCalled();
    expect(cleanup(NOW)?.count).toBe(1);
  });

  it('played to the end: watched from now (the end, not the session start); Remove watched on → the Keep toast', () => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
    mockStore.list = [dl('m'), dl('m', { id: 'v2' }), dl('other')];
    const told = jest.fn();
    const off = onWatched(told);
    holdPlaying('a', 'm')(true);
    expect(mockStore.list.filter((d) => d.watchedAt === NOW).map((d) => d.id)).toEqual(['a:m:m', 'v2']);
    expect(told).not.toHaveBeenCalled(); // Remove watched off

    setOffloadWatched(24);
    holdPlaying('a', 'm')(true);
    expect(told).toHaveBeenCalledWith({ ids: ['a:m:m', 'v2'], hours: 24 });
    off();
    jest.restoreAllMocks();
  });
});

it('initOffload: a cleanup after every sync run (the toast); a setting change restarts every timer', () => {
  initOffload();
  const told = jest.fn();
  const off = onOffload(told);
  mockStore.list = [dl('m', { downloadedAt: NOW - 100 * DAY })];
  mockSynced.forEach((l) => l());
  expect(told).toHaveBeenCalledWith({ count: 1, bytes: GB });
  off();

  // 180 days → 30 days with old downloads: nothing goes at once, every timer starts again.
  mockStore.now = NOW;
  mockStore.list = [dl('a', { downloadedAt: NOW - 179 * DAY }), dl('b', { downloadedAt: NOW - 85 * DAY })];
  setOffloadDays(30);
  expect(mockStore.list.map((d) => expiresAt(d, 30, 0))).toEqual([NOW + 30 * DAY, NOW + 30 * DAY]);
  expect(cleanup(NOW)).toBeNull();
  // Remove watched too (a pending watched removal is cancelled); the same value again or another setting: no reset.
  const { resetTimers } = jest.requireMock<{ resetTimers: jest.Mock }>('./downloads');
  setOffloadWatched(24);
  expect(resetTimers).toHaveBeenCalledTimes(2);
  setOffloadWatched(24);
  setOffloadDays(30);
  expect(resetTimers).toHaveBeenCalledTimes(2);
});

it('toast messages', () => {
  expect(offloadMessage({ count: 2, bytes: 3.4e9 })).toBe('Removed 2 downloads - 3.4 GB freed.');
  expect(offloadMessage({ count: 1, bytes: 8e8 })).toBe('Removed 1 download - 800 MB freed.');
  expect(watchedMessage(24)).toBe('Watched - removed in 24 hours.');
  expect(watchedMessage(72)).toBe('Watched - removed in 3 days.');
  expect(keptMessage(90)).toBe('Kept for 90 more days.');
  expect(keptMessage(0)).toBe('Kept.');
});
