// SPDX-License-Identifier: GPL-3.0-or-later
// GET + in-memory cache for screens (docs/context/api.md). The cache is split by account, so one account never sees
// another's data, and an account's entries are dropped once it signs out or is removed.
import { useEffect, useState, useSyncExternalStore } from 'react';

import { ApiError, request, type Query } from '@/api';
import { onReconnect } from '@/connection';
import { connectionFor, getSession, useSession } from '@/session';

export const DEFAULT_TTL_MS = 5 * 60 * 1000;

type Entry = { data: unknown; at: number };

// accountId → `path|query` → entry.
const cache = new Map<string, Map<string, Entry>>();

/** Drops entries of accounts that are gone or signed out (incl. a global 401). Runs before every fetch. */
function prune() {
  const signedIn = new Set(
    getSession()
      .accounts.filter((a) => !a.signedOut)
      .map((a) => a.id),
  );
  for (const id of cache.keys()) if (!signedIn.has(id)) cache.delete(id);
}

type Inflight = { promise: Promise<void>; controller: AbortController; users: number };
const inflight = new Map<string, Inflight>();

// Version per `accountId|path|query`, bumped when that entry is refreshed, invalidated or rewritten. Each hook
// watches only its own key, so a refresh elsewhere never restarts or clears an unrelated request.
const versions = new Map<string, number>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function bump(keys: string[]) {
  if (keys.length === 0) return;
  for (const key of keys) versions.set(key, (versions.get(key) ?? 0) + 1);
  listeners.forEach((l) => l());
}

/** Query as a stable string (sorted, undefined dropped) - part of the cache key and the effect deps. */
function serializeQuery(query?: Query): string {
  if (!query) return '';
  const entries = Object.entries(query).filter(([, v]) => v !== undefined);
  return entries.length ? JSON.stringify(entries.sort(([a], [b]) => (a < b ? -1 : 1))) : '';
}

function isFresh(entry: Entry | undefined, ttl: number): entry is Entry {
  return entry !== undefined && Date.now() - entry.at < ttl;
}

// Mounted hooks per `accountId|path|query`. Lets `invalidate` retry a hook whose request failed - it has no cache
// entry to mark stale. Account ids have no `|`, so the path starts after the first one.
const mounted = new Map<string, number>();

/**
 * Marks cached responses whose path starts with `pathPrefix` (all when omitted) stale, for every account. Mounted
 * `useFetch` hooks for those paths refetch (failed ones too) and keep showing the old data meanwhile.
 */
export function invalidate(pathPrefix = '') {
  for (const entries of cache.values()) {
    for (const [pathKey, entry] of entries) if (pathKey.startsWith(pathPrefix)) entry.at = 0;
  }
  restart([...mounted.keys()].filter((key) => key.slice(key.indexOf('|') + 1).startsWith(pathPrefix)));
}

// Keys whose last request failed (not aborted), until one answers.
const failed = new Set<string>();

/** Back online (`src/connection.ts`): mounted hooks whose request failed fetch again; the rest keep their data. */
export function retryFailed() {
  // A request still running (a Retry that brought the connection back) isn't sent twice.
  restart([...failed].filter((key) => mounted.has(key) && !inflight.has(key)));
}
onReconnect(retryFailed);

/** New requests for these keys: a running one may answer from before a change, so it is no longer joined or cached. */
function restart(keys: string[]) {
  for (const key of keys) inflight.delete(key);
  bump(keys);
}

/**
 * Rewrites an account's cached responses in place (optimistic updates): `change` returns the new data, or undefined to
 * leave a response as it is. Hooks on changed responses re-render; freshness is kept, so nothing refetches. Paged
 * lists (`onCacheUpdate`) get the same change.
 */
export function updateCached(accountId: string, change: (data: unknown) => unknown) {
  const keys: string[] = [];
  for (const [pathKey, entry] of cache.get(accountId) ?? []) {
    const next = change(entry.data);
    if (next === undefined) continue;
    entry.data = next;
    keys.push(`${accountId}|${pathKey}`);
  }
  bump(keys);
  cacheListeners.forEach((l) => l(accountId, change));
}

type CacheListener = (accountId: string, change: (data: unknown) => unknown) => void;
const cacheListeners = new Set<CacheListener>();

/** Lists that keep their own items outside this cache (paged lists) get every `updateCached` change too. */
export function onCacheUpdate(listener: CacheListener): () => void {
  cacheListeners.add(listener);
  return () => cacheListeners.delete(listener);
}

export type FetchOptions = {
  query?: Query;
  /** How long a cached response is shown without refetching. */
  ttl?: number;
};

