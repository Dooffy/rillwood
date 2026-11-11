// SPDX-License-Identifier: GPL-3.0-or-later
// Library data for both views (`PhoneLibrary`, `TvLibrary`): search, type, sort, filters, the All rows' fetches, the
// paged list for one type, offline state and the card handlers. Data rules: docs/context/api.md (Library).
import { useCallback, useState } from 'react';

import { isConnectionError, type BaseItemDto, type Endpoint, type ItemsResult } from '@/api';
import { useItemMenu } from '@/components/ItemMenu';
import { useHeldOffline } from '@/components/Message';
import { features } from '@/device';
import {
  activeFilters,
  genresEndpoint,
  groupResults,
  LIBRARY_PAGE_SIZE,
  LIBRARY_SORTS,
  listItems,
  NO_FILTERS,
  ROW_LIMIT,
  searchTerm,
  type Filters,
  type LibraryQuery,
  type LibrarySort,
  type SearchScope,
} from '@/items';
import { openItem } from '@/navigation';
import { addRecentSearch, clearRecentSearches, useRecentSearches } from '@/recentSearches';
import { useSession } from '@/session';
import { useDebounced } from '@/useDebounced';
import { useFetch } from '@/useFetch';
import { usePagedItems } from '@/usePagedItems';
import { usePullToRefresh } from '@/usePullToRefresh';

/** Wait this long after the last key before searching. */
const SEARCH_DEBOUNCE_MS = 300;

/** Poster rows of All, in order (Episodes has its own cards). */
export const POSTER_ROWS: { key: 'movies' | 'shows'; title: string }[] = [
  { key: 'movies', title: 'Movies' },
  { key: 'shows', title: 'Shows' },
];

const NOUN: Record<SearchScope, string> = { all: 'item', movies: 'movie', shows: 'show', episodes: 'episode' };

/** "11 movies", "1 episode". */
export function countLabel(scope: SearchScope, total: number): string {
  return `${total} ${NOUN[scope]}${total === 1 ? '' : 's'}`;
}

/** What an empty list means. */
export function emptyText({ term, scope, filters }: LibraryQuery): string {
  const filtered = activeFilters(filters).length > 0;
  const clear = 'Clear a filter to see more.';
  if (term) {
    return filtered
      ? `No results for "${term}" with these filters. ${clear}`
      : `No results for "${term}". Check the spelling or try another word.`;
  }
  if (filtered) return `Nothing matches these filters. ${clear}`;
  const what = scope === 'all' ? 'Nothing' : `No ${NOUN[scope]}s`;
  // No pull to refresh without touch (Apple TV): the list refetches when the app comes back.
  const then = features.touch ? 'then pull down to refresh' : 'then come back here';
  return `${what} on the server yet. Add some in Jellyfin, ${then}.`;
}

/** One `/Items` request, or nothing for undefined. */
function useItems(endpoint: Endpoint | undefined) {
  return useFetch<ItemsResult>(endpoint?.path ?? null, { query: endpoint?.query });
}

export type LibraryState = ReturnType<typeof useLibrary>;

export function useLibrary() {
  const { active } = useSession();
  const menu = useItemMenu();
  const [text, setText] = useState('');
  const [scope, setScope] = useState<SearchScope>('all');
  const [sort, setSort] = useState<LibrarySort>('name');
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const term = searchTerm(useDebounced(text, SEARCH_DEBOUNCE_MS));
  const query: LibraryQuery = { term, scope, sort, filters };
  // The request itself, so changes the server ignores (sort while searching) don't restart the list.
  const listKey = JSON.stringify(listItems(query));
  const recent = useRecentSearches(active?.id);
  // Genres load the first time the filter sheet opens.
  const [genresWanted, setGenresWanted] = useState(false);
  const genres = useFetch<{ Items: { Name: string }[] }>(genresWanted ? genresEndpoint.path : null, {
    query: genresEndpoint.query,
  });

  // All: one row per type, one request each, so no type crowds out another (Episodes only while searching). One type:
  // an endless list (paged).
  const all = scope === 'all';
  const rowRequest = (type: SearchScope) =>
    all && (type !== 'episodes' || term) ? listItems({ ...query, scope: type }, ROW_LIMIT) : undefined;
  const movies = useItems(rowRequest('movies'));
  const shows = useItems(rowRequest('shows'));
  const episodes = useItems(rowRequest('episodes'));
  const parts = term ? [movies, shows, episodes] : [movies, shows];
  // Rows (All): pull to refresh every part; the grid / list has its own (PagedList).
  const rows = usePullToRefresh(
    parts.some((p) => p.loading),
    () => parts.forEach((p) => p.refresh()),
  );
  const paged = usePagedItems(all ? null : listKey, (start) => listItems(query, LIBRARY_PAGE_SIZE, start));
  const sortLabel = LIBRARY_SORTS.find((o) => o.key === sort)?.label ?? LIBRARY_SORTS[0].label;
  const failed = parts.find((p) => p.error && !p.data)?.error;
  const loaded = parts.every((p) => p.data);
  const groups = loaded ? groupResults(parts.flatMap((p) => p.data?.Items ?? [])) : undefined;
  const retryAll = () => parts.forEach((p) => p.error && p.refresh());
  // Out of reach with nothing loaded: the offline card (held while a retry runs). No search, sort or filters to use -
  // unless there is something to undo (a search typed, another type, filters on), so the screen never gets stuck.
  const offline = useHeldOffline(
    all ? !loaded && isConnectionError(failed) : paged.items.length === 0 && isConnectionError(paged.error),
    all ? parts.some((p) => p.loading) : paged.loading,
  );
  const controls = !offline.offline || text !== '' || !all || activeFilters(filters).length > 0;

  // Stable, so the paged list keeps its renderer (and cards) while typing.
  const accountId = active?.id;
  const remember = useCallback(() => {
    if (accountId && term) addRecentSearch(accountId, term);
  }, [accountId, term]);
  // The search key: what is typed now (the debounced term may still lag).
  const submit = () => {
    const now = searchTerm(text);
    if (accountId && now) addRecentSearch(accountId, now);
  };
  // Stable (per search term): the memoised cards skip re-rendering while the screen does.
  const open = useCallback(
    (item: BaseItemDto) => {
      remember();
      openItem(item);
    },
    [remember],
  );
  const onMenu = useCallback(
    (item: BaseItemDto) => {
      remember();
      menu(item);
    },
    [remember, menu],
  );
  const openFilters = () => {
    setGenresWanted(true);
    setFiltersOpen(true);
  };
  const clearRecent = () => {
    if (accountId) clearRecentSearches(accountId);
  };

  return {
    text,
    setText,
    term,
    scope,
    setScope,
    sort,
    setSort,
    sortLabel,
    filters,
    setFilters,
    filtersOpen,
    openFilters,
    closeFilters: () => setFiltersOpen(false),
    genres: (genres.data?.Items ?? []).map((g) => g.Name),
    query,
    listKey,
    all,
    groups,
    failed,
    rows,
    retryAll,
    paged,
    offline,
    controls,
    recent,
    clearRecent,
    remember,
    submit,
    open,
    onMenu,
  };
}
