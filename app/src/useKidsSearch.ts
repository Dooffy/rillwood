// SPDX-License-Identifier: GPL-3.0-or-later
// Kids search data (docs/context/kids.md, Search): results with each letter (once typing pauses), shows and movies as
// posters, episodes as stills. A kids account: the server filters; a shared phone: the age filter on both requests, and
// episodes only from allowed shows (an unrated show's episodes count as rated on the server).
import { isConnectionError, type ItemsResult } from '@/api';
import { useHeldOffline } from '@/components/Message';
import { searchTerm } from '@/items';
import { allowedShows, keepAllowed, kidsSearch } from '@/kids';
import { kidsFilter, useKids } from '@/kidsSettings';
import { useSession } from '@/session';
import { useDebounced } from '@/useDebounced';
import { invalidate, useFetch } from '@/useFetch';
import { NO_ART, useOfflineKids } from '@/useOfflineKids';

/** Wait this long after the last key before searching. */
export const KIDS_SEARCH_DEBOUNCE_MS = 300;

/** Retry. */
export function refreshKidsSearch() {
  invalidate('/Items');
}

export function useKidsSearch(text: string) {
  const { active } = useSession();
  const filter = kidsFilter(useKids(active?.id));
  const term = searchTerm(useDebounced(text, KIDS_SEARCH_DEBOUNCE_MS));
  const request = term ? kidsSearch(term, filter) : undefined;
  const shows = filter ? allowedShows(filter) : undefined;
  const titles = useFetch<ItemsResult>(request?.titles.path ?? null, { query: request?.titles.query });
  const episodes = useFetch<ItemsResult>(request?.episodes.path ?? null, { query: request?.episodes.query });
  // Shared phone only: the shows episodes may come from (cached - Home's filter asks the same).
  const allowed = useFetch<ItemsResult>(term && shows ? shows.path : null, { query: shows?.query });

  const allowedIds = allowed.data && new Set(allowed.data.Items.map((s) => s.Id));
  const episodeItems = episodes.data?.Items ?? [];
  const keptEpisodes = filter ? (allowedIds ? keepAllowed(episodeItems, allowedIds) : []) : episodeItems;
  const loaded = titles.data !== undefined && episodes.data !== undefined && (!filter || allowed.data !== undefined);
  const loading = term !== undefined && !loaded && (titles.loading || episodes.loading || allowed.loading);
  const failure = titles.error ?? episodes.error ?? allowed.error;
  const offline = useHeldOffline(!loaded && isConnectionError(failure), loading);
  const fromDownloads = useOfflineKids();

  // Out of reach: searches the downloads by name (an episode by its own name or its show's).
  if (fromDownloads) {
    const needle = term?.toLocaleLowerCase();
    const has = (name: string | undefined) => !!needle && (name ?? '').toLocaleLowerCase().includes(needle);
    const titlesFound = needle ? fromDownloads.titles.filter((t) => has(t.Name)) : [];
    const episodesFound = needle
      ? [...fromDownloads.episodes.values()].flat().filter((e) => has(e.Name) || has(e.SeriesName))
      : [];
    return {
      searching: term !== undefined,
      titles: titlesFound,
      episodes: episodesFound,
      loading: false,
      offline: { offline: false, busy: false },
      error: undefined,
      empty: term !== undefined && titlesFound.length === 0 && episodesFound.length === 0,
      art: fromDownloads.art,
    };
  }
  return {
    /** Something typed (debounced): results are for it. */
    searching: term !== undefined,
    titles: loaded ? (titles.data?.Items ?? []) : [],
    episodes: loaded ? keptEpisodes : [],
    loading,
    offline,
    error: !loaded && !offline.offline ? failure : undefined,
    empty: loaded && (titles.data?.Items.length ?? 0) === 0 && keptEpisodes.length === 0,
    art: NO_ART,
  };
}
