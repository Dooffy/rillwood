// SPDX-License-Identifier: GPL-3.0-or-later
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';

import type NativeDownloads from '../modules/downloads';
import type { Task } from '../modules/downloads';
import type { BaseItemDto, MediaSourceDto } from './api';
import type * as Store from './downloads';
import type { Account } from './session';

const React = jest.requireActual<typeof import('react')>('react');
const GB = 1024 ** 3;

// Files on "disk" (path relative to Documents → size) and the disk itself.
const mockFiles = new Map<string, number>();
const mockDirs = new Set<string>();
const mockDeletedDirs: string[] = [];
const mockDisk = { available: 100 * GB, total: 200 * GB };
jest.mock('expo-file-system', () => ({
  Paths: {
    document: 'docs',
    get availableDiskSpace() {
      return mockDisk.available;
    },
    get totalDiskSpace() {
      return mockDisk.total;
    },
  },
  File: class {
    path: string;
    constructor(_dir: string, path: string) {
      this.path = path;
    }
    get exists() {
      return mockFiles.has(this.path);
    }
    get size() {
      return mockFiles.get(this.path) ?? 0;
    }
    delete() {
      mockFiles.delete(this.path);
    }
  },
  Directory: class {
    path: string;
    constructor(_dir: string, path: string) {
      this.path = path;
      mockDirs.add(path);
    }
    get exists() {
      return mockDirs.has(this.path);
    }
    list() {
      return [...mockFiles.keys()].filter((f) => f.startsWith(`${this.path}/`));
    }
    delete() {
      mockDirs.delete(this.path);
      mockDeletedDirs.push(this.path);
    }
  },
}));

const account = (id: string, signedOut = false): Account => ({
  id,
  server: { id: 'srv', url: `https://${id}.example`, name: 'Home', version: '12.1.0' },
  userId: 'u',
  userName: 'Ann',
  deviceId: 'dev',
  signedOut,
});
const mockSession = { accounts: [account('a1')], active: account('a1') as Account | null };
const mockSessionListeners = new Set<() => void>();
jest.mock('./session', () => ({
  getSession: () => mockSession,
  connectionFor: (a: Account) =>
    a.signedOut ? null : { baseUrl: a.server.url, deviceId: a.deviceId, token: `tok-${a.id}`, accountId: a.id },
  subscribeSession: (l: () => void) => {
    mockSessionListeners.add(l);
    return () => mockSessionListeners.delete(l);
  },
}));

// The store's kv-store instance (re-required after every jest.resetModules); `clearSync` is the mock's.
let Storage: typeof import('expo-sqlite/kv-store').Storage & { clearSync: () => void };
let dl: typeof Store;
let native: jest.Mocked<typeof NativeDownloads>;
// Native event listeners registered by initDownloads.
let emit: (event: 'progress' | 'done' | 'error', payload: object) => void;

const movie = (id: string, size?: number, container = 'mkv'): Store.DownloadRequest => ({
  item: { Id: id, Name: `Movie ${id}`, Type: 'Movie' } as BaseItemDto,
  source: { Id: id, Container: container, Size: size } as MediaSourceDto,
});

const saved = () => JSON.parse(Storage.getItemSync('dl') ?? 'null') as { version: number; items: Store.Download[] };

// Fresh store (its index is cached in memory after the first read) with its own kv-store and native mock instances.
function fresh() {
  jest.resetModules();
  // One React for the store and the testing library.
  jest.doMock('react', () => React);
  /* eslint-disable @typescript-eslint/no-require-imports -- a fresh module per test needs a sync require */
  Storage = require('expo-sqlite/kv-store').Storage;
  dl = require('./downloads');
  native = require('../modules/downloads').default;
  /* eslint-enable @typescript-eslint/no-require-imports */
}

beforeEach(() => {
  fresh();
  Storage.clearSync();
  mockFiles.clear();
  mockDirs.clear();
  mockDeletedDirs.length = 0;
  mockDisk.available = 100 * GB;
  mockSession.accounts = [account('a1')];
  mockSession.active = mockSession.accounts[0];
  mockSessionListeners.clear();
  emit = (event, payload) =>
    (native.addListener.mock.calls.find(([e]) => e === event)?.[1] as (p: object) => void)(payload);
});

