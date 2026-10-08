// SPDX-License-Identifier: GPL-3.0-or-later
// Library: browse and search in one place. Search field, type capsules (All / Movies / Shows / Episodes), sort, the
// shared filter sheet + removable filter tags. One type → an endless poster grid or episode list; All → grouped rows
// with See All. Data rules: docs/context/api.md (Library).
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import type { BaseItemDto, Endpoint, ItemsResult } from '@/api';
import { Button } from '@/components/Button';
import { LANDSCAPE_WIDTH, LandscapeCard, POSTER_WIDTH, PosterCard } from '@/components/Card';
import { useItemMenu } from '@/components/ItemMenu';
import { Chip } from '@/components/Chip';
import { FilterChips } from '@/components/FilterChips';
import { FilterButton, FilterSheet } from '@/components/FilterSheet';
import { ListRow, ListSection } from '@/components/List';
import { MenuButton } from '@/components/MenuButton';
import { loadErrorMessage, Message } from '@/components/Message';
import { PagedList } from '@/components/PagedList';
import { Row } from '@/components/Row';
import { PosterRowsPlaceholder } from '@/components/Skeleton';
import { Screen } from '@/components/Screen';
import { SearchField } from '@/components/SearchField';
import { Text } from '@/components/Text';
import {
  activeFilters,
  cardTitles,
  genresEndpoint,
  groupResults,
  landscapeImage,
  LIBRARY_PAGE_SIZE,
  LIBRARY_SORTS,
  listItems,
  NO_FILTERS,
  playback,
  posterImage,
  ROW_LIMIT,
  SEARCH_SCOPES,
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
import { usePullToRefresh } from '@/usePullToRefresh';
import { useImage } from '@/useImage';
import { usePagedItems } from '@/usePagedItems';
import { spacing, tabList, useColors } from '@/theme';

/** Wait this long after the last key before searching. */
const SEARCH_DEBOUNCE_MS = 300;

/** Poster rows of All, in order (Episodes has its own cards). */
const POSTER_ROWS: { key: 'movies' | 'shows'; title: string }[] = [
  { key: 'movies', title: 'Movies' },
  { key: 'shows', title: 'Shows' },
];

const NOUN: Record<SearchScope, string> = { all: 'item', movies: 'movie', shows: 'show', episodes: 'episode' };

/** "11 movies", "1 episode". */
function countLabel(scope: SearchScope, total: number): string {
  return `${total} ${NOUN[scope]}${total === 1 ? '' : 's'}`;
}

/** What an empty list means. */
function emptyText({ term, scope, filters }: LibraryQuery): string {
  const filtered = activeFilters(filters).length > 0;
  const clear = 'Clear a filter to see more.';
  if (term) {
    return filtered
      ? `No results for "${term}" with these filters. ${clear}`
      : `No results for "${term}". Check the spelling or try another word.`;
  }
  if (filtered) return `Nothing matches these filters. ${clear}`;
  const what = scope === 'all' ? 'Nothing' : `No ${NOUN[scope]}s`;
  return `${what} on the server yet. Add some in Jellyfin, then pull down to refresh.`;
}

/** One `/Items` request, or nothing for undefined. */
function useItems(endpoint: Endpoint | undefined) {
  return useFetch<ItemsResult>(endpoint?.path ?? null, { query: endpoint?.query });
}

export default function Library() {
  const { active } = useSession();
  const image = useImage();
  const c = useColors();
  const menu = useItemMenu();
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
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
  const open = (item: BaseItemDto) => {
    remember();
    openItem(item);
  };
  const poster = (item: BaseItemDto) => (
    <PosterCard
      key={item.Id}
      {...cardTitles(item)}
      {...playback(item)}
      image={image(posterImage(item), POSTER_WIDTH)}
      onPress={() => open(item)}
      onLongPress={() => {
        remember();
        menu(item);
      }}
    />
  );

  let body;
  if (focused && text.trim() === '' && recent.length > 0) {
    // Typing starts: recent searches until there is a term.
    body = (
      <ScrollView {...tabList} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.padded}>
        <ListSection title="Recent">
          {recent.map((t) => (
            <ListRow key={t} label={t} onPress={() => setText(t)} />
          ))}
        </ListSection>
        <View style={styles.clear}>
          <Button title="Clear Recent" variant="secondary" onPress={() => active && clearRecentSearches(active.id)} />
        </View>
      </ScrollView>
    );
  } else if (!all) {
    body = (
      <PagedList
        list={paged}
        layout={scope === 'episodes' ? 'episodes' : 'posters'}
        listKey={listKey}
        testID="library-list"
        onOpen={remember}
        emptyText={emptyText(query)}
        header={
          paged.total !== undefined && paged.total > 0 ? (
            <Text variant="caption" secondary>
              {[countLabel(scope, paged.total), term ? undefined : `by ${sortLabel}`].filter(Boolean).join(' · ')}
            </Text>
          ) : undefined
        }
      />
    );
  } else {
    const failed = parts.find((p) => p.error && !p.data)?.error;
    const groups = parts.every((p) => p.data) ? groupResults(parts.flatMap((p) => p.data?.Items ?? [])) : undefined;
    let content;
    if (!groups) {
      content = failed ? (
        <View style={styles.padded}>
          <Message text={loadErrorMessage(failed)} retry={() => parts.forEach((p) => p.error && p.refresh())} />
        </View>
      ) : (
        <PosterRowsPlaceholder rows={term ? 3 : 2} />
      );
    } else if (groups.movies.length + groups.shows.length + groups.episodes.length === 0) {
      content = (
        <View style={styles.padded}>
          <Message text={emptyText(query)} />
        </View>
      );
    } else {
      content = (
        <>
          {/* Headings select that type: the full list, scrolling down. */}
          {POSTER_ROWS.map(
            ({ key, title }) =>
              groups[key].length > 0 && (
                <Row key={key} title={title} onPress={() => setScope(key)}>
                  {groups[key].map(poster)}
                </Row>
              ),
          )}
          {groups.episodes.length > 0 && (
            <Row title="Episodes" onPress={() => setScope('episodes')}>
              {groups.episodes.map((ep) => (
                <LandscapeCard
                  key={ep.Id}
                  {...cardTitles(ep)}
                  {...playback(ep)}
                  image={image(landscapeImage(ep), LANDSCAPE_WIDTH)}
                  onPress={() => open(ep)}
                  onLongPress={() => {
                    remember();
                    menu(ep);
                  }}
                />
              ))}
            </Row>
          )}
        </>
      );
    }
    body = (
      <ScrollView
        {...tabList}
        testID="library-rows"
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.rows}
        refreshControl={<RefreshControl refreshing={rows.refreshing} onRefresh={rows.onRefresh} tintColor={c.text} />}
      >
        {content}
      </ScrollView>
    );
  }

  return (
    <Screen
      title="Library"
      padded={false}
      right={
        <>
          <MenuButton
            icon={{ ios: 'arrow.up.arrow.down', android: 'sort' }}
            label={`Sort: ${sortLabel}`}
            title="Sort by"
            options={LIBRARY_SORTS}
            value={sort}
            onChange={setSort}
          />
          <FilterButton
            value={filters}
            onPress={() => {
              setGenresWanted(true);
              setFiltersOpen(true);
            }}
          />
        </>
      }
    >
      <View style={styles.controls}>
        <View style={styles.padded}>
          <SearchField
            value={text}
            onChangeText={setText}
            onSubmit={submit}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Movies, shows, episodes"
          />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scopes}>
          {SEARCH_SCOPES.map((s) => (
            <Chip key={s.key} label={s.label} selected={scope === s.key} onPress={() => setScope(s.key)} />
          ))}
        </ScrollView>
        <FilterChips value={filters} onChange={setFilters} />
      </View>
      {body}
      <FilterSheet
        visible={filtersOpen}
        value={filters}
        genres={(genres.data?.Items ?? []).map((g) => g.Name)}
        onApply={setFilters}
        onClose={() => setFiltersOpen(false)}
        countEndpoint={(draft) => listItems({ ...query, filters: draft }, 0)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  controls: { paddingBottom: spacing.md, gap: spacing.sm },
  scopes: { paddingHorizontal: spacing.md, gap: spacing.sm },
  rows: { gap: spacing.lg, paddingBottom: spacing.lg },
  padded: { paddingHorizontal: spacing.md, gap: spacing.md },
  clear: { alignItems: 'flex-start' },
});
