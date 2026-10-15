// SPDX-License-Identifier: GPL-3.0-or-later
// Offline progress (docs/context/sync.md): playback the server didn't hear about (offline, or a report failed to reach
// it) is kept per account + item in the `sync` queue in kv-store, with the server's resume rules applied. Replayed for
// the active account at launch, back from the background, on reconnect and on an account switch: GET UserData, a
// newer server `LastPlayedDate` wins, else `UserPlayedItems?datePlayed=` / `UserData`. Then the saved items of the
// account's downloads take the server's UserData (offline detail). Read once (sync) on first use.
import { Storage } from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import {
  ApiError,
  getItemsById,
  getUserData,
  isOffline,
  setPlayed,
  updateUserData,
  type BaseItemDto,
  type Connection,
} from '@/api';
import { onReconnect } from '@/connection';
import { writeSnapshotUserData } from '@/downloadSnapshot';
import { getDownloads } from '@/downloads';
import { TICKS_PER_SECOND } from '@/items';
import { connectionFor, getSession, subscribeSession } from '@/session';
import { invalidate } from '@/useFetch';

export type PendingProgress = {
  accountId: string;
  itemId: string;
  /** After the resume rules: 0 below 5% and once watched. */
  positionTicks: number;
  /** Session start, ISO UTC - the server stamps `LastPlayedDate` at `Playing` too. */
  lastPlayedAt: string;
  /** Kept once set while pending: a rewatch below 90% leaves it watched, as online. */
  watched: boolean;
};

const KEY = 'sync';
const VERSION = 1;

// Server defaults (docs/research/jellyfin-api.md §4) - the real values are admin-only, so these are hardcoded.
const MIN_RESUME = 0.05;
const MAX_RESUME = 0.9;
const MIN_RESUME_SECONDS = 300;
/** A server `LastPlayedDate` this close to the session start is the same session (clock skew; started online). */
export const SAME_SESSION_MS = 60_000;
/** Ids per `/Items?ids=` request (URL length). */
const PULL_CHUNK = 100;
/** Saved UserData is pulled again after this, or at once when the replay sent something. */
export const PULL_EVERY_MS = 10 * 60_000;
// Last pull per account (this run of the app).
const pulledAt = new Map<string, number>();

/** The next run pulls the account's saved UserData whatever the 10 min (the player closed: watched state for offload). */
export function pullNextRun(accountId: string) {
  pulledAt.delete(accountId);
}

let queue: Map<string, PendingProgress> | undefined;
// False when a saved queue exists but can't be read: it isn't overwritten.
let readable = true;
const listeners = new Set<() => void>();

const keyOf = (accountId: string, itemId: string) => `${accountId}:${itemId}`;

function pending(): Map<string, PendingProgress> {
  if (!queue) {
    queue = new Map();
    const raw = Storage.getItemSync(KEY);
    try {
      const saved = JSON.parse(raw ?? 'null') as { version: number; items: PendingProgress[] } | null;
      if (saved?.version === VERSION) queue = new Map(saved.items.map((p) => [keyOf(p.accountId, p.itemId), p]));
      else readable = raw === null;
    } catch {
      readable = false;
    }
  }
  return queue;
}

function save() {
  if (readable) Storage.setItemSync(KEY, JSON.stringify({ version: VERSION, items: [...pending().values()] }));
  listeners.forEach((l) => l());
}

function remove(entries: PendingProgress[]) {
  entries.forEach((p) => pending().delete(keyOf(p.accountId, p.itemId)));
  save();
}

/** The server's resume rules, applied offline: < 5% → 0, ≥ 90% → watched, items < 5 min are watched from 5%. */
export function resumeRules(positionTicks: number, runtimeTicks: number): { positionTicks: number; watched: boolean } {
  const position = Math.max(0, positionTicks);
  if (!(runtimeTicks > 0)) return { positionTicks: position, watched: false };
  const share = position / runtimeTicks;
  if (share < MIN_RESUME) return { positionTicks: 0, watched: false };
  if (share >= MAX_RESUME || runtimeTicks < MIN_RESUME_SECONDS * TICKS_PER_SECOND)
    return { positionTicks: 0, watched: true };
  return { positionTicks: position, watched: false };
}

/** Progress the server didn't get. `runtimeTicks` 0 when unknown (position kept as is). */
export function recordProgress(p: {
  accountId: string;
  itemId: string;
  positionTicks: number;
  runtimeTicks: number;
  startedAt: string;
}) {
  const key = keyOf(p.accountId, p.itemId);
  const old = pending().get(key);
  const rule = resumeRules(p.positionTicks, p.runtimeTicks);
  const next: PendingProgress = {
    accountId: p.accountId,
    itemId: p.itemId,
    positionTicks: rule.positionTicks,
    lastPlayedAt: p.startedAt,
    watched: rule.watched || old?.watched === true,
  };
  // Same fields, same order (built above): nothing to save.
  if (old && JSON.stringify(old) === JSON.stringify(next)) return;
  pending().set(key, next);
  save();
}

/**
 * The server heard a later report of the session started at `startedAt`: its own record is newer. Kept when watched -
 * that may come from an earlier session the server hasn't got.
 */
export function clearProgress(accountId: string, itemId: string, startedAt: string) {
  const p = pending().get(keyOf(accountId, itemId));
  if (p && p.lastPlayedAt === startedAt && !p.watched) remove([p]);
}