describe('startDownloads', () => {
  it('saves the downloads and hands them to native in one batch with the credential', () => {
    const result = dl.startDownloads([movie('m1', 4 * GB), movie('m2', GB, 'mov,mp4')]);

    expect(result).toEqual({ ok: true, started: 2, skipped: 0 });
    expect(native.setCredential).toHaveBeenCalledWith('a1', { Authorization: expect.stringContaining('tok-a1') });
    expect(native.enqueue).toHaveBeenCalledTimes(1);
    expect(native.enqueue).toHaveBeenCalledWith(
      [
        {
          id: 'a1:m1:m1',
          accountId: 'a1',
          url: 'https://a1.example/Items/m1/Download',
          dest: 'downloads/a1/m1/m1.mkv',
          size: 4 * GB,
        },
        expect.objectContaining({ id: 'a1:m2:m2', dest: 'downloads/a1/m2/m2.mov' }),
      ],
      { cellular: false },
    );
    expect(saved().version).toBe(1);
    expect(saved().items.map((d) => [d.id, d.status, d.total])).toEqual([
      ['a1:m1:m1', 'queued', 4 * GB],
      ['a1:m2:m2', 'queued', GB],
    ]);
  });

  it('downloads an alternate version by its source id', () => {
    dl.startDownloads([{ item: movie('m1').item, source: { Id: 'v2', Container: 'mp4', Size: GB } as MediaSourceDto }]);
    expect(native.enqueue.mock.calls[0][0][0]).toMatchObject({
      id: 'a1:m1:v2',
      url: 'https://a1.example/Items/v2/Download',
      dest: 'downloads/a1/m1/v2.mp4',
    });
  });

  it('skips sources without a size and items already downloaded or queued', () => {
    dl.startDownloads([movie('m1', GB)]);
    native.enqueue.mockClear();

    expect(dl.startDownloads([movie('m1', GB), movie('m2'), movie('m3', GB)])).toEqual({
      ok: true,
      started: 1,
      skipped: 2,
    });
    expect(native.enqueue.mock.calls[0][0].map((i) => i.id)).toEqual(['a1:m3:m3']);
  });

  it('does nothing when every item is skipped', () => {
    expect(dl.startDownloads([movie('m1')])).toEqual({ ok: true, started: 0, skipped: 1 });
    expect(native.enqueue).not.toHaveBeenCalled();
    expect(Storage.getItemSync('dl')).toBeNull();
  });

  it('names the file .bin when the server sends no container', () => {
    dl.startDownloads([movie('m1', GB, '')]);
    expect(dl.getDownload('a1:m1:m1')?.path).toBe('downloads/a1/m1/m1.bin');
  });

  it('needs a signed-in account', () => {
    mockSession.active = null;
    expect(dl.startDownloads([movie('m1', GB)])).toEqual({ ok: false, problem: 'signedOut' });
    expect(native.enqueue).not.toHaveBeenCalled();
  });

  it('keeps max(2 GB, 5% of the disk) free after everything queued', () => {
    mockDisk.total = 100 * GB; // 5% = 5 GB
    mockDisk.available = 20 * GB;
    expect(dl.startDownloads([movie('m1', 10 * GB)]).ok).toBe(true);
    // 20 - 10 pending - 6 = 4 GB left < 5 GB
    expect(dl.startDownloads([movie('m2', 6 * GB)])).toEqual({ ok: false, problem: 'space' });
    expect(native.enqueue).toHaveBeenCalledTimes(1);
    expect(dl.getDownload('a1:m2:m2')).toBeNull();
  });
});

