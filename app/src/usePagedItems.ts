// SPDX-License-Identifier: GPL-3.0-or-later
// Paged item lists for the active account (Library grid / one type's search results): first page on mount, more on demand
// (docs/context/api.md, Library data). Own hook rather than useFetch: pages accumulate into one list, and a new query
// or account starts over. Not tied to useFetch's invalidate(): lists refresh on pull to refresh (or a new query).
import { useEffect, useEffectEvent, useRef, useState } from 'react';

import { ApiError, request, type BaseItemDto, type Endpoint, type ItemsResult } from '@/api';
import { mergePage, nextPageStart } from '@/items';
import { connectionFor, useSession } from '@/session';

type PageState = {
  /** `accountId|list id` the state belongs to; anything else is stale. */
  key: string;
  items: BaseItemDto[];
  /** Server total; undefined until the first page answers. */
  total?: number;
  /** Server items fetched so far = where the next page starts. */
  offset: number;
  error?: ApiError;
  /** Start index of the request that failed (0 = a refresh / first page), for `retry`. */
  failedAt?: number;
  /** A page request is running. */
  loading: boolean;
};

const empty = (key: string, loading = true): PageState => ({ key, items: [], offset: 0, loading });

export type PagedItems = {
  items: BaseItemDto[];
  total?: number;
  /** Failure of the last page request; older items stay. */
  error?: ApiError;
  loading: boolean;
  /** More pages on the server. */
  hasMore: boolean;
  /** Next page (end of the grid); no-op while loading, after an error (use `retry`) or when everything is loaded. */
  loadMore: () => void;
  /** From the first page again (pull to refresh); items stay until it answers. */
  refresh: () => void;
  /** Repeats the request that failed: a refresh or first page again, else the next page. */
  retry: () => void;
};

/**
 * Pages of `pageAt(startIndex)` for the active account. `id` names the list (its query): a new id starts over; `null`
 * = idle (nothing to show yet).
 */
export function usePagedItems(id: string | null, pageAt: (startIndex: number) => Endpoint): PagedItems {
  const { active } = useSession();
  const signedIn = active ? connectionFor(active) : null;
  const conn = id === null ? null : signedIn;
  // Signed out (no token) or no list: idle, not loading - nothing will be requested.
  const key = `${conn ? active?.id : ''}|${id ?? ''}`;
  const [state, setState] = useState<PageState>(() => empty(key, !!conn));
  const live = state.key === key ? state : empty(key, !!conn);
  const controller = useRef<AbortController | null>(null);

  // One request at a time: a new one (new query, refresh) aborts the last.
  const load = (startIndex: number) => {
    if (!conn) return;
    controller.current?.abort();
    const ctrl = new AbortController();
    controller.current = ctrl;
    const endpoint = pageAt(startIndex);
    request<ItemsResult>(conn, endpoint.path, { query: endpoint.query, signal: ctrl.signal }).then(
      (page) =>
        setState((s) => ({
          key,
          items: mergePage(s.key === key && startIndex > 0 ? s.items : [], page.Items),
          // An empty page means the end, whatever the total says (hidden or removed items): stop asking.
          total: page.Items.length === 0 ? startIndex : page.TotalRecordCount,
          offset: startIndex + page.Items.length,
          loading: false,
        })),
      (e: unknown) => {
        if (e instanceof ApiError && e.kind === 'aborted') return;
        setState((s) => ({
          ...(s.key === key ? s : empty(key)),
          error: e instanceof ApiError ? e : new ApiError('network'),
          failedAt: startIndex,
          loading: false,
        }));
      },
    );
  };

  const start = useEffectEvent(() => load(0));
  useEffect(() => {
    start();
    return () => controller.current?.abort();
  }, [key]);

  const next = nextPageStart(live.offset, live.total);
  const loadNext = () => {
    if (!conn || live.loading || next === undefined) return;
    setState({ ...live, loading: true, error: undefined, failedAt: undefined });
    load(next);
  };
  // While an error shows, only Retry / refresh / a new query load again: the end of a list re-fires onEndReached
  // when the footer changes size, which would retry a failing page in a loop.
  const loadMore = () => {
    if (!live.error) loadNext();
  };
  const refresh = () => {
    if (!conn) return;
    setState({ ...live, loading: true, error: undefined, failedAt: undefined });
    load(0);
  };
  return {
    items: live.items,
    total: live.total,
    error: live.error,
    loading: live.loading,
    hasMore: next !== undefined,
    loadMore,
    refresh,
    retry: () => (live.failedAt === 0 ? refresh() : loadNext()),
  };
}
