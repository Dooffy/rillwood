// SPDX-License-Identifier: GPL-3.0-or-later
// Kids mode's list from downloads while the server is out of reach (`offlineKids`, docs/context/kids.md, Offline);
// null while online. Follows the offline flag, the account's downloads and its kids filter.
import { useMemo } from 'react';

import { useOffline } from '@/api';
import { useDownloadList } from '@/downloads';
import { offlineKids, type OfflineKids } from '@/kidsOffline';
import { kidsFilter, useKids } from '@/kidsSettings';
import { useSession } from '@/session';

export function useOfflineKids(): OfflineKids | null {
  const offline = useOffline();
  const accountId = useSession().active?.id;
  const kids = useKids(accountId);
  const all = useDownloadList();
  return useMemo(
    () => (offline ? offlineKids(all, accountId, kidsFilter(kids)) : null),
    [offline, all, accountId, kids],
  );
}

/** No saved art (online: the server's images). */
export const NO_ART: ReadonlyMap<string, string> = new Map();
