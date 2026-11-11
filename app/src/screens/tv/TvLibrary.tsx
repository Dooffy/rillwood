// SPDX-License-Identifier: GPL-3.0-or-later
// Apple TV Library (screen draft 05): type pills (All / Movies / Shows / Episodes) and Sort (a side panel) in one row
// under the tab bar; All → a Movies and a Shows shelf, one type → an endless grid (posters 6 across, episodes 4). No
// search field (Search is its own tab), no pull to refresh (no touch). Filter: a side panel too (`TvFilterPanel`).
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import type { BaseItemDto } from '@/api';
import { ActionSheet } from '@/components/ActionSheet';
import { PosterCard } from '@/components/Card';
import { loadErrorMessage, Message, Offline } from '@/components/Message';
import { PagedList } from '@/components/PagedList';
import { useShelfCards } from '@/components/shelfCards';
import { PosterRowsPlaceholder } from '@/components/Skeleton';
import { Text } from '@/components/Text';
import { TvFocusRow } from '@/components/tv/focus';
import { TvButton } from '@/components/tv/TvButton';
import { TvFilterPanel } from '@/components/tv/TvFilterPanel';
import { TvPill } from '@/components/tv/TvPill';
import { TvShelf } from '@/components/tv/TvShelf';
import { activeFilters, cardTitles, LIBRARY_SORTS, playback, posterImage, SEARCH_SCOPES, type Filters } from '@/items';
import { tabList, tv, useColors } from '@/theme';
import { useImage } from '@/useImage';
import { countLabel, emptyText, POSTER_ROWS, useLibrary } from '@/useLibrary';

/** "Filter", "Filter · Unwatched" (one on), "Filter · 3" (more). */
export function filterButtonLabel(filters: Filters): string {
  const on = activeFilters(filters);
  if (on.length === 0) return 'Filter';
  return `Filter · ${on.length === 1 ? on[0].label : on.length}`;
}

export function TvLibrary() {
  const lib = useLibrary();
  const { query, scope, groups, paged, offline } = lib;
  const c = useColors();
  const image = useImage();
  const { posters } = useShelfCards();
  const [sortOpen, setSortOpen] = useState(false);

  const poster = (item: BaseItemDto) => (
    <PosterCard
      key={item.Id}
      width={posters.width}
      {...cardTitles(item)}
      {...playback(item)}
      image={image(posterImage(item), posters.width)}
      item={item}
      onOpen={lib.open}
      onMenu={lib.onMenu}
    />
  );

  let body;
  if (!lib.all) {
    body = (
      <PagedList
        list={paged}
        layout={scope === 'episodes' ? 'episodes' : 'posters'}
        listKey={lib.listKey}
        testID="library-list"
        emptyText={emptyText(query)}
        header={
          paged.total !== undefined && paged.total > 0 ? (
            <Text secondary style={tv.type.caption}>
              {`${countLabel(scope, paged.total)} · by ${lib.sortLabel}`}
            </Text>
          ) : undefined
        }
      />
    );
  } else if (offline.offline) {
    // Out of reach with nothing loaded: the offline card alone, nothing to scroll.
    body = (
      <View style={styles.padded}>
        <Offline fill busy={offline.busy} retry={lib.retryAll} />
      </View>
    );
  } else if (!groups) {
    body = lib.failed ? (
      <View style={styles.padded}>
        <Message text={loadErrorMessage(lib.failed)} retry={lib.retryAll} />
      </View>
    ) : (
      <PosterRowsPlaceholder rows={2} />
    );
  } else if (groups.movies.length + groups.shows.length === 0) {
    body = (
      <View style={styles.padded}>
        <Message text={emptyText(query)} />
      </View>
    );
  } else {
    body = (
      <ScrollView {...tabList} testID="library-rows" contentContainerStyle={styles.rows}>
        {/* The full list of a type: its pill above. */}
        {POSTER_ROWS.map(
          ({ key, title }) =>
            groups[key].length > 0 && (
              <TvShelf key={key} title={title}>
                {groups[key].map(poster)}
              </TvShelf>
            ),
        )}
      </ScrollView>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      {lib.controls && (
        // Full width: a swipe up from any card lands on the pills (the last-focused one).
        <TvFocusRow style={styles.bar}>
          <View style={styles.pills}>
            {SEARCH_SCOPES.map((s) => (
              <TvPill key={s.key} label={s.label} selected={scope === s.key} onPress={() => lib.setScope(s.key)} />
            ))}
          </View>
          <View style={styles.pills}>
            <TvButton title={`Sort: ${lib.sortLabel}`} icon="arrow.up.arrow.down" onPress={() => setSortOpen(true)} />
            <TvButton
              title={filterButtonLabel(lib.filters)}
              icon="line.3.horizontal.decrease"
              onPress={lib.openFilters}
            />
          </View>
        </TvFocusRow>
      )}
      <View style={styles.fill}>{body}</View>
      <TvFilterPanel
        visible={lib.filtersOpen}
        value={lib.filters}
        genres={lib.genres}
        onChange={lib.setFilters}
        onClose={lib.closeFilters}
      />
      <ActionSheet
        visible={sortOpen}
        side
        title="Sort by"
        actions={LIBRARY_SORTS.map((o) => ({
          label: o.label,
          selected: o.key === lib.sort,
          onPress: () => lib.setSort(o.key),
        }))}
        onClose={() => setSortOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Under the system's tab bar.
  root: { flex: 1, paddingTop: tv.tabBarInset },
  fill: { flex: 1 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: tv.margin,
    // Room for a focused pill or button to grow.
    paddingVertical: tv.gap.sm,
  },
  pills: { flexDirection: 'row', gap: tv.gap.sm },
  rows: { gap: tv.gap.lg, paddingBottom: tv.gap.lg },
  padded: { paddingHorizontal: tv.margin },
});
