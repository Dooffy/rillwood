// SPDX-License-Identifier: GPL-3.0-or-later
// Kids Home data (docs/context/kids.md, Home): every show and movie once, filtered by the account's kids mode - a kids
// account: the server filters; a shared phone: the age filter on the request (movies and shows carry their own rating).
import { isConnectionError, type ItemsResult } from '@/api';
import { useHeldOffline } from '@/components/Message';
import { kidsTitles } from '@/kids';
import { kidsFilter, useKids } from '@/kidsSettings';
import { useSession } from '@/session';
import { invalidate, useFetch } from '@/useFetch';

/** Pull to refresh / Retry. */
export function refreshKids() {
  invalidate('/Items');
}

export function useKidsHome() {
  const { active } = useSession();
  const request = kidsTitles(kidsFilter(useKids(active?.id)));
  const titles = useFetch<ItemsResult>(request.path, { query: request.query });
  const items = titles.data?.Items ?? [];
  // Out of reach (offline kids Home from downloads: roadmap Kids mode task 10).
  const offline = useHeldOffline(!titles.data && isConnectionError(titles.error), titles.loading);
  const error = !titles.data && !offline.offline ? titles.error : undefined;

  return {
    titles: items,
    loading: titles.loading,
    offline,
    error,
    empty: titles.data !== undefined && items.length === 0,
  };
}
