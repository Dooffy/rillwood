// SPDX-License-Identifier: GPL-3.0-or-later
// Kids show page data (docs/context/kids.md, Show): the show (header art + name), its episodes in order and which one
// is next (in progress, else the one after the last watched - the server's Next Up for the show). Offline: its
// downloaded episodes only, the next = the first not watched among them, the saved art.
import { isConnectionError, type BaseItemDto, type ItemsResult } from '@/api';
import { useHeldOffline } from '@/components/Message';
import { itemDetail, seriesNextUp } from '@/items';
import { kidsEpisodes } from '@/kids';
import { kidsFilter, useKids } from '@/kidsSettings';
import { useSession } from '@/session';
import { invalidate, useFetch } from '@/useFetch';
import { offlineNext } from '@/kidsOffline';
import { NO_ART, useOfflineKids } from '@/useOfflineKids';

/** Retry: the show, its episodes and its next one. */
export function refreshKidsShow(id: string) {
  [itemDetail(id).path, kidsEpisodes(id, undefined).path, seriesNextUp(id).path].forEach((path) => invalidate(path));
}

export function useKidsShow(id: string) {
  const { active } = useSession();
  const filter = kidsFilter(useKids(active?.id));
  const episodesRequest = kidsEpisodes(id, filter);
  const nextRequest = seriesNextUp(id);
  const show = useFetch<BaseItemDto>(itemDetail(id).path);
  const episodes = useFetch<ItemsResult>(episodesRequest.path, { query: episodesRequest.query });
  const next = useFetch<ItemsResult>(nextRequest.path, { query: nextRequest.query });

  const loading = episodes.loading;
  const offline = useHeldOffline(!episodes.data && isConnectionError(episodes.error), loading);
  const error = !episodes.data && !offline.offline ? episodes.error : undefined;
  const fromDownloads = useOfflineKids();

  if (fromDownloads) {
    const downloaded = fromDownloads.episodes.get(id) ?? [];
    return {
      show: fromDownloads.titles.find((t) => t.Id === id) ?? show.data,
      episodes: downloaded,
      nextId: offlineNext(downloaded),
      loading: false,
      offline: { offline: false, busy: false },
      error: undefined,
      empty: downloaded.length === 0,
      downloaded: true,
      art: fromDownloads.art,
    };
  }
  return {
    show: show.data,
    episodes: episodes.data?.Items ?? [],
    nextId: next.data?.Items[0]?.Id,
    loading,
    offline,
    error,
    empty: episodes.data !== undefined && episodes.data.Items.length === 0,
    downloaded: false,
    art: NO_ART,
  };
}