describe('native events', () => {
  beforeEach(() => {
    dl.initDownloads();
    dl.startDownloads([movie('m1', 4 * GB)]);
  });

  it('progress updates bytes in memory; only the first one is saved (status)', () => {
    emit('progress', { id: 'a1:m1:m1', bytes: 100, total: 4 * GB });
    expect(dl.getDownload('a1:m1:m1')).toMatchObject({ status: 'downloading', bytes: 100 });
    expect(saved().items[0]).toMatchObject({ status: 'downloading', bytes: 100 });

    emit('progress', { id: 'a1:m1:m1', bytes: 500, total: 4 * GB });
    expect(dl.getDownload('a1:m1:m1')?.bytes).toBe(500);
    expect(saved().items[0].bytes).toBe(100);
  });

  it('done marks it downloaded', () => {
    emit('done', { id: 'a1:m1:m1' });
    expect(dl.getDownload('a1:m1:m1')).toMatchObject({ status: 'done', bytes: 4 * GB });
    expect(saved().items[0].downloadedAt).toEqual(expect.any(Number));
  });

  it('error takes the state native stopped it in (paused for auth / failed)', () => {
    emit('error', { id: 'a1:m1:m1', state: 'paused', reason: 'auth', status: 401, message: 'Unauthorized' });
    expect(dl.getDownload('a1:m1:m1')).toMatchObject({ status: 'paused', reason: 'auth' });
    emit('error', { id: 'a1:m1:m1', state: 'error', reason: 'storage', message: 'Disk full' });
    expect(saved().items[0]).toMatchObject({ status: 'error', reason: 'storage' });
  });

  it('ignores events for unknown ids', () => {
    emit('done', { id: 'other' });
    expect(dl.getDownloads()).toHaveLength(1);
  });

  it('useDownload re-renders on progress; useDownloadList only on structural changes', async () => {
    let listRenders = 0;
    const item = await renderHook(() => dl.useDownload('a1:m1:m1'));
    await renderHook(() => {
      listRenders++;
      return dl.useDownloadList();
    });
    await act(async () => emit('progress', { id: 'a1:m1:m1', bytes: 1, total: 4 * GB }));
    await act(async () => emit('progress', { id: 'a1:m1:m1', bytes: 2, total: 4 * GB }));
    expect(item.result.current?.bytes).toBe(2);
    expect(listRenders).toBe(2); // mount + queued → downloading
  });
});

describe('pause / resume / delete', () => {
  beforeEach(() => {
    dl.startDownloads([movie('m1', GB)]);
    native.enqueue.mockClear();
  });

  it('pauses', () => {
    dl.pauseDownload('a1:m1:m1');
    expect(native.pause).toHaveBeenCalledWith('a1:m1:m1');
    expect(saved().items[0]).toMatchObject({ status: 'paused', reason: 'user' });
  });

  it('resumes: re-sends the task (native skips it if it still has it), a changed credential first', () => {
    dl.pauseDownload('a1:m1:m1');
    native.setCredential.mockClear();
    dl.resumeDownload('a1:m1:m1');
    expect(native.setCredential).not.toHaveBeenCalled(); // unchanged since the start
    expect(native.enqueue.mock.calls[0][0].map((i) => i.id)).toEqual(['a1:m1:m1']);
    expect(native.resume).toHaveBeenCalledWith('a1:m1:m1');
    expect(dl.getDownload('a1:m1:m1')).toMatchObject({ status: 'queued', reason: undefined });
  });

  it('resume of a signed-out account stays paused for auth', () => {
    dl.pauseDownload('a1:m1:m1');
    mockSession.accounts = [account('a1', true)];
    dl.resumeDownload('a1:m1:m1');
    expect(native.enqueue).not.toHaveBeenCalled();
    expect(dl.getDownload('a1:m1:m1')).toMatchObject({ status: 'paused', reason: 'auth' });
  });

  it('ignores pause when not running and resume when not paused', () => {
    dl.resumeDownload('a1:m1:m1');
    expect(native.resume).not.toHaveBeenCalled();
    dl.pauseDownload('a1:m1:m1');
    dl.pauseDownload('a1:m1:m1');
    expect(native.pause).toHaveBeenCalledTimes(1);
  });

  it('delete cancels native, removes the file and the entry', () => {
    mockFiles.set('downloads/a1/m1/m1.mkv', GB);
    dl.deleteDownload('a1:m1:m1');
    expect(native.cancel).toHaveBeenCalledWith('a1:m1:m1');
    expect(mockFiles.size).toBe(0);
    expect(dl.getDownloads()).toEqual([]);
    expect(saved().items).toEqual([]);
  });
});

