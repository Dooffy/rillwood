// SPDX-License-Identifier: GPL-3.0-or-later
// Library: every movie or show across libraries (Movies / TV Shows), sort menu, Unwatched filter, 3-column poster
// grid with endless scroll and pull to refresh. Data rules: docs/context/api.md (Library data).
import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, useWindowDimensions, View } from 'react-native';

import type { BaseItemDto } from '@/api';
import { ActionSheet } from '@/components/ActionSheet';
import { CardPlaceholder, PosterCard } from '@/components/Card';
import { loadErrorMessage, Message } from '@/components/Message';
import { CARD_GAP } from '@/components/Row';
import { Screen } from '@/components/Screen';
import { MenuButton } from '@/components/MenuButton';
import { Spinner } from '@/components/Spinner';
import { Text } from '@/components/Text';
import { cardTitles, LIBRARY_SORTS, playback, posterImage, type LibraryKind, type LibraryQuery } from '@/items';
import { openItem } from '@/navigation';
import { useImage } from '@/useImage';
import { useLibrary } from '@/useLibrary';
import { usePullToRefresh } from '@/usePullToRefresh';
import { spacing, useColors } from '@/theme';

const COLUMNS = 3;
const KINDS = [
  { key: 'movies', label: 'Movies' },
  { key: 'shows', label: 'TV Shows' },
] as const;
const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'unwatched', label: 'Unwatched only' },
] as const;

/** "11 movies", "1 show". */
function countLabel(kind: LibraryKind, total: number): string {
  const noun = kind === 'movies' ? 'movie' : 'show';
  return `${total} ${noun}${total === 1 ? '' : 's'}`;
}

/** Line under the title: "10 movies · Unwatched · by Name" (count once it is known). */
function summary(query: LibraryQuery, total: number | undefined, sortLabel: string): string {
  return [
    total === undefined ? undefined : countLabel(query.kind, total),
    query.unwatched ? 'Unwatched' : undefined,
    `by ${sortLabel}`,
  ]
    .filter(Boolean)
    .join(' · ');
}

export default function Library() {
  const c = useColors();
  const image = useImage();
  const { width } = useWindowDimensions();
  const [query, setQuery] = useState<LibraryQuery>({ kind: 'movies', sort: 'name', unwatched: false });
  const [kindMenu, setKindMenu] = useState(false);
  const library = useLibrary(query);
  const { refreshing, onRefresh } = usePullToRefresh(library.loading, library.refresh);
  const cardWidth = Math.floor((width - 2 * spacing.md - (COLUMNS - 1) * CARD_GAP) / COLUMNS);
  const update = (change: Partial<LibraryQuery>) => setQuery((q) => ({ ...q, ...change }));
  // Stable, with memoised cards: a refresh or a new page doesn't redraw every poster.
  const renderItem = useCallback(
    ({ item }: { item: BaseItemDto }) => (
      <PosterCard
        {...cardTitles(item)}
        {...playback(item)}
        width={cardWidth}
        image={image(posterImage(item), cardWidth)}
        onPress={() => openItem(item)}
      />
    ),
    [cardWidth, image],
  );

  const sortLabel = LIBRARY_SORTS.find((o) => o.key === query.sort)?.label ?? LIBRARY_SORTS[0].label;
  const kindLabel = KINDS.find((k) => k.key === query.kind)?.label ?? KINDS[0].label;

  const header = (
    <Text variant="caption" secondary style={styles.summary}>
      {summary(query, library.total, sortLabel)}
    </Text>
  );

  // First page: placeholders, an error with Retry, or what an empty grid means.
  const empty = library.loading ? (
    <View accessible accessibilityLabel="Loading" style={styles.grid}>
      {Array.from({ length: COLUMNS * 3 }, (_, i) => (
        <CardPlaceholder key={i} shape="poster" width={cardWidth} />
      ))}
    </View>
  ) : library.error ? (
    <Message text={loadErrorMessage(library.error)} retry={library.retry} />
  ) : (
    <Message
      text={
        query.unwatched
          ? 'You have watched everything here.'
          : query.kind === 'movies'
            ? 'No movies on the server yet.'
            : 'No shows on the server yet.'
      }
    />
  );

  // Later pages: a spinner while loading, or the error with Retry (loaded posters stay).
  const footer =
    library.items.length === 0 ? undefined : library.error ? (
      <View style={styles.footer}>
        <Message text={loadErrorMessage(library.error)} retry={library.retry} />
      </View>
    ) : library.loading ? (
      <View style={styles.footer}>
        <Spinner />
      </View>
    ) : undefined;

  return (
    <Screen
      title={kindLabel}
      onTitlePress={() => setKindMenu(true)}
      padded={false}
      right={
        <>
          <MenuButton
            icon={{ ios: 'arrow.up.arrow.down', android: 'sort' }}
            label={`Sort: ${sortLabel}`}
            title="Sort by"
            options={LIBRARY_SORTS}
            value={query.sort}
            onChange={(sort) => update({ sort })}
          />
          <MenuButton
            icon={{ ios: 'line.3.horizontal.decrease', android: 'filter_list' }}
            label={query.unwatched ? 'Filter: Unwatched only' : 'Filter: All'}
            title="Show"
            options={FILTERS}
            value={query.unwatched ? 'unwatched' : 'all'}
            onChange={(filter) => update({ unwatched: filter === 'unwatched' })}
            active={query.unwatched}
          />
        </>
      }
    >
      <FlatList
        // A new kind / sort / filter starts at the top.
        key={`${query.kind}|${query.sort}|${query.unwatched}`}
        testID="library-grid"
        data={library.items}
        keyExtractor={(item) => item.Id}
        numColumns={COLUMNS}
        columnWrapperStyle={styles.columns}
        contentContainerStyle={styles.content}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={footer}
        onEndReached={library.loadMore}
        onEndReachedThreshold={0.5}
        // A full first screen on tall phones.
        initialNumToRender={COLUMNS * 4}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.text} />}
        renderItem={renderItem}
      />
      <ActionSheet
        visible={kindMenu}
        title="Library"
        actions={KINDS.map((k) => ({
          label: k.label,
          selected: k.key === query.kind,
          onPress: () => update({ kind: k.key }),
        }))}
        onClose={() => setKindMenu(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  summary: { paddingBottom: spacing.xs },
  content: { paddingHorizontal: spacing.md, paddingBottom: spacing.lg, gap: spacing.md },
  columns: { gap: CARD_GAP },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: CARD_GAP },
  footer: { paddingVertical: spacing.md },
});
