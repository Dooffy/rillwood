// SPDX-License-Identifier: GPL-3.0-or-later
import { useCallback, type ReactElement } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { isConnectionError, type BaseItemDto } from '@/api';
import { formatRemaining } from '@/format';
import { cardTitles, landscapeImage, playback, posterImage, ticksToSeconds } from '@/items';
import { openItem } from '@/navigation';
import type { PagedItems } from '@/usePagedItems';
import { useImage } from '@/useImage';
import { usePullToRefresh } from '@/usePullToRefresh';
import { spacing, tabList, useColors } from '@/theme';

import { PosterCard } from './Card';
import { EPISODE_ROW_STILL, EpisodeRow } from './EpisodeRow';
import { useItemMenu } from './ItemMenu';
import { LoadError, loadErrorMessage, Message, Offline, useHeldOffline } from './Message';
import { CARD_GAP } from './Row';
import { EpisodeRowsPlaceholder, PosterGridPlaceholder } from './Skeleton';
import { Spinner } from './Spinner';
import { useTabContentWidth } from './TabsSidebar';

/** A phone's poster column count (about 111 pt each); wider lists add columns. */
const MIN_COLUMNS = 3;
/** Posters in a wider grid stay about this wide - a bit over a Home row poster (`POSTER_WIDTH`), as the grid fills the screen. */
const POSTER_TARGET = 140;

/** Poster columns for a list this wide: 3 on phones, more on tablets (5 in iPad portrait, 6 beside the landscape sidebar). */
function gridColumns(listWidth: number): number {
  const fit = Math.floor((listWidth - 2 * spacing.md + CARD_GAP) / (POSTER_TARGET + CARD_GAP));
  return Math.max(MIN_COLUMNS, fit);
}

export type PagedListProps = {
  list: PagedItems;
  /** posters: grid (movies, shows; 3 columns on phones, more on tablets); episodes: one row each. */
  layout: 'posters' | 'episodes';
  /** Scrolls with the list (summary line). */
  header?: ReactElement;
  /** What an empty, loaded list means. */
  emptyText: string;
  /** A new id starts at the top. */
  listKey: string;
  testID?: string;
  /** Called with the item before it opens (the Library remembers the search term). */
  onOpen?: (item: BaseItemDto) => void;
};

/**
 * Endless list of items (Library: one type, browsing or searching): first-page placeholders / error / empty text, footer
 * spinner or error with Retry, pull to refresh. Cards are memoised and the renderer is stable, so new pages don't
 * redraw every card.
 */
export function PagedList({ list, layout, header, emptyText, listKey, testID, onOpen }: PagedListProps) {
  const c = useColors();
  const image = useImage();
  // A tab screen: the sidebar takes part of the window in tablet landscape.
  const width = useTabContentWidth();
  const { refreshing, onRefresh } = usePullToRefresh(list.loading, list.refresh);
  const columns = gridColumns(width);
  const cardWidth = Math.floor((width - 2 * spacing.md - (columns - 1) * CARD_GAP) / columns);
  const posters = layout === 'posters';
  const menu = useItemMenu();
  const offline = useHeldOffline(list.items.length === 0 && isConnectionError(list.error), list.loading);

  const renderItem = useCallback(
    ({ item }: { item: BaseItemDto }) => {
      const open = () => {
        onOpen?.(item);
        openItem(item);
      };
      if (posters) {
        return (
          <PosterCard
            {...cardTitles(item)}
            {...playback(item)}
            width={cardWidth}
            image={image(posterImage(item), cardWidth)}
            onPress={open}
            onLongPress={() => {
              onOpen?.(item);
              menu(item);
            }}
          />
        );
      }
      const runtime = item.RunTimeTicks ? formatRemaining(ticksToSeconds(item.RunTimeTicks)) : undefined;
      return (
        <EpisodeRow
          {...cardTitles(item)}
          {...playback(item)}
          meta={runtime}
          image={image(landscapeImage(item), EPISODE_ROW_STILL)}
          onPress={open}
          onLongPress={() => {
            onOpen?.(item);
            menu(item);
          }}
        />
      );
    },
    [posters, cardWidth, image, onOpen, menu],
  );

  // Out of reach with nothing loaded: the offline card alone at the top, nothing to scroll (held while a retry runs).
  if (offline.offline) return <Offline fill busy={offline.busy} retry={list.retry} />;

  // First page: placeholders, an error with Retry, or what an empty list means.
  const empty = list.loading ? (
    posters ? (
      <PosterGridPlaceholder columns={columns} width={cardWidth} />
    ) : (
      <EpisodeRowsPlaceholder />
    )
  ) : list.error ? (
    <Message text={loadErrorMessage(list.error)} retry={list.retry} />
  ) : (
    <Message text={emptyText} />
  );

  // Later pages: a spinner while loading, or the error with Retry (loaded items stay).
  const footer =
    list.items.length === 0 ? undefined : list.error ? (
      <View style={styles.footer}>
        <LoadError error={list.error} retry={list.retry} />
      </View>
    ) : list.loading ? (
      <View style={styles.footer}>
        <Spinner />
      </View>
    ) : undefined;

  return (
    <FlatList
      {...tabList}
      // A new column count needs a new list (FlatList can't change numColumns in place).
      key={`${layout}|${listKey}|${posters ? columns : 1}`}
      testID={testID}
      data={list.items}
      keyExtractor={(item) => item.Id}
      numColumns={posters ? columns : 1}
      columnWrapperStyle={posters ? styles.columns : undefined}
      contentContainerStyle={styles.content}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      ListFooterComponent={footer}
      onEndReached={list.loadMore}
      onEndReachedThreshold={0.5}
      // A full first screen on tall phones.
      initialNumToRender={posters ? columns * 4 : 8}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.text} />}
      renderItem={renderItem}
    />
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.md, paddingBottom: spacing.lg, gap: spacing.md },
  columns: { gap: CARD_GAP },
  footer: { paddingVertical: spacing.md },
});