describe('reconcile', () => {
  const task = (id: string, state: Task['state'], bytes = 0, reason?: Task['reason']): Task => ({
    id,
    bytes,
    total: GB,
    state,
    reason,
  });

  beforeEach(() => {
    dl.startDownloads([movie('m1', GB), movie('m2', GB), movie('m3', GB), movie('m4', GB)]);
    dl.pauseDownload('a1:m4:m4');
    native.enqueue.mockClear();
    native.setCredential.mockClear();
  });

  it('mirrors native, finishes completed files, re-sends lost tasks, cancels orphans', async () => {
    mockFiles.set('downloads/a1/m2/m2.mkv', GB); // finished while JS was dead
    native.getTasks.mockResolvedValueOnce([task('a1:m1:m1', 'running', 300), task('orphan', 'queued')]);

    await dl.reconcile();

    expect(dl.getDownload('a1:m1:m1')).toMatchObject({ status: 'downloading', bytes: 300 });
    expect(dl.getDownload('a1:m2:m2')).toMatchObject({ status: 'done', bytes: GB });
    expect(native.enqueue.mock.calls[0][0].map((i) => i.id)).toEqual(['a1:m3:m3']);
    expect(dl.getDownload('a1:m4:m4')?.status).toBe('paused'); // paused without a task: resume re-sends
    expect(native.cancel).toHaveBeenCalledWith('orphan');
    expect(native.cancel).toHaveBeenCalledTimes(1);
  });

  it("doesn't take a partial file as finished", async () => {
    mockFiles.set('downloads/a1/m2/m2.mkv', GB - 1);
    await dl.reconcile();
    expect(dl.getDownload('a1:m2:m2')?.status).toBe('queued');
    expect(native.enqueue.mock.calls[0][0].map((i) => i.id)).toContain('a1:m2:m2');
  });

  it('keeps going when native fails to answer', async () => {
    native.getTasks.mockRejectedValueOnce(new Error('gone'));
    await expect(dl.reconcile()).resolves.toBeUndefined();
    expect(native.enqueue).not.toHaveBeenCalled();
  });

  it('runs once at a time', async () => {
    await Promise.all([dl.reconcile(), dl.reconcile()]);
    expect(native.getTasks).toHaveBeenCalledTimes(1);
  });
});

describe('index', () => {
  it('loads the saved index on first use', () => {
    const item = { id: 'a1:m1:m1', accountId: 'a1', status: 'done' };
    Storage.setItemSync('dl', JSON.stringify({ version: 1, items: [item] }));
    expect(dl.getDownloads()).toEqual([item]);
  });

  it('starts empty on an unknown version or bad JSON', () => {
    Storage.setItemSync('dl', JSON.stringify({ version: 99, items: [{ id: 'x' }] }));
    expect(dl.getDownloads()).toEqual([]);
    fresh();
    Storage.setItemSync('dl', '{');
    expect(dl.getDownloads()).toEqual([]);
  });
});

describe('credentials', () => {
  it('native holds the header of signed-in accounts with downloads, sent only when it changes', () => {
    dl.startDownloads([movie('m1', GB)]);
    native.setCredential.mockClear();
    dl.initDownloads();
    const notify = () => mockSessionListeners.forEach((l) => l());

    expect(native.setCredential).toHaveBeenCalledTimes(0); // already sent with the download
    notify();
    expect(native.setCredential).toHaveBeenCalledTimes(0);

    mockSession.accounts = [account('a1', true)];
    notify();
    notify();
    expect(native.clearCredential.mock.calls).toEqual([['a1']]);

    mockSession.accounts = [account('a1')]; // signed in again
    notify();
    expect(native.setCredential).toHaveBeenCalledTimes(1);

    mockSession.accounts = []; // removed
    notify();
    expect(native.clearCredential.mock.calls).toEqual([['a1'], ['a1']]);
  });
});

describe('lifecycle', () => {
  it('reconciles at launch and back from the background, not after a quick switch', async () => {
    const { AppState } = jest.requireActual<typeof import('react-native')>('react-native');
    const change = jest.spyOn(AppState, 'addEventListener');
    dl.initDownloads();
    expect(native.getTasks).toHaveBeenCalledTimes(1);
    await act(async () => {});

    const onChange = change.mock.calls[0][1] as (s: string) => void;
    onChange('inactive');
    onChange('active');
    expect(native.getTasks).toHaveBeenCalledTimes(1);
    onChange('background');
    onChange('active');
    expect(native.getTasks).toHaveBeenCalledTimes(2);
  });
});

