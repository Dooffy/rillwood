// SPDX-License-Identifier: GPL-3.0-or-later
// One item for a screen: the server's, else the one saved with a download (docs/context/downloads.md, Offline detail).
// Item detail, series and the player read it.
import { useMemo } from 'react';

import { useOffline, type ApiError, type BaseItemDto } from '@/api';
import { savedItem, type SavedItem } from '@/downloads';
import { isItemId, itemDetail } from '@/items';
import { useSession } from '@/session';
import { useFetch } from '@/useFetch';

export type ItemResult = {
  /** The server's item; offline (known, or the request failed - a 404 too) the saved one. */
  item: BaseItemDto | undefined;
  /** The copy saved with one of the account's downloads of it (a show: of its episodes), loading or not. */
  saved: SavedItem | null;
  /** `item` is the saved copy. */
  fromSaved: boolean;
  /** Failure of the server request; unset while the saved copy stands in. */
  error: ApiError | undefined;
  refresh: () => void;
};

/**
 * `GET /Items/{id}` as the active account, the saved copy standing in when the server can't answer. Known offline
 * (`useOffline`) → the saved copy at once, not after the 8 s timeout; a server answer that lands replaces it. The disk
 * is read once per id and account; a new `recheck` value reads it again (the player's Retry).
 */
export function useItem(id: string | undefined, recheck?: unknown): ItemResult {
  const valid = isItemId(id);
  const { data, error, refresh } = useFetch<BaseItemDto>(valid ? itemDetail(id).path : null);
  const accountId = useSession().active?.id;
  const offline = useOffline();
  const saved = useMemo(
    () => (valid && accountId ? savedItem(accountId, id) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `recheck` re-reads the disk
    [valid, accountId, id, recheck],
  );

  if (data) return { item: data, saved, fromSaved: false, error: undefined, refresh };
  if (saved && (error || offline)) return { item: saved.item, saved, fromSaved: true, error: undefined, refresh };
  return { item: undefined, saved, fromSaved: false, error, refresh };
}
