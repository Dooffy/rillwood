// SPDX-License-Identifier: GPL-3.0-or-later
// Downloads store (docs/context/downloads.md): the `dl` index in kv-store, mirrored from the native downloader
// (modules/downloads - the only file that imports it). Native owns the queue; this keeps what the UI shows and
// re-sends what native lost (reconcile). Read once (sync) on first use, then served from memory.
import { Directory, File, Paths } from 'expo-file-system';
import { Storage } from 'expo-sqlite/kv-store';
import { useCallback, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import Downloads, { type EnqueueItem, type Task } from '../modules/downloads';
import { authHeader, type BaseItemDto, type MediaSourceDto } from '@/api';
import { connectionFor, getSession, subscribeSession, type Account } from '@/session';

export type DownloadStatus = 'queued' | 'downloading' | 'paused' | 'done' | 'error';

export type Download = {
  /** `account:item:source` */
  id: string;
  accountId: string;
  itemId: string;
  sourceId: string;
  title: string;
  seriesId?: string;
  /** Relative to `Paths.document`. */
  path: string;
  status: DownloadStatus;
  reason?: Task['reason'];
  bytes: number;
  total: number;
  createdAt: number;
  downloadedAt?: number;
  pinned: boolean;
};

export type DownloadRequest = { item: BaseItemDto; source: MediaSourceDto };

export type StartResult =
  { ok: true; started: number; skipped: number } | { ok: false; problem: 'signedOut' | 'space' };

const KEY = 'dl';
const VERSION = 1;
const GB = 1024 ** 3;
// Wi-Fi only until the network setting lands (its own M5 task).
const CELLULAR = false;

let index: Map<string, Download> | undefined;
// The same array between changes (useSyncExternalStore); rebuilt on save.
let list: readonly Download[] = [];
let dirty = false;
let batching = false;
// False when a saved index exists but can't be read (bad JSON, newer version): it isn't overwritten and native tasks
// aren't cancelled as unknown.
let readable = true;
const listListeners = new Set<() => void>();
const itemListeners = new Map<string, Set<() => void>>();

function store(): Map<string, Download> {
  if (!index) {
    index = new Map();
    const raw = Storage.getItemSync(KEY);
    try {
      const saved = JSON.parse(raw ?? 'null') as { version: number; items: Download[] } | null;
      // Migrations go here when VERSION moves on.
      if (saved?.version === VERSION) index = new Map(saved.items.map((d) => [d.id, d]));
      else readable = raw === null;
    } catch {
      readable = false;
    }
    list = [...index.values()];
  }
  return index;
}

/** Writes the index and re-renders lists - once per batch. */
function save() {
  if (!dirty || batching) return;
  dirty = false;
  list = [...store().values()];
  if (readable) Storage.setItemSync(KEY, JSON.stringify({ version: VERSION, items: list }));
  listListeners.forEach((l) => l());
}

function batch(fn: () => void) {
  batching = true;
  try {
    fn();
  } finally {
    batching = false;
    save();
  }
}

/** Structural changes (status, reason) are saved; progress only re-renders that item. */
function patch(id: string, fields: Partial<Download>) {
  const items = store();
  const old = items.get(id);
  if (!old) return;
  const next = { ...old, ...fields };
  if (Object.keys(fields).every((k) => next[k as keyof Download] === old[k as keyof Download])) return;
  items.set(id, next);
  if (next.status !== old.status || next.reason !== old.reason) {
    dirty = true;
    save();
  }
  itemListeners.get(id)?.forEach((l) => l());
}

function put(downloads: Download[]) {
  const items = store();
  for (const d of downloads) items.set(d.id, d);
  dirty = true;
  save();
  downloads.forEach((d) => itemListeners.get(d.id)?.forEach((l) => l()));
}

function remove(id: string) {
  if (!store().delete(id)) return;
  dirty = true;
  save();
  itemListeners.get(id)?.forEach((l) => l());
}

export const downloadId = (accountId: string, itemId: string, sourceId: string) => `${accountId}:${itemId}:${sourceId}`;

export function getDownloads(): readonly Download[] {
  store();
  return list;
}

export function getDownload(id: string): Download | null {
  return store().get(id) ?? null;
}

/** Container's first name as the extension (`mkv`, `mp4`); mpv doesn't need it, file managers do. */
function extension(source: MediaSourceDto): string {
  const ext = source.Container?.split(',')[0]
    ?.toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  return ext || 'bin';
}

// Header native holds per account (null = cleared); native is told only about changes.
const sentCredentials = new Map<string, string | null>();

/** Server ids as one path segment: nothing but letters, digits, `_`, `-` (no `/`, no `..`). */
const segment = (id: string) => id.replace(/[^A-Za-z0-9_-]/g, '_');

function syncCredential(accountId: string, account: Account | undefined) {
  const conn = account && connectionFor(account);
  const header = conn ? authHeader(conn) : null;
  if (sentCredentials.get(accountId) === header) return;
  sentCredentials.set(accountId, header);
  if (header) Downloads.setCredential(accountId, { Authorization: header });
  else Downloads.clearCredential(accountId);
}

/** Native holds the header of every signed-in account with downloads, none for signed-out / removed ones. */
function syncCredentials() {
  const accounts = getSession().accounts;
  const ids = new Set([...getDownloads().map((d) => d.accountId), ...sentCredentials.keys()]);
  for (const accountId of ids) {
    syncCredential(
      accountId,
      accounts.find((a) => a.id === accountId),
    );
  }
}

/** Hands downloads to native, one batch per account (a season = one call). Signed-out accounts wait for sign-in. */
function send(downloads: Download[]) {
  const accounts = getSession().accounts;
  const byAccount = new Map<string, Download[]>();
  for (const d of downloads) {
    const group = byAccount.get(d.accountId);
    if (group) group.push(d);
    else byAccount.set(d.accountId, [d]);
  }
  batch(() => {
    for (const [accountId, group] of byAccount) {
      const account = accounts.find((a) => a.id === accountId);
      const conn = account && connectionFor(account);
      if (!conn) {
        group.forEach((d) => patch(d.id, { status: 'paused', reason: 'auth' }));
        continue;
      }
      syncCredential(accountId, account);
      // Alternate versions are items of their own: the source id downloads that version.
      const items: EnqueueItem[] = group.map((d) => ({
        id: d.id,
        accountId,
        url: `${conn.baseUrl}/Items/${encodeURIComponent(d.sourceId)}/Download`,
        dest: d.path,
        size: d.total,
      }));
      try {
        Downloads.enqueue(items, { cellular: CELLULAR });
      } catch {
        // Native rejected the batch (dest, url or size) - nothing of it was queued.
        group.forEach((d) => patch(d.id, { status: 'error', reason: 'system' }));
      }
    }
  });
}

/** Space left after everything queued has finished must stay above max(2 GB, 5% of the disk). */
function hasSpace(bytes: number): boolean {
  let pending = 0;
  // The index, not `list`: live bytes.
  for (const d of store().values()) if (d.status !== 'done') pending += Math.max(0, d.total - d.bytes);
  return Paths.availableDiskSpace - pending - bytes > Math.max(2 * GB, 0.05 * Paths.totalDiskSpace);
}

/**
 * Downloads items (a movie, an episode, a season) for the active account as one batch. Items already downloaded or
 * queued, and sources without a size (can't be checked when done), are skipped.
 */
export function startDownloads(requests: DownloadRequest[]): StartResult {
  const account = getSession().active;
  if (!account || !connectionFor(account)) return { ok: false, problem: 'signedOut' };
  const now = Date.now();
  const fresh = new Map<string, Download>();
  for (const { item, source } of requests) {
    const id = downloadId(account.id, item.Id, source.Id);
    if (!source.Size || store().has(id) || fresh.has(id)) continue;
    fresh.set(id, {
      id,
      accountId: account.id,
      itemId: item.Id,
      sourceId: source.Id,
      title: item.Name,
      seriesId: item.SeriesId,
      path: `downloads/${segment(account.id)}/${segment(item.Id)}/${segment(source.Id)}.${extension(source)}`,
      status: 'queued',
      bytes: 0,
      total: source.Size,
      createdAt: now,
      pinned: false,
    });
  }
  const downloads = [...fresh.values()];
  if (downloads.length > 0) {
    if (!hasSpace(downloads.reduce((sum, d) => sum + d.total, 0))) return { ok: false, problem: 'space' };
    put(downloads);
    send(downloads);
  }
  return { ok: true, started: downloads.length, skipped: requests.length - downloads.length };
}

export function pauseDownload(id: string) {
  const d = getDownload(id);
  if (!d || (d.status !== 'queued' && d.status !== 'downloading')) return;
  Downloads.pause(id);
  patch(id, { status: 'paused', reason: 'user' });
}

/** Also after a sign-in again (paused for auth) or an error. Native skips the enqueue if it still has the task. */
export function resumeDownload(id: string) {
  const d = getDownload(id);
  if (!d || (d.status !== 'paused' && d.status !== 'error')) return;
  batch(() => {
    patch(id, { status: 'queued', reason: undefined });
    send([d]);
  });
  if (getDownload(id)?.status === 'queued') Downloads.resume(id);
}

/** Stops it and deletes the file (or the partial data). */
export function deleteDownload(id: string) {
  const d = getDownload(id);
  if (!d) return;
  Downloads.cancel(id);
  try {
    const file = new File(Paths.document, d.path);
    if (file.exists) file.delete();
    // The item's folder once its last version is gone.
    const dir = new Directory(Paths.document, d.path.slice(0, d.path.lastIndexOf('/')));
    if (dir.exists && dir.list().length === 0) dir.delete();
  } catch {}
  remove(id);
}

const STATUS: Record<Task['state'], DownloadStatus> = {
  queued: 'queued',
  running: 'downloading',
  waiting: 'downloading',
  paused: 'paused',
  done: 'done',
  error: 'error',
};

function isComplete(d: Download): boolean {
  try {
    const file = new File(Paths.document, d.path);
    return file.exists && file.size === d.total;
  } catch {
    return false;
  }
}

let reconciling: Promise<void> | null = null;

/**
 * Launch + back from the background: mirror native state, finish downloads that completed while JS wasn't running,
 * re-send what native lost (reinstall, unreadable state), cancel native tasks the index doesn't know.
 */
export function reconcile(): Promise<void> {
  reconciling ??= run().finally(() => {
    reconciling = null;
  });
  return reconciling;
}

async function run() {
  let tasks: Task[];
  try {
    tasks = await Downloads.getTasks();
  } catch {
    return;
  }
  const items = store();
  const native = new Map(tasks.map((t) => [t.id, t]));
  if (readable) for (const t of tasks) if (!items.has(t.id)) Downloads.cancel(t.id);

  const lost: Download[] = [];
  batch(() => {
    for (const d of getDownloads()) {
      if (d.status === 'done') continue;
      const t = native.get(d.id);
      if (t) {
        patch(d.id, { status: STATUS[t.state], reason: t.reason, bytes: t.bytes });
      } else if (isComplete(d)) {
        // Finished while JS wasn't running (also just before a pause landed).
        patch(d.id, { status: 'done', reason: undefined, bytes: d.total, downloadedAt: Date.now() });
      } else if (d.status === 'queued' || d.status === 'downloading') {
        lost.push(d); // paused / failed without a native task wait for resume
      }
    }
  });
  if (lost.length > 0) send(lost);
}

let started = false;

/** Once, from the root layout: native events, native credentials, reconcile at launch and back from the background. */
export function initDownloads() {
  if (started) return;
  started = true;
  Downloads.addListener('progress', ({ id, bytes }) => {
    // A late event from before a pause doesn't bring it back.
    const status = getDownload(id)?.status;
    if (status === 'queued' || status === 'downloading') patch(id, { bytes, status: 'downloading' });
  });
  Downloads.addListener('done', ({ id }) => {
    const d = getDownload(id);
    if (d) patch(id, { status: 'done', reason: undefined, bytes: d.total, downloadedAt: Date.now() });
  });
  Downloads.addListener('error', ({ id, state, reason }) => patch(id, { status: STATUS[state], reason }));

  syncCredentials();
  subscribeSession(syncCredentials);

  void reconcile();
  // Back from the background (also via inactive), not after a quick switch (Control Center, notification shade).
  let wasBackground = false;
  AppState.addEventListener('change', (next) => {
    if (next === 'background') wasBackground = true;
    if (next === 'active' && wasBackground) {
      wasBackground = false;
      void reconcile();
    }
  });
}

function subscribeList(listener: () => void) {
  listListeners.add(listener);
  return () => listListeners.delete(listener);
}

/** Every download (structure: added, removed, status). Rows read live progress with `useDownload`. */
export function useDownloadList(): readonly Download[] {
  return useSyncExternalStore(subscribeList, getDownloads);
}

/** One download, with live progress; null when there is none. */
export function useDownload(id: string | null): Download | null {
  const subscribe = useCallback(
    (listener: () => void) => {
      if (!id) return () => {};
      const set = itemListeners.get(id) ?? new Set();
      itemListeners.set(id, set.add(listener));
      return () => {
        set.delete(listener);
        if (set.size === 0) itemListeners.delete(id);
      };
    },
    [id],
  );
  return useSyncExternalStore(subscribe, () => (id ? getDownload(id) : null));
}
