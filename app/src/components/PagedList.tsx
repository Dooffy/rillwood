// SPDX-License-Identifier: GPL-3.0-or-later
import { useCallback, type ReactElement } from 'react';
import { FlatList, RefreshControl, StyleSheet, useWindowDimensions, View } from 'react-native';

import type { BaseItemDto } from '@/api';
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
import { loadErrorMessage, Message } from './Message';
import { CARD_GAP } from './Row';
import { EpisodeRowsPlaceholder, PosterGridPlaceholder } from './Skeleton';
import { Spinner } from './Spinner';

const COLUMNS = 3;

export type PagedListProps = {
  list: PagedItems;
  /** posters: 3-column grid (movies, shows); episodes: one row each. */
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
  const { width } = useWindowDimensions();
  const { refreshing, onRefresh } = usePullToRefresh(list.loading, list.refresh);
  const cardWidth = Math.floor((width - 2 * spacing.md - (COLUMNS - 1) * CARD_GAP) / COLUMNS);
  const posters = layout === 'posters';
  const menu = useItemMenu();

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

  // First page: placeholders, an error with Retry, or what an empty list means.
  const empty = list.loading ? (
    posters ? (
      <PosterGridPlaceholder columns={COLUMNS} width={cardWidth} />
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
        <Message text={loadErrorMessage(list.error)} retry={list.retry} />
      </View>
    ) : list.loading ? (
      <View style={styles.footer}>
        <Spinner />
      </View>
    ) : undefined;

  return (
    <FlatList
      {...tabList}
      key={`${layout}|${listKey}`}
      testID={testID}
      data={list.items}
      keyExtractor={(item) => item.Id}
      numColumns={posters ? COLUMNS : 1}
      columnWrapperStyle={posters ? styles.columns : undefined}
      contentContainerStyle={styles.content}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      ListFooterComponent={footer}
      onEndReached={list.loadMore}
      onEndReachedThreshold={0.5}
      // A full first screen on tall phones.
      initialNumToRender={posters ? COLUMNS * 4 : 8}
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
