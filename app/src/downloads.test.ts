// SPDX-License-Identifier: GPL-3.0-or-later
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';

import type NativeDownloads from '../modules/downloads';
import type { Task } from '../modules/downloads';
import type { BaseItemDto, MediaSourceDto } from './api';
import type * as Store from './downloads';
import { readSnapshotItem, writeSnapshotUserData } from './downloadSnapshot';
import type { Account } from './session';

const React = jest.requireActual<typeof import('react')>('react');
const GB = 1024 ** 3;

// Files on "disk" (path relative to Documents → size) and the disk itself.
const mockFiles = new Map<string, number>();
const mockDirs = new Set<string>();
const mockDeletedDirs: string[] = [];
// Snapshot I/O: written text by path, fetched URLs, a switch to fail every fetch.
const mockTexts = new Map<string, string>();
const mockFetched: string[] = [];
const mockFailFetch = { value: false };
// Single URLs that fail (a subtitle the server no longer serves).
const mockFailUrls = new Set<string>();
const mockDisk = { available: 100 * GB, important: (100 * GB) as number | null, total: 200 * GB };
jest.mock('expo-file-system', () => {
  class File {
    path: string;
    constructor(_dir: string, ...parts: string[]) {
      this.path = parts.join('/');
    }
    get name() {
      return this.path.slice(this.path.lastIndexOf('/') + 1);
    }
    get uri() {
      return `file:///docs/${this.path}`;
    }
    get exists() {
      return mockFiles.has(this.path);
    }
    get size() {
      return mockFiles.get(this.path) ?? 0;
    }
    create() {
      mockFiles.set(this.path, 0);
    }
    async write(text: string) {
      mockTexts.set(this.path, text);
      mockFiles.set(this.path, text.length);
    }
    textSync() {
      return mockTexts.get(this.path) ?? '';
    }
    delete() {
      mockFiles.delete(this.path);
    }
    static async downloadFileAsync(url: string, file: { path: string }) {
      mockFetched.push(url);
      if (mockFailFetch.value || mockFailUrls.has(url)) throw new Error('UnableToDownload');
      mockFiles.set(file.path, 1);
    }
  }
  class Directory {
    path: string;
    constructor(_dir: string, path: string) {
      this.path = path;
      mockDirs.add(path);
    }
    get name() {
      return this.path.slice(this.path.lastIndexOf('/') + 1);
    }
    get exists() {
      return mockDirs.has(this.path);
    }
    create() {
      mockDirs.add(this.path);
    }
    // Direct children, like the real one: files in it and its sub-folders (from deeper files too).
    list() {
      const prefix = `${this.path}/`;
      const files: File[] = [];
      const dirs = new Set<string>();
      for (const p of [...mockFiles.keys(), ...mockDirs]) {
        if (!p.startsWith(prefix)) continue;
        const rest = p.slice(prefix.length);
        if (rest.includes('/')) dirs.add(rest.slice(0, rest.indexOf('/')));
        else if (mockFiles.has(p)) files.push(new File('docs', p));
        else dirs.add(rest);
      }
      return [...files, ...[...dirs].map((d) => new Directory('docs', `${prefix}${d}`))];
    }
    delete() {
      const inside = (p: string) => p === this.path || p.startsWith(`${this.path}/`);
      [...mockDirs].filter(inside).forEach((d) => mockDirs.delete(d));
      mockDeletedDirs.push(this.path);
      [...mockFiles.keys()].filter(inside).forEach((f) => mockFiles.delete(f));
    }
  }
  return {
    Paths: {
      document: 'docs',
      get availableDiskSpace() {
        return mockDisk.available;
      },
      get totalDiskSpace() {
        return mockDisk.total;
      },
    },
    File,
    Directory,
  };
});