export type FetchResult<T> = {
  /** Last good response for this account + path; kept while refetching and after an error. */
  data: T | undefined;
  /** Failure of the last request (`ApiError`); cleared by the next request. */
  error: ApiError | undefined;
  /** A request is running. Show a spinner only when there's no `data` yet. */
  loading: boolean;
  /** Refetch now, ignoring the TTL (pull to refresh). */
  refresh: () => void;
};

/**
 * GET `path` as the active account. `path = null` (or signed out) → idle. A fresh cached response is returned without
 * a request; otherwise the hook fetches, keeping any older data on screen. Unmount, account switch or a new path
 * aborts the running request and its result is dropped.
 */
export function useFetch<T>(path: string | null, { query, ttl = DEFAULT_TTL_MS }: FetchOptions = {}): FetchResult<T> {
  const { active } = useSession();
  const accountId = active && connectionFor(active) ? active.id : null;
  const queryKey = serializeQuery(query);
  const pathKey = path === null ? null : `${path}|${queryKey}`;
  const key = accountId && pathKey !== null ? `${accountId}|${pathKey}` : null;
  const version = useSyncExternalStore(subscribe, () => (key ? (versions.get(key) ?? 0) : 0));
  // Settled request: its id, and the error if it failed (data always comes from the cache).
  const [settled, setSettled] = useState<{ id: string; error: ApiError | undefined }>();
  const id = `${key}#${version}`;
  const entry = accountId && pathKey !== null ? cache.get(accountId)?.get(pathKey) : undefined;

  useEffect(() => {
    if (!key) return;
    mounted.set(key, (mounted.get(key) ?? 0) + 1);
    return () => {
      const hooks = (mounted.get(key) ?? 1) - 1;
      if (hooks > 0) mounted.set(key, hooks);
      else {
        mounted.delete(key);
        failed.delete(key); // nobody left to retry it for
      }
    };
  }, [key]);

  useEffect(() => {
    prune();
    if (!key || !accountId || path === null || pathKey === null || isFresh(cache.get(accountId)?.get(pathKey), ttl)) {
      return;
    }
    const account = getSession().active;
    const conn = account?.id === accountId ? connectionFor(account) : null;
    if (!account || !conn) return;

    // One request per key, shared by every hook that needs it; aborted when the last one leaves.
    let shared = inflight.get(key);
    if (!shared) {
      const controller = new AbortController();
      const q = queryKey
        ? (Object.fromEntries(JSON.parse(queryKey) as [string, string | number | boolean][]) as Query)
        : undefined;
      const promise = request<unknown>(conn, path, { query: q, signal: controller.signal }).then((data) => {
        // Superseded by invalidate / refresh: its answer may predate a change.
        if (inflight.get(key) !== shared) return;
        inflight.delete(key);
        failed.delete(key);
        // Signed out meanwhile: don't cache for it.
        if (!connectionFor(account)) return;
        const entries = cache.get(accountId) ?? new Map<string, Entry>();
        entries.set(pathKey, { data, at: Date.now() });
        cache.set(accountId, entries);
        bump([key]); // Every hook on this key shows the new data.
      });
      promise.catch((e: unknown) => {
        if (inflight.get(key) !== shared) return; // superseded: its replacement decides
        inflight.delete(key);
        // Only what the connection broke: a 404 / 5xx / bad answer isn't fixed by being back online.
        if (e instanceof ApiError && e.kind === 'network') failed.add(key);
        else failed.delete(key);
      });
      shared = { promise, controller, users: 0 };
      inflight.set(key, shared);
    }
    const mine = shared;
    mine.users++;
    let left = false;
    mine.promise.then(
      () => !left && setSettled({ id, error: undefined }),
      (e: unknown) => !left && setSettled({ id, error: e instanceof ApiError ? e : new ApiError('network') }),
    );
    return () => {
      left = true;
      if (--mine.users > 0) return;
      mine.controller.abort();
      if (inflight.get(key) === mine) inflight.delete(key);
    };
  }, [id, key, accountId, path, pathKey, queryKey, ttl]);

  const refresh = () => {
    if (!key || !accountId || pathKey === null) return;
    const current = cache.get(accountId)?.get(pathKey);
    if (current) current.at = 0;
    restart([key]);
  };

  const done = settled?.id === id;
  return {
    data: entry?.data as T | undefined,
    error: done ? settled.error : undefined,
    loading: accountId !== null && pathKey !== null && !done && !isFresh(entry, ttl),
    refresh,
  };
}