describe('review regressions', () => {
  it("keeps server ids from leaving their folder (no '/', no '..')", () => {
    dl.startDownloads([
      { item: movie('../../x').item, source: { Id: 'a/../b', Container: 'mkv', Size: GB } as MediaSourceDto },
    ]);
    const path = dl.getDownloads()[0].path;
    expect(path).toBe('downloads/a1/______x/a____b.mkv');
    expect(path.split('/').every((p) => p !== '..' && p !== '.')).toBe(true);
  });

  it('a batch native rejects ends in error instead of throwing', () => {
    native.enqueue.mockImplementationOnce(() => {
      throw new Error('Invalid download');
    });
    expect(dl.startDownloads([movie('m1', GB)])).toEqual({ ok: true, started: 1, skipped: 0 });
    expect(dl.getDownload('a1:m1:m1')).toMatchObject({ status: 'error', reason: 'system' });
  });

  it('a late progress event after a pause keeps it paused', () => {
    dl.initDownloads();
    dl.startDownloads([movie('m1', GB)]);
    dl.pauseDownload('a1:m1:m1');
    emit('progress', { id: 'a1:m1:m1', bytes: 10, total: GB });
    expect(dl.getDownload('a1:m1:m1')).toMatchObject({ status: 'paused', reason: 'user' });
  });

  it('clears the credential of an account signed out after its downloads were deleted', () => {
    dl.initDownloads();
    dl.startDownloads([movie('m1', GB)]);
    dl.deleteDownload('a1:m1:m1');
    mockSession.accounts = [account('a1', true)];
    mockSessionListeners.forEach((l) => l());
    expect(native.clearCredential).toHaveBeenCalledWith('a1');
  });

  it('counts live bytes of running downloads as already on disk', () => {
    dl.initDownloads();
    mockDisk.total = 100 * GB; // margin 5 GB
    mockDisk.available = 30 * GB;
    dl.startDownloads([movie('m1', 20 * GB)]);
    emit('progress', { id: 'a1:m1:m1', bytes: 1, total: 20 * GB });
    emit('progress', { id: 'a1:m1:m1', bytes: 19 * GB, total: 20 * GB });
    mockDisk.available = 11 * GB; // 19 GB written
    // 11 - 1 pending - 3 = 7 GB left > 5 GB
    expect(dl.startDownloads([movie('m2', 3 * GB)]).ok).toBe(true);
  });

  it('a request with nothing new to start never fails on space', () => {
    dl.startDownloads([movie('m1', GB)]);
    mockDisk.available = GB;
    expect(dl.startDownloads([movie('m1', GB), movie('m2')])).toEqual({ ok: true, started: 0, skipped: 2 });
  });

  it('reconcile finishes a paused download whose full file is on disk', async () => {
    dl.startDownloads([movie('m1', GB)]);
    dl.pauseDownload('a1:m1:m1');
    mockFiles.set('downloads/a1/m1/m1.mkv', GB);
    await dl.reconcile();
    expect(dl.getDownload('a1:m1:m1')?.status).toBe('done');
  });

  it('reconciles back from the background via inactive', async () => {
    const { AppState } = jest.requireActual<typeof import('react-native')>('react-native');
    const change = jest.spyOn(AppState, 'addEventListener');
    dl.initDownloads();
    await act(async () => {});
    const onChange = change.mock.calls[0][1] as (s: string) => void;
    onChange('background');
    onChange('inactive');
    onChange('active');
    expect(native.getTasks).toHaveBeenCalledTimes(2);
  });

  it("delete removes the item's folder once it's empty", () => {
    dl.startDownloads([movie('m1', GB)]);
    mockFiles.set('downloads/a1/m1/m1.mkv', GB);
    dl.deleteDownload('a1:m1:m1');
    expect(mockDeletedDirs).toEqual(['downloads/a1/m1']);
  });

  it("an unreadable index doesn't cancel native tasks or get overwritten", async () => {
    Storage.setItemSync('dl', JSON.stringify({ version: 2, items: [] }));
    native.getTasks.mockResolvedValueOnce([{ id: 'a1:m1:m1', bytes: 5, total: GB, state: 'running' }]);
    await dl.reconcile();
    expect(native.cancel).not.toHaveBeenCalled();
    dl.startDownloads([movie('m2', GB)]);
    expect(JSON.parse(Storage.getItemSync('dl') ?? '{}').version).toBe(2);
  });
});
