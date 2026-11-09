// SPDX-License-Identifier: GPL-3.0-or-later
// Home data for both views (`PhoneHome`, `TvHome`): the top rows' fetches, the layout and the offline state
// (docs/context/api.md, Home data).
import { useCallback, useState } from 'react';

import { isConnectionError, type ItemsResult } from '@/api';
import { useHeldOffline } from '@/components/Message';
import { continueWatching, homeLayout, homePaths, nextUp, userViews } from '@/items';
import { useSession } from '@/session';
import { invalidate, useFetch } from '@/useFetch';

/** Pull to refresh / Retry: refetch every Home row, failed ones too. */
export function refreshHome() {
  homePaths.forEach((path) => invalidate(path));
}

export type HomeState = ReturnType<typeof useHome>;

export function useHome() {
  const { active } = useSession();
  const views = useFetch<ItemsResult>(userViews.path, { query: userViews.query });
  const resume = useFetch<ItemsResult>(continueWatching.path, { query: continueWatching.query });
  const next = useFetch<ItemsResult>(nextUp.path, { query: nextUp.query });

  // Items per library once its Recently Added row loaded (for the empty message), per account.
  const [latestCounts, setLatestCounts] = useState<Record<string, number>>({});
  const countKey = (libraryId: string) => `${active?.id}|${libraryId}`;
  const onLatestCount = useCallback(
    (key: string, count: number) =>
      setLatestCounts((counts) => (counts[key] === count ? counts : { ...counts, [key]: count })),
    [],
  );

  // Pull to refresh: the spinner stays until the top rows answered.
  const loading = views.loading || resume.loading || next.loading;

  const layout = homeLayout(
    views,
    resume,
    next,
    Object.fromEntries((views.data?.Items ?? []).map((v) => [v.Id, latestCounts[countKey(v.Id)]])),
  );
  // Out of reach: Continue Watching and Next Up both failed for lack of a connection. Nothing else loaded (no library
  // list) → the card alone; else the card on top of what did load (a cached Recently Added row).
  const offline = useHeldOffline(
    [resume, next].every((r) => !r.data && isConnectionError(r.error)),
    loading,
  );

  return {
    active,
    views,
    resume,
    next,
    loading,
    layout,
    offline,
    alone: offline.offline && !views.data,
    heroEyebrow: layout.heroFromResume ? 'Continue Watching' : 'Up Next',
    countKey,
    onLatestCount,
  };
}