// Free space as the store reads it (iOS "important usage"); null → the call fails, the store falls back to Paths.
jest.mock('expo-file-system/legacy', () => ({
  getFreeDiskStorageAsync: async () => {
    if (mockDisk.important === null) throw new Error('unavailable');
    return mockDisk.important;
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
let settings: typeof import('./settings');
let native: jest.Mocked<typeof NativeDownloads>;
// Native event listeners registered by initDownloads.
let emit: (event: 'progress' | 'done' | 'error' | 'waiting', payload: object) => void;

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
  settings = require('./settings');
  native = require('../modules/downloads').default;
  /* eslint-enable @typescript-eslint/no-require-imports */
}

beforeEach(() => {
  fresh();
  Storage.clearSync();
  mockFiles.clear();
  mockDirs.clear();
  mockDeletedDirs.length = 0;
  mockTexts.clear();
  mockFetched.length = 0;
  mockFailFetch.value = false;
  mockFailUrls.clear();
  mockDisk.available = 100 * GB;
  mockDisk.important = 100 * GB;
  mockSession.accounts = [account('a1')];
  mockSession.active = mockSession.accounts[0];
  mockSessionListeners.clear();
  emit = (event, payload) =>
    (native.addListener.mock.calls.find(([e]) => e === event)?.[1] as (p: object) => void)(payload);
});

describe('startDownloads', () => {
  it('saves the downloads and hands them to native in one batch with the credential', async () => {
    const result = await dl.startDownloads([movie('m1', 4 * GB), movie('m2', GB, 'mov,mp4')]);

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

  it('downloads an alternate version by its source id', async () => {
    await dl.startDownloads([
      { item: movie('m1').item, source: { Id: 'v2', Container: 'mp4', Size: GB } as MediaSourceDto },
    ]);
    expect(native.enqueue.mock.calls[0][0][0]).toMatchObject({
      id: 'a1:m1:v2',
      url: 'https://a1.example/Items/v2/Download',
      dest: 'downloads/a1/m1/v2.mp4',
    });
  });

  it('skips sources without a size and items already downloaded or queued', async () => {
    await dl.startDownloads([movie('m1', GB)]);
    native.enqueue.mockClear();

    expect(await dl.startDownloads([movie('m1', GB), movie('m2'), movie('m3', GB)])).toEqual({
      ok: true,
      started: 1,
      skipped: 2,
    });
    expect(native.enqueue.mock.calls[0][0].map((i) => i.id)).toEqual(['a1:m3:m3']);
  });

  it('does nothing when every item is skipped', async () => {
    expect(await dl.startDownloads([movie('m1')])).toEqual({ ok: true, started: 0, skipped: 1 });
    expect(native.enqueue).not.toHaveBeenCalled();
    expect(Storage.getItemSync('dl')).toBeNull();
  });

  it('names the file .bin when the server sends no container', async () => {
    await dl.startDownloads([movie('m1', GB, '')]);
    expect(dl.getDownload('a1:m1:m1')?.path).toBe('downloads/a1/m1/m1.bin');
  });

  it('needs a signed-in account', async () => {
    mockSession.active = null;
    expect(await dl.startDownloads([movie('m1', GB)])).toEqual({ ok: false, problem: 'signedOut' });
    expect(native.enqueue).not.toHaveBeenCalled();
  });

  it('keeps max(2 GB, 5% of the disk) free after everything queued', async () => {
    mockDisk.total = 100 * GB; // 5% = 5 GB
    mockDisk.important = 20 * GB;
    expect((await dl.startDownloads([movie('m1', 10 * GB)])).ok).toBe(true);
    // 20 - 10 pending - 6 = 4 GB left < 5 GB
    expect(await dl.startDownloads([movie('m2', 6 * GB)])).toEqual({ ok: false, problem: 'space' });
    expect(native.enqueue).toHaveBeenCalledTimes(1);
    expect(dl.getDownload('a1:m2:m2')).toBeNull();
  });

  it('keeps every download together under the storage limit (decimal GB)', async () => {
    settings.setDownloadLimit(10);
    expect((await dl.startDownloads([movie('m1', 6 * GB)])).ok).toBe(true);
    // 6 + 4 GiB = 10.7 GB > 10 GB
    expect(await dl.startDownloads([movie('m2', 4 * GB)])).toEqual({ ok: false, problem: 'limit' });
    expect(dl.getDownload('a1:m2:m2')).toBeNull();
    expect((await dl.startDownloads([movie('m3', 3 * GB)])).ok).toBe(true);
    settings.setDownloadLimit(0);
    expect((await dl.startDownloads([movie('m2', 4 * GB)])).ok).toBe(true);
  });

  it('a request with nothing new never fails on the limit', async () => {
    await dl.startDownloads([movie('m1', 6 * GB)]);
    settings.setDownloadLimit(5);
    expect(await dl.startDownloads([movie('m1', 6 * GB)])).toEqual({ ok: true, started: 0, skipped: 1 });
  });

  it('enqueues under the network setting', async () => {
    settings.setDownloadNetwork('any');
    await dl.startDownloads([movie('m1', GB)]);
    expect(native.enqueue).toHaveBeenCalledWith([expect.objectContaining({ id: 'a1:m1:m1' })], { cellular: true });
  });
});

describe('network setting', () => {
  it('sends the saved rule at launch and every change after', () => {
    settings.setDownloadNetwork('any');
    dl.initDownloads();
    expect(native.setCellular.mock.calls).toEqual([[true]]);
    settings.setDownloadNetwork('wifi');
    expect(native.setCellular).toHaveBeenLastCalledWith(false);
    // Another setting changing doesn't resend it.
    settings.setDownloadLimit(50);
    settings.setDownloadNetwork('wifi');
    expect(native.setCellular).toHaveBeenCalledTimes(2);
  });
});

describe('native events', () => {
  beforeEach(async () => {
    dl.initDownloads();
    await dl.startDownloads([movie('m1', 4 * GB)]);
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

  it('waiting: waits for the network, then not any more; bytes flowing clear it too', () => {
    emit('progress', { id: 'a1:m1:m1', bytes: 100, total: 4 * GB });
    emit('waiting', { id: 'a1:m1:m1', reason: 'network' });
    expect(dl.getDownload('a1:m1:m1')).toMatchObject({ status: 'queued', reason: 'network', bytes: 100 });
    expect(saved().items[0]).toMatchObject({ status: 'queued', reason: 'network' });
    emit('waiting', { id: 'a1:m1:m1' });
    expect(dl.getDownload('a1:m1:m1')).toMatchObject({ status: 'queued', reason: undefined });

    emit('waiting', { id: 'a1:m1:m1', reason: 'network' });
    emit('progress', { id: 'a1:m1:m1', bytes: 200, total: 4 * GB });
    expect(dl.getDownload('a1:m1:m1')).toMatchObject({ status: 'downloading', reason: undefined, bytes: 200 });
  });

  it('waiting: the clear keeps a downloading row downloading; done / failed rows ignore it', () => {
    emit('waiting', { id: 'a1:m1:m1', reason: 'network' });
    emit('progress', { id: 'a1:m1:m1', bytes: 100, total: 4 * GB });
    emit('waiting', { id: 'a1:m1:m1' });
    expect(dl.getDownload('a1:m1:m1')).toMatchObject({ status: 'downloading', reason: undefined });

    emit('error', { id: 'a1:m1:m1', state: 'error', reason: 'storage', message: 'Disk full' });
    emit('waiting', { id: 'a1:m1:m1', reason: 'network' });
    expect(dl.getDownload('a1:m1:m1')).toMatchObject({ status: 'error', reason: 'storage' });
  });

  it('waiting: a late event after a pause keeps it paused', () => {
    dl.pauseDownload('a1:m1:m1');
    emit('waiting', { id: 'a1:m1:m1', reason: 'network' });
    expect(dl.getDownload('a1:m1:m1')).toMatchObject({ status: 'paused', reason: 'user' });
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
  beforeEach(async () => {
    await dl.startDownloads([movie('m1', GB)]);
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

  it('reset timers and watched times (offload) are saved', () => {
    dl.resetTimers(['a1:m1:m1'], 99);
    dl.setWatched(new Map([['a1:m1:m1', 1234]]));
    expect(saved().items[0]).toMatchObject({ resetAt: 99, watchedAt: 1234 });
    dl.setWatched(new Map([['a1:m1:m1', undefined]]));
    expect(saved().items[0].watchedAt).toBeUndefined();
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

describe('groups', () => {
  const episode = (id: string, season: string, size = GB): Store.DownloadRequest => ({
    item: {
      Id: id,
      Name: id,
      Type: 'Episode',
      SeriesId: 'show',
      SeasonId: season,
      SeriesName: 'Show',
      ParentIndexNumber: Number(season.slice(1)),
      IndexNumber: Number(id.slice(1)),
    } as BaseItemDto,
    source: { Id: id, Container: 'mkv', Size: size } as MediaSourceDto,
  });

  beforeEach(async () => {
    dl.initDownloads();
    await dl.reconcile(); // the launch reconcile, done before anything starts
    await dl.startDownloads([episode('e1', 's1'), episode('e2', 's1', 3 * GB), episode('e3', 's2')]);
    native.enqueue.mockClear();
  });

  it('saves the season of an episode', () => {
    expect(saved().items.map((d) => d.seasonId)).toEqual(['s1', 's1', 's2']);
  });

  it("saves the show's name and the episode's place in it (Downloads tab)", () => {
    expect(saved().items.map((d) => [d.seriesName, d.seasonNumber, d.episodeNumber])).toEqual([
      ['Show', 1, 1],
      ['Show', 1, 2],
      ['Show', 2, 3],
    ]);
  });

  it('useDownloadSummary follows a whole show across its seasons', async () => {
    const show = await renderHook(() => dl.useDownloadSummary(dl.downloadGroup('a1', { seriesId: 'show' })));
    expect(show.result.current?.ids).toEqual(['a1:e1:e1', 'a1:e2:e2', 'a1:e3:e3']);
    await act(async () => emit('progress', { id: 'a1:e3:e3', bytes: GB }));
    expect(show.result.current?.progress).toBe(0.2);
  });

  it('summarize: downloading over paused over done, progress over every byte', () => {
    const at = (status: Store.DownloadStatus, bytes: number, total = 4) => ({ status, bytes, total, itemId: status });
    const sum = (...d: ReturnType<typeof at>[]) => dl.summarize(d as unknown as Store.Download[]);
    expect(sum()).toBeNull();
    expect(sum(at('done', 0), at('paused', 1), at('queued', 1))).toMatchObject({
      state: 'downloading',
      progress: 6 / 12,
    });
    expect(sum(at('done', 0), at('error', 2))).toMatchObject({
      state: 'paused',
      progress: 6 / 8,
      itemIds: ['done', 'error'],
    });
    expect(sum(at('done', 4))).toMatchObject({ state: 'done', progress: 1 });
  });

  it('useDownloadSummary follows a season live, the same object while nothing changes', async () => {
    const season = await renderHook(() => dl.useDownloadSummary(dl.downloadGroup('a1', { seasonId: 's1' })));
    const first = season.result.current;
    expect(first).toMatchObject({
      state: 'downloading',
      progress: 0,
      ids: ['a1:e1:e1', 'a1:e2:e2'],
      itemIds: ['e1', 'e2'],
    });
    await act(async () => emit('progress', { id: 'a1:e3:e3', bytes: GB }));
    expect(season.result.current).toBe(first); // another season
    await act(async () => emit('progress', { id: 'a1:e2:e2', bytes: GB }));
    expect(season.result.current?.progress).toBe(0.25);
    const other = await renderHook(() => dl.useDownloadSummary(dl.downloadGroup('a2', { itemId: 'e1' })));
    expect(other.result.current).toBeNull(); // another account's
  });

  it('useHasDownloads re-renders when the group gains or loses downloads, not on progress', async () => {
    let renders = 0;
    const has = await renderHook(() => {
      renders++;
      return dl.useHasDownloads(dl.downloadGroup('a1', { itemId: 'e1' }));
    });
    expect(has.result.current).toBe(true);
    await act(async () => emit('progress', { id: 'a1:e1:e1', bytes: GB / 2 }));
    expect(renders).toBe(1);
    await act(async () => dl.deleteDownload('a1:e1:e1'));
    expect(has.result.current).toBe(false);
  });

  it('pauses, resumes (one native batch) and deletes a group', () => {
    dl.pauseDownloads(['a1:e1:e1', 'a1:e2:e2']);
    expect(native.pause).toHaveBeenCalledTimes(2);
    dl.resumeDownloads(['a1:e1:e1', 'a1:e2:e2', 'a1:e3:e3']);
    expect(native.enqueue).toHaveBeenCalledTimes(1);
    expect(native.enqueue.mock.calls[0][0].map((i) => i.id)).toEqual(['a1:e1:e1', 'a1:e2:e2']);
    expect(native.resume).toHaveBeenCalledTimes(2);
    dl.deleteDownloads(['a1:e1:e1', 'a1:e2:e2']);
    expect(dl.getDownloads().map((d) => d.id)).toEqual(['a1:e3:e3']);
  });
  it('cancel deletes the unfinished ones of a group at once; done ones stay (and count in the summary)', async () => {
    emit('done', { id: 'a1:e1:e1' });
    const season = await renderHook(() => dl.useDownloadSummary(dl.downloadGroup('a1', { seasonId: 's1' })));
    expect(season.result.current).toMatchObject({ state: 'downloading', done: 1 });
    await act(async () => dl.cancelDownloads(['a1:e1:e1', 'a1:e2:e2']));
    expect(native.cancel.mock.calls).toEqual([['a1:e2:e2']]);
    expect(
      dl
        .getDownloads()
        .map((d) => d.id)
        .sort(),
    ).toEqual(['a1:e1:e1', 'a1:e3:e3']);
    expect(season.result.current).toMatchObject({ state: 'done', done: 1, ids: ['a1:e1:e1'] });
  });
});

describe('snapshot', () => {
  // Snapshots chain per item and retry one at a time: let every pending step run.
  const flush = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));
  const sintel = (): Store.DownloadRequest => ({
    item: {
      Id: 'm1',
      Name: 'Sintel',
      Type: 'Movie',
      Overview: 'A girl and a dragon.',
      ImageTags: { Primary: 'p' },
      BackdropImageTags: ['b'],
    } as BaseItemDto,
    source: {
      Id: 'v1',
      Container: 'mkv',
      Size: GB,
      MediaStreams: [
        { Type: 'Subtitle', Index: 2, Codec: 'subrip' },
        { Type: 'Subtitle', Index: 3, Codec: 'subrip', IsExternal: true },
        { Type: 'Subtitle', Index: 4, Codec: 'PGSSUB', IsExternal: true },
      ],
    } as MediaSourceDto,
  });

  it('saves item JSON, poster, backdrop and the external text subtitles next to the file - no token in the URLs', async () => {
    await dl.startDownloads([sintel()]);
    await flush();
    expect(JSON.parse(mockTexts.get('downloads/a1/m1/item.json') ?? '{}')).toMatchObject({
      Overview: 'A girl and a dragon.',
    });
    expect(mockFetched).toEqual([
      'https://a1.example/Items/m1/Images/Primary?fillWidth=720&quality=90&tag=p',
      'https://a1.example/Items/m1/Images/Backdrop?fillWidth=1920&quality=90&tag=b',
      'https://a1.example/Videos/m1/v1/Subtitles/3/Stream.srt',
    ]);
    expect(mockFetched.join()).not.toMatch(/tok-|api_?key/i);
    expect(saved().items[0].snapshot).toEqual({
      poster: 'downloads/a1/m1/poster.jpg',
      backdrop: 'downloads/a1/m1/backdrop.jpg',
      subtitles: [{ index: 3, path: 'downloads/a1/m1/v1.sub-3.srt' }],
    });
    expect(readSnapshotItem('downloads/a1/m1/v1.mkv')?.Name).toBe('Sintel');
  });

  it('a failed snapshot is retried at reconcile from the saved item JSON', async () => {
    mockFailFetch.value = true;
    await dl.startDownloads([sintel()]);
    await flush();
    expect(dl.getDownload('a1:m1:v1')?.snapshot).toBeUndefined();
    mockFailFetch.value = false;
    await dl.reconcile();
    await flush();
    expect(dl.getDownload('a1:m1:v1')?.snapshot?.subtitles).toEqual([
      { index: 3, path: 'downloads/a1/m1/v1.sub-3.srt' },
    ]);
  });

  describe('savedItem (offline detail)', () => {
    // A download of item m1 (version `source`) with its saved item on "disk".
    const withItem = (source: string, over: Partial<Store.Download> = {}) => {
      const accountId = over.accountId ?? 'a1';
      const folder = `downloads/${accountId}/m1`;
      mockFiles.set(`${folder}/item.json`, 1);
      mockTexts.set(`${folder}/item.json`, JSON.stringify({ Id: 'm1', Name: `Sintel ${source}` }));
      const id = `${accountId}:m1:${source}`;
      const path = `${folder}/${source}.mkv`;
      return { id, accountId, itemId: 'm1', sourceId: source, path, status: 'done', total: GB, createdAt: 1, ...over };
    };
    const seed = (...items: object[]) => Storage.setItemSync('dl', JSON.stringify({ version: 1, items }));

    it('the saved item with its backdrop, else its poster, as a file URI', () => {
      mockFiles.set('downloads/a1/m1/backdrop.jpg', 1);
      seed(withItem('v1', { snapshot: { backdrop: 'downloads/a1/m1/backdrop.jpg', subtitles: [] } }));
      expect(dl.savedItem('a1', 'm1')).toEqual({
        item: { Id: 'm1', Name: 'Sintel v1' },
        art: 'file:///docs/downloads/a1/m1/backdrop.jpg',
      });
    });

    it('falls back to the poster; no art when the files are gone', () => {
      mockFiles.set('downloads/a1/m1/poster.jpg', 1);
      seed(withItem('v1', { snapshot: { poster: 'downloads/a1/m1/poster.jpg', subtitles: [] } }));
      expect(dl.savedItem('a1', 'm1')?.art).toBe('file:///docs/downloads/a1/m1/poster.jpg');
      mockFiles.delete('downloads/a1/m1/poster.jpg');
      expect(dl.savedItem('a1', 'm1')).toEqual({ item: { Id: 'm1', Name: 'Sintel v1' }, art: undefined });
    });

    it('any status - the snapshot is saved when the download starts', () => {
      seed(withItem('v1', { status: 'downloading' }));
      expect(dl.savedItem('a1', 'm1')?.item.Name).toBe('Sintel v1');
    });

    it.each([
      ['not downloaded', () => seed()],
      ['another account', () => seed(withItem('v1', { accountId: 'a2' }))],
      [
        'no saved item',
        () => {
          const d = withItem('v1');
          mockFiles.delete('downloads/a1/m1/item.json');
          seed(d);
        },
      ],
    ])('null when %s', (_, setup) => {
      setup();
      expect(dl.savedItem('a1', 'm1')).toBeNull();
    });

    it("a show: built from its newest downloaded episode, with the show's poster", () => {
      const ep = (n: number, createdAt: number) => {
        const folder = `downloads/a1/e${n}`;
        mockFiles.set(`${folder}/item.json`, 1);
        mockTexts.set(`${folder}/item.json`, JSON.stringify({ Id: `e${n}`, Name: `Ep ${n}`, SeriesName: `Show ${n}` }));
        mockFiles.set(`${folder}/poster.jpg`, 1);
        mockFiles.set(`${folder}/backdrop.jpg`, 1);
        const snapshot = { poster: `${folder}/poster.jpg`, backdrop: `${folder}/backdrop.jpg`, subtitles: [] };
        return {
          ...withItem('v1', { itemId: `e${n}`, id: `a1:e${n}:v1`, createdAt, snapshot }),
          path: `${folder}/v1.mkv`,
          seriesId: 'show',
        };
      };
      seed(ep(1, 1), ep(2, 2));
      expect(dl.savedItem('a1', 'show')).toEqual({
        item: { Id: 'show', Name: 'Show 2', Type: 'Series' },
        art: 'file:///docs/downloads/a1/e2/poster.jpg',
      });
      expect(dl.savedItem('a1', 'e1')?.item.Name).toBe('Ep 1');
      expect(dl.savedItem('a1', 'e1')?.art).toBe('file:///docs/downloads/a1/e1/backdrop.jpg');
    });
  });

  it('a download deleted while its snapshot saves leaves no folder behind', async () => {
    await dl.startDownloads([sintel()]);
    dl.deleteDownload('a1:m1:v1'); // before the snapshot's fetches finish
    await flush();
    expect([...mockFiles.keys()].filter((f) => f.startsWith('downloads/a1/m1/'))).toEqual([]);
    expect(dl.getDownloads()).toEqual([]);
  });

  it("deleting one of two versions keeps the item's snapshot; the other's file and subtitles go", async () => {
    const other = { item: sintel().item, source: { ...sintel().source, Id: 'v2' } };
    await dl.startDownloads([sintel(), other]);
    await flush();
    mockFiles.set('downloads/a1/m1/v2.mkv', GB);
    dl.deleteDownload('a1:m1:v2');
    expect(mockFiles.has('downloads/a1/m1/v2.mkv')).toBe(false);
    expect(mockFiles.has('downloads/a1/m1/v2.sub-3.srt')).toBe(false);
    expect(mockFiles.has('downloads/a1/m1/v1.sub-3.srt')).toBe(true);
    expect(mockFiles.has('downloads/a1/m1/item.json')).toBe(true);
    expect(mockDeletedDirs).toEqual([]);
  });

  it('versions of one item save one after the other; the second keeps the poster + backdrop already there', async () => {
    const other = { item: sintel().item, source: { ...sintel().source, Id: 'v2' } };
    await dl.startDownloads([sintel(), other]);
    await flush();
    expect(mockFetched.filter((u) => u.includes('/Images/'))).toHaveLength(2);
    expect(mockFetched.filter((u) => u.includes('/Subtitles/'))).toEqual([
      'https://a1.example/Videos/m1/v1/Subtitles/3/Stream.srt',
      'https://a1.example/Videos/m1/v2/Subtitles/3/Stream.srt',
    ]);
    expect(dl.getDownload('a1:m1:v2')?.snapshot?.poster).toBe('downloads/a1/m1/poster.jpg');
  });

  it("a server stream index can't put a subtitle file outside the item folder", async () => {
    const request = sintel();
    const hostile = {
      Type: 'Subtitle',
      Index: '/../../../a2/x' as unknown as number,
      Codec: 'subrip',
      IsExternal: true,
    };
    request.source.MediaStreams = [hostile];
    await dl.startDownloads([request]);
    await flush();
    expect(mockFetched.some((u) => u.includes('/Subtitles/'))).toBe(false);
    expect([...mockFiles.keys()].every((f) => f.startsWith('downloads/a1/m1/'))).toBe(true);
  });

  it('keeps what it got when one piece fails for good (no retry on every foreground)', async () => {
    mockFailUrls.add('https://a1.example/Videos/m1/v1/Subtitles/3/Stream.srt');
    await dl.startDownloads([sintel()]);
    await flush();
    expect(dl.getDownload('a1:m1:v1')?.snapshot).toEqual({
      poster: 'downloads/a1/m1/poster.jpg',
      backdrop: 'downloads/a1/m1/backdrop.jpg',
      subtitles: [],
    });
  });

  it('a retry round stops at the first failure (still offline)', async () => {
    mockFailFetch.value = true;
    await dl.startDownloads([sintel(), { ...movie('m2', GB), item: { ...sintel().item, Id: 'm2' } }]);
    await flush();
    mockFetched.length = 0;
    await dl.reconcile();
    await flush();
    // The first download's 3 pieces were tried, the second's weren't.
    expect(mockFetched).toHaveLength(3);
    expect(mockFetched.every((u) => u.includes('/m1/'))).toBe(true);
  });

  it("one version deleted while saving: its subtitles don't stay behind", async () => {
    const other = { item: sintel().item, source: { ...sintel().source, Id: 'v2' } };
    await dl.startDownloads([sintel(), other]);
    dl.deleteDownload('a1:m1:v2'); // its snapshot is queued behind v1's
    await flush();
    expect(mockFiles.has('downloads/a1/m1/v2.sub-3.srt')).toBe(false);
    expect(mockFiles.has('downloads/a1/m1/v1.sub-3.srt')).toBe(true);
  });

  it('retries from the server when the item JSON was never written', async () => {
    const fetchMock = jest.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ...sintel().item, MediaSources: [{ ...sintel().source, Id: 'm1' }] }),
    }));
    global.fetch = fetchMock as unknown as typeof fetch;
    mockFailFetch.value = true;
    await dl.startDownloads([{ ...sintel(), source: { ...sintel().source, Id: 'm1' } }]);
    await flush();
    mockFiles.delete('downloads/a1/m1/item.json'); // as if killed before it landed
    mockFailFetch.value = false;
    await dl.reconcile();
    await flush();
    expect(fetchMock).toHaveBeenCalledWith('https://a1.example/Items/m1', expect.anything());
    expect(dl.getDownload('a1:m1:m1')?.snapshot?.poster).toBe('downloads/a1/m1/poster.jpg');
  });
  it("the server's UserData goes into the saved item (offline sync); unchanged or missing → no write", async () => {
    const json = 'downloads/a1/m1/item.json';
    mockFiles.set(json, 1);
    mockTexts.set(
      json,
      JSON.stringify({ Id: 'm1', Name: 'Sintel', UserData: { PlaybackPositionTicks: 5, Played: false } }),
    );
    const played = { PlaybackPositionTicks: 0, Played: true };
    await writeSnapshotUserData('downloads/a1/m1/v1.mkv', played);
    expect(readSnapshotItem('downloads/a1/m1/v1.mkv')).toEqual({ Id: 'm1', Name: 'Sintel', UserData: played });
    const text = mockTexts.get(json);
    await writeSnapshotUserData('downloads/a1/m1/v1.mkv', { ...played });
    expect(mockTexts.get(json)).toBe(text);
    await writeSnapshotUserData('downloads/a1/none/v1.mkv', played);
    expect(mockTexts.has('downloads/a1/none/item.json')).toBe(false);
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

  beforeEach(async () => {
    await dl.startDownloads([movie('m1', GB), movie('m2', GB), movie('m3', GB), movie('m4', GB)]);
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

describe('orphan sweep', () => {
  const WEEK = 7 * 24 * 60 * 60 * 1000;
  const disk = () => [...mockFiles.keys()].sort();

  beforeEach(async () => {
    // Two versions of m1 (one still running on Android: its `.part`), with their snapshot.
    await dl.startDownloads([
      movie('m1', GB),
      { ...movie('m1', GB), source: { Id: 'v2', Size: GB } as MediaSourceDto },
    ]);
    for (const f of [
      'downloads/a1/m1/m1.mkv',
      'downloads/a1/m1/v2.bin.part',
      'downloads/a1/m1/m1.sub-3.srt',
      'downloads/a1/m1/item.json',
      'downloads/a1/m1/poster.jpg',
      'downloads/a1/m1/backdrop.jpg',
    ])
      mockFiles.set(f, 1);
  });

  it('deletes folders and files no download owns, keeps every version and its snapshot', async () => {
    mockFiles.set('downloads/a1/m1/old.mkv', 1); // a deleted version's video
    mockFiles.set('downloads/a1/m1/old.sub-2.srt', 1);
    mockFiles.set('downloads/a1/gone/gone.mkv', 1); // an item deleted while the app was killed
    mockFiles.set('downloads/a1/gone/item.json', 1);
    mockFiles.set('downloads/a2/x/x.mkv', 1); // an account's leftovers
    mockFiles.set('downloads/stray.tmp', 1);

    await dl.reconcile();

    expect(disk()).toEqual([
      'downloads/a1/m1/backdrop.jpg',
      'downloads/a1/m1/item.json',
      'downloads/a1/m1/m1.mkv',
      'downloads/a1/m1/m1.sub-3.srt',
      'downloads/a1/m1/poster.jpg',
      'downloads/a1/m1/v2.bin.part',
    ]);
  });

  it('deleting one version takes its own files, `.part` included; the shared snapshot stays', () => {
    dl.deleteDownload('a1:m1:v2');
    expect(disk()).not.toContain('downloads/a1/m1/v2.bin.part');
    expect(disk()).toContain('downloads/a1/m1/item.json');
  });

  it('runs once a week', async () => {
    await dl.reconcile();
    mockFiles.set('downloads/a1/gone/gone.mkv', 1);
    await dl.reconcile();
    expect(disk()).toContain('downloads/a1/gone/gone.mkv');

    Storage.setItemSync('dlSweep', String(Date.now() - WEEK));
    await dl.reconcile();
    expect(disk()).not.toContain('downloads/a1/gone/gone.mkv');
  });

  it('runs when the last one is stamped in the future (clock moved back)', async () => {
    Storage.setItemSync('dlSweep', String(Date.now() + WEEK));
    mockFiles.set('downloads/a1/gone/gone.mkv', 1);
    await dl.reconcile();
    expect(disk()).not.toContain('downloads/a1/gone/gone.mkv');
  });

  it("deletes nothing when native doesn't answer", async () => {
    mockFiles.set('downloads/a1/gone/gone.mkv', 1);
    native.getTasks.mockRejectedValueOnce(new Error('gone'));
    await dl.reconcile();
    expect(disk()).toContain('downloads/a1/gone/gone.mkv');
    expect(Storage.getItemSync('dlSweep')).toBeNull();
  });

  it('deletes nothing while the index was never saved (lost kv-store)', async () => {
    fresh();
    await dl.reconcile();
    expect(disk()).toContain('downloads/a1/m1/m1.mkv');
    expect(Storage.getItemSync('dlSweep')).toBeNull();
  });

  it('deletes nothing with an unreadable index', async () => {
    fresh();
    Storage.setItemSync('dl', '{bad');
    await dl.reconcile();
    expect(disk()).toContain('downloads/a1/m1/m1.mkv');
  });
});

describe('index', () => {
  it('loads the saved index on first use', () => {
    const item = { id: 'a1:m1:m1', accountId: 'a1', status: 'done' };
    Storage.setItemSync('dl', JSON.stringify({ version: 1, items: [item] }));
    expect(dl.getDownloads()).toEqual([item]);
  });

  it("fills in an old episode's show name from its saved item JSON", () => {
    const path = 'downloads/a1/e1/s1.mkv';
    mockFiles.set('downloads/a1/e1/item.json', 1);
    mockTexts.set(
      'downloads/a1/e1/item.json',
      JSON.stringify({ Id: 'e1', SeriesName: 'Big Show', ParentIndexNumber: 2, IndexNumber: 5 }),
    );
    const old = { id: 'a1:e1:s1', accountId: 'a1', seriesId: 'show', path, status: 'done' };
    const noJson = { ...old, id: 'a1:e2:s2', path: 'downloads/a1/e2/s2.mkv' };
    Storage.setItemSync('dl', JSON.stringify({ version: 1, items: [old, noJson] }));
    expect(dl.getDownloads()).toEqual([{ ...old, seriesName: 'Big Show', seasonNumber: 2, episodeNumber: 5 }, noJson]);
  });

  describe('localCopy', () => {
    // A download of item m1 (version `source`) with its file + saved item on "disk" (listing versions v1-v3).
    const savedItem = { Id: 'm1', Name: 'Sintel', MediaSources: [{ Id: 'v1' }, { Id: 'v2' }, { Id: 'v3' }] };
    const copy = (source: string, over: Partial<Store.Download> = {}) => {
      const accountId = over.accountId ?? 'a1';
      const folder = `downloads/${accountId}/m1`;
      const path = `${folder}/${source}.mkv`;
      mockFiles.set(path, GB);
      mockFiles.set(`${folder}/item.json`, 1);
      mockTexts.set(`${folder}/item.json`, JSON.stringify(savedItem));
      const id = `${accountId}:m1:${source}`;
      return { id, accountId, itemId: 'm1', sourceId: source, path, status: 'done', total: GB, ...over };
    };
    const seed = (...items: object[]) => Storage.setItemSync('dl', JSON.stringify({ version: 1, items }));

    it('a finished download: its file, saved item and the subtitle files still there', () => {
      const d = copy('v1', {
        snapshot: {
          subtitles: [
            { index: 3, path: 'downloads/a1/m1/v1.sub-3.srt' },
            { index: 4, path: 'downloads/a1/m1/v1.sub-4.ass' },
          ],
        },
      });
      mockFiles.set('downloads/a1/m1/v1.sub-3.srt', 1);
      seed(d);
      expect(dl.localCopy('a1', 'm1')).toEqual({
        item: savedItem,
        sourceId: 'v1',
        uri: 'file:///docs/downloads/a1/m1/v1.mkv',
        subtitles: [{ index: 3, uri: 'file:///docs/downloads/a1/m1/v1.sub-3.srt' }],
      });
    });

    it('the newest finished version', () => {
      seed(copy('v1', { downloadedAt: 1 }), copy('v2', { downloadedAt: 2 }), copy('v3', { status: 'downloading' }));
      expect(dl.localCopy('a1', 'm1')?.sourceId).toBe('v2');
    });

    it('a version asked for: that one, not the newest', () => {
      seed(copy('v1', { downloadedAt: 1 }), copy('v2', { downloadedAt: 2 }));
      expect(dl.localCopy('a1', 'm1', 'v1')?.sourceId).toBe('v1');
    });

    it("a version asked for that can't play: the newest other one (offline it still plays)", () => {
      const gone = copy('v1', { downloadedAt: 1 });
      mockFiles.delete(gone.path);
      seed(gone, copy('v2', { downloadedAt: 2 }), copy('v3', { status: 'paused' }));
      expect(dl.localCopy('a1', 'm1', 'v1')?.sourceId).toBe('v2');
      expect(dl.localCopy('a1', 'm1', 'v3')?.sourceId).toBe('v2');
    });

    it('a version whose file is gone falls back to an older one', () => {
      const old = copy('v1', { downloadedAt: 1 });
      const gone = copy('v2', { downloadedAt: 2 });
      mockFiles.delete(gone.path);
      seed(old, gone);
      expect(dl.localCopy('a1', 'm1')?.sourceId).toBe('v1');
    });

    it('the saved item no longer lists the newest version: an older one plays', () => {
      seed(copy('v1', { downloadedAt: 1 }), copy('v2', { downloadedAt: 2 }));
      mockTexts.set('downloads/a1/m1/item.json', JSON.stringify({ ...savedItem, MediaSources: [{ Id: 'v1' }] }));
      expect(dl.localCopy('a1', 'm1')?.sourceId).toBe('v1');
    });

    it.each([
      ['not finished', () => seed(copy('v1', { status: 'paused' }))],
      ['another account', () => seed(copy('v1', { accountId: 'a2' }))],
      [
        'file missing',
        () => {
          const d = copy('v1');
          mockFiles.delete(d.path);
          seed(d);
        },
      ],
      [
        'file shorter than the download (cut off)',
        () => {
          const d = copy('v1');
          mockFiles.set(d.path, GB - 1);
          seed(d);
        },
      ],
      [
        'saved item missing',
        () => {
          seed(copy('v1'));
          mockFiles.delete('downloads/a1/m1/item.json');
        },
      ],
      ['nothing downloaded', () => seed()],
    ])('%s → null (streams)', (_, setup) => {
      setup();
      expect(dl.localCopy('a1', 'm1')).toBeNull();
    });
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
  it('native holds the header of signed-in accounts with downloads, sent only when it changes', async () => {
    await dl.startDownloads([movie('m1', GB)]);
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

  it("sign-out cancels the account's unfinished native tasks (their resume data holds the header)", async () => {
    dl.initDownloads();
    mockSession.accounts = [account('a1'), account('a2')];
    await dl.startDownloads([movie('m1', GB), movie('m2', GB), movie('m3', GB)]);
    mockSession.active = mockSession.accounts[1];
    await dl.startDownloads([movie('m4', GB)]);
    emit('progress', { id: 'a1:m1:m1', bytes: 10, total: GB });
    emit('done', { id: 'a1:m2:m2' });
    dl.pauseDownload('a1:m3:m3');
    native.cancel.mockClear();

    mockSession.accounts = [account('a1', true), account('a2')];
    mockSessionListeners.forEach((l) => l());
    expect(native.cancel.mock.calls).toEqual([['a1:m1:m1'], ['a1:m3:m3']]);
    expect(dl.getDownload('a1:m1:m1')).toMatchObject({ status: 'paused', reason: 'auth', bytes: 0 });
    expect(dl.getDownload('a1:m2:m2')).toMatchObject({ status: 'done' });
    expect(dl.getDownload('a1:m3:m3')).toMatchObject({ status: 'paused', reason: 'auth' });
    expect(dl.getDownload('a2:m4:m4')).toMatchObject({ status: 'queued' });

    // Signed in again: resume hands it to native from 0.
    mockSession.accounts = [account('a1'), account('a2')];
    mockSessionListeners.forEach((l) => l());
    native.enqueue.mockClear();
    dl.resumeDownload('a1:m1:m1');
    expect(native.enqueue.mock.calls[0][0]).toEqual([expect.objectContaining({ id: 'a1:m1:m1' })]);
    expect(dl.getDownload('a1:m1:m1')).toMatchObject({ status: 'queued' });
  });

  it('sign-out on Android pauses the tasks and keeps their progress (the .part holds no header)', async () => {
    const { Platform } = jest.requireActual<typeof import('react-native')>('react-native');
    const os = jest.replaceProperty(Platform, 'OS', 'android');
    try {
      dl.initDownloads();
      await dl.startDownloads([movie('m1', GB)]);
      emit('progress', { id: 'a1:m1:m1', bytes: 10, total: GB });

      mockSession.accounts = [account('a1', true)];
      mockSessionListeners.forEach((l) => l());
      expect(native.cancel).not.toHaveBeenCalled();
      expect(native.pause).toHaveBeenCalledWith('a1:m1:m1');
      expect(dl.getDownload('a1:m1:m1')).toMatchObject({ status: 'paused', reason: 'auth', bytes: 10 });
    } finally {
      os.restore();
    }
  });

  it('an account that boots signed out (token unreadable) keeps its native tasks', async () => {
    const d = { id: 'a1:m1:m1', accountId: 'a1', path: 'downloads/a1/m1/m1.mkv', status: 'downloading', total: GB };
    Storage.setItemSync('dl', JSON.stringify({ version: 1, items: [d] }));
    mockSession.accounts = [account('a1', true)];
    dl.initDownloads();
    expect(native.clearCredential).toHaveBeenCalledWith('a1');
    expect(native.cancel).not.toHaveBeenCalled();
    expect(native.pause).not.toHaveBeenCalled();
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
  it("keeps server ids from leaving their folder (no '/', no '..')", async () => {
    await dl.startDownloads([
      { item: movie('../../x').item, source: { Id: 'a/../b', Container: 'mkv', Size: GB } as MediaSourceDto },
    ]);
    const path = dl.getDownloads()[0].path;
    expect(path).toBe('downloads/a1/______x/a____b.mkv');
    expect(path.split('/').every((p) => p !== '..' && p !== '.')).toBe(true);
  });

  it('a batch native rejects ends in error instead of throwing', async () => {
    native.enqueue.mockImplementationOnce(() => {
      throw new Error('Invalid download');
    });
    expect(await dl.startDownloads([movie('m1', GB)])).toEqual({ ok: true, started: 1, skipped: 0 });
    expect(dl.getDownload('a1:m1:m1')).toMatchObject({ status: 'error', reason: 'system' });
  });

  it('a late progress event after a pause keeps it paused', async () => {
    dl.initDownloads();
    await dl.startDownloads([movie('m1', GB)]);
    dl.pauseDownload('a1:m1:m1');
    emit('progress', { id: 'a1:m1:m1', bytes: 10, total: GB });
    expect(dl.getDownload('a1:m1:m1')).toMatchObject({ status: 'paused', reason: 'user' });
  });

  it('clears the credential of an account signed out after its downloads were deleted', async () => {
    dl.initDownloads();
    await dl.startDownloads([movie('m1', GB)]);
    dl.deleteDownload('a1:m1:m1');
    mockSession.accounts = [account('a1', true)];
    mockSessionListeners.forEach((l) => l());
    expect(native.clearCredential).toHaveBeenCalledWith('a1');
  });

  it('counts live bytes of running downloads as already on disk', async () => {
    dl.initDownloads();
    mockDisk.total = 100 * GB; // margin 5 GB
    mockDisk.important = 30 * GB;
    await dl.startDownloads([movie('m1', 20 * GB)]);
    emit('progress', { id: 'a1:m1:m1', bytes: 1, total: 20 * GB });
    emit('progress', { id: 'a1:m1:m1', bytes: 19 * GB, total: 20 * GB });
    mockDisk.important = 11 * GB; // 19 GB written
    // 11 - 1 pending - 3 = 7 GB left > 5 GB
    expect((await dl.startDownloads([movie('m2', 3 * GB)])).ok).toBe(true);
  });

  it("an account switch while reading free space doesn't hand the items to the other account", async () => {
    const start = dl.startDownloads([movie('m1', GB)]);
    mockSession.accounts = [account('a1'), account('a2')];
    mockSession.active = mockSession.accounts[1];
    expect(await start).toEqual({ ok: false, problem: 'signedOut' });
    expect(native.enqueue).not.toHaveBeenCalled();
  });

  it('counts purgeable space as free (iOS important usage), Paths only as the fallback', async () => {
    // Regression: Settings showed 120 GB free, systemFreeSize far less - a 4 GB movie was refused.
    mockDisk.available = 5 * GB;
    mockDisk.important = 120 * GB;
    expect((await dl.startDownloads([movie('m1', 4 * GB)])).ok).toBe(true);
    mockDisk.important = null;
    expect(await dl.startDownloads([movie('m2', 4 * GB)])).toEqual({ ok: false, problem: 'space' });
  });

  it('a request with nothing new to start never fails on space', async () => {
    await dl.startDownloads([movie('m1', GB)]);
    mockDisk.important = GB;
    expect(await dl.startDownloads([movie('m1', GB), movie('m2')])).toEqual({ ok: true, started: 0, skipped: 2 });
  });

  it('reconcile finishes a paused download whose full file is on disk', async () => {
    await dl.startDownloads([movie('m1', GB)]);
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

  it("delete removes the item's folder with its last version", async () => {
    await dl.startDownloads([movie('m1', GB)]);
    mockFiles.set('downloads/a1/m1/m1.mkv', GB);
    dl.deleteDownload('a1:m1:m1');
    expect(mockDeletedDirs).toEqual(['downloads/a1/m1']);
  });

  it("an unreadable index doesn't cancel native tasks or get overwritten", async () => {
    Storage.setItemSync('dl', JSON.stringify({ version: 2, items: [] }));
    native.getTasks.mockResolvedValueOnce([{ id: 'a1:m1:m1', bytes: 5, total: GB, state: 'running' }]);
    await dl.reconcile();
    expect(native.cancel).not.toHaveBeenCalled();
    await dl.startDownloads([movie('m2', GB)]);
    expect(JSON.parse(Storage.getItemSync('dl') ?? '{}').version).toBe(2);
  });
});