export function getPendingProgress(accountId: string, itemId: string): PendingProgress | null {
  return pending().get(keyOf(accountId, itemId)) ?? null;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePendingProgress(accountId: string | undefined, itemId: string | undefined) {
  return useSyncExternalStore(subscribe, () => (accountId && itemId ? getPendingProgress(accountId, itemId) : null));
}

/** The item with the progress not yet synced on top - what the server will have after the replay. */
export function withPendingProgress(item: BaseItemDto, p: PendingProgress | null): BaseItemDto {
  if (!p) return item;
  return {
    ...item,
    UserData: {
      ...item.UserData,
      PlaybackPositionTicks: p.positionTicks,
      Played: p.watched || item.UserData?.Played === true,
      LastPlayedDate: p.lastPlayedAt,
    },
  };
}

/** Unless a newer record (a session meanwhile) replaced it - that one stays for the next run. */
function drop(p: PendingProgress) {
  if (pending().get(keyOf(p.accountId, p.itemId)) === p) remove([p]);
}

type Outcome = 'done' | 'keep' | 'stop';

async function replay(conn: Connection, p: PendingProgress): Promise<Outcome> {
  try {
    const server = await getUserData(conn, p.itemId);
    // Changed while asking (the session went on, or the server heard a later report): the next run takes it.
    if (pending().get(keyOf(p.accountId, p.itemId)) !== p) return 'keep';
    const serverAt = server.LastPlayedDate ? Date.parse(server.LastPlayedDate) : NaN;
    // Last writer wins: played elsewhere after this session started → the server's state stands.
    if (serverAt > Date.parse(p.lastPlayedAt) + SAME_SESSION_MS) return 'done';
    if (p.watched) await setPlayed(conn, p.itemId, true, p.lastPlayedAt);
    // Watched → the resume point of a rewatch on top (as online: Played stays, the position is kept).
    if (!p.watched || p.positionTicks > 0) {
      await updateUserData(conn, p.itemId, { PlaybackPositionTicks: p.positionTicks, LastPlayedDate: p.lastPlayedAt });
    }
    return 'done';
  } catch (e) {
    // Offline again or signed out (401): the rest waits. Another 4xx (item gone: 404) won't change - dropped. A
    // server error or an answer that isn't JSON (a proxy page): kept, the rest goes on.
    if (e instanceof ApiError && (e.kind === 'network' || e.kind === 'aborted' || e.status === 401)) return 'stop';
    return e instanceof ApiError && e.kind === 'http' && (e.status ?? 500) < 500 ? 'done' : 'keep';
  }
}

/** The server's UserData into the saved items of the account's downloads (one file per item folder). */
async function pull(conn: Connection, accountId: string) {
  const paths = new Map<string, string>();
  for (const d of getDownloads()) if (d.accountId === accountId && !paths.has(d.itemId)) paths.set(d.itemId, d.path);
  const ids = [...paths.keys()];
  for (let i = 0; i < ids.length; i += PULL_CHUNK) {
    const { Items } = await getItemsById(conn, ids.slice(i, i + PULL_CHUNK));
    await Promise.all(
      Items.map((item) => {
        const path = paths.get(item.Id);
        return path && item.UserData ? writeSnapshotUserData(path, item.UserData).catch(() => {}) : undefined;
      }),
    );
  }
}

async function syncOnce() {
  const account = getSession().active;
  const conn = account ? connectionFor(account) : null;
  if (!account || !conn || isOffline()) return;
  const own = [...pending().values()]
    .filter((p) => p.accountId === account.id)
    .sort((a, b) => a.lastPlayedAt.localeCompare(b.lastPlayedAt));
  let sent = false;
  for (const p of own) {
    const outcome = await replay(conn, p);
    if (outcome === 'stop') return;
    if (outcome === 'done') {
      drop(p);
      sent = true;
    }
  }
  // Resume points, Continue Watching, Next Up.
  if (sent) invalidate();
  if (!sent && Date.now() - (pulledAt.get(account.id) ?? -Infinity) < PULL_EVERY_MS) return;
  await pull(conn, account.id)
    .then(() => pulledAt.set(account.id, Date.now()))
    .catch(() => {});
}

let running: Promise<void> | null = null;
let again = false;
const syncedListeners = new Set<() => void>();

/** After every run (also one skipped offline or signed out): saved UserData is as fresh as it gets (offload). */
export function onSynced(listener: () => void) {
  syncedListeners.add(listener);
  return () => syncedListeners.delete(listener);
}

/** Replays the active account's queue, then pulls UserData into its downloads. One run at a time; a call meanwhile runs again after. */
export function syncProgress(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    do {
      again = false;
      await syncOnce();
    } while (again);
  })().finally(() => {
    running = null;
    syncedListeners.forEach((l) => l());
  });
  return running;
}

let started = false;

/** Once, from the root layout. */
export function initSync() {
  if (started) return;
  started = true;
  onReconnect(() => void syncProgress());

  // Back from the background (also via inactive), not after a quick switch.
  let wasBackground = AppState.currentState === 'background';
  AppState.addEventListener('change', (next) => {
    if (next === 'background') wasBackground = true;
    if (next === 'active' && wasBackground) {
      wasBackground = false;
      void syncProgress();
    }
  });

  // Another active account: its queue. A removed account: its queue goes too.
  let active = getSession().active?.id;
  subscribeSession(() => {
    const { accounts, active: now } = getSession();
    const gone = [...pending().values()].filter((p) => !accounts.some((a) => a.id === p.accountId));
    if (gone.length > 0) remove(gone);
    if (now?.id === active) return;
    active = now?.id;
    void syncProgress();
  });

  if (!wasBackground) void syncProgress();
}
