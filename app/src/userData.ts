// SPDX-License-Identifier: GPL-3.0-or-later
// Mark watched / favourite (docs/context/api.md). Optimistic: every cached response and paged list shows the change
// at once (`updateCached`), the server's answer replaces it, then everything refetches (Next Up, Continue Watching,
// counts). A failure puts the item back and refetches.
import { ApiError, setFavourite, setPlayed, type BaseItemDto, type UserItemDataDto } from '@/api';
import { mapItems, patchItem, type UserDataChange, type UserFlag } from '@/items';
import { connectionFor, getSession } from '@/session';
import { invalidate, updateCached } from '@/useFetch';

const apply = (accountId: string, patch: (item: BaseItemDto) => BaseItemDto) =>
  updateCached(accountId, (data) => mapItems(data, patch));

// Latest call per account + item + flag: a quick second tap wins over the first one's late answer.
const latest = new Map<string, object>();

/**
 * Sets watched / favourite on `item` as the active account. Resolves to the error (the change is undone) or undefined.
 * Signed out → `ApiError('http', 401)` without a request.
 */
export async function setUserFlag(item: BaseItemDto, flag: UserFlag, value: boolean): Promise<ApiError | undefined> {
  const account = getSession().active;
  const conn = account ? connectionFor(account) : null;
  if (!account || !conn) return new ApiError('http', 401);
  const key = `${account.id}|${item.Id}|${flag}`;
  const mine = {};
  latest.set(key, mine);
  const change: UserDataChange = { itemId: item.Id, flag, value };
  // Each changed item's own UserData before this call, to put back on failure (a season marks its episodes too).
  const before = new Map<string, UserItemDataDto | undefined>();
  apply(account.id, (x) => {
    const next = patchItem(x, change);
    if (next !== x && !before.has(x.Id)) before.set(x.Id, x.UserData);
    return next;
  });
  try {
    const userData = await (flag === 'played' ? setPlayed : setFavourite)(conn, item.Id, value);
    if (latest.get(key) !== mine) return undefined;
    if (userData) apply(account.id, (x) => patchItem(x, { ...change, userData }));
    invalidate();
    return undefined;
  } catch (e) {
    const error = e instanceof ApiError ? e : new ApiError('network');
    if (latest.get(key) !== mine) return error;
    // Every item back to its own UserData (not the opposite value: episodes of a season differ).
    apply(account.id, (x) => (before.has(x.Id) ? { ...x, UserData: before.get(x.Id) } : x));
    invalidate();
    return error;
  } finally {
    if (latest.get(key) === mine) latest.delete(key);
  }
}

const FAILED: Record<UserFlag, [on: string, off: string]> = {
  played: ["Couldn't mark as watched.", "Couldn't mark as unwatched."],
  favourite: ["Couldn't add to favourites.", "Couldn't remove from favourites."],
};

/** Toast for a failed change: what failed, then what to do. */
export function userFlagError(flag: UserFlag, value: boolean, error: ApiError): string {
  const what = FAILED[flag][value ? 0 : 1];
  return `${what} ${error.kind === 'network' ? 'Check your connection and try again.' : 'Try again.'}`;
}
