// SPDX-License-Identifier: GPL-3.0-or-later
// Kids Home (docs/context/kids.md, screen draft 01 + 08): one screen, no tabs. The brand lockup, then every show and
// movie once as a poster - two across on phones, more on tablets. A show opens its page, a movie plays. Phones and
// tablets only (no TV view).
import { router } from 'expo-router';
import { FlatList, RefreshControl, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { BaseItemDto } from '@/api';
import { CardPlaceholder } from '@/components/Card';
import { KidsBrand } from '@/components/kids/KidsBrand';
import { KidsPoster } from '@/components/kids/KidsCards';
import { LoadError, Message, Offline } from '@/components/Message';
import { playItem } from '@/navigation';
import { kids, scrollList, useColors, useWide } from '@/theme';
import { refreshKids, useKidsHome } from '@/useKidsHome';
import { usePullToRefresh } from '@/usePullToRefresh';

/** Poster grid: two across on phones; wide windows fit as many of at least `kids.grid.posterWide` as they can. */
export function kidsColumns(width: number, wide: boolean): { columns: number; tileWidth: number; gap: number } {
  const room = width - kids.gutter * 2;
  const gap = wide ? kids.grid.gapWide : kids.grid.gap;
  const columns = wide ? Math.max(3, Math.floor((room + gap) / (kids.grid.posterWide + gap))) : 2;
  return { columns, tileWidth: (room - (columns - 1) * gap) / columns, gap };
}

/** A show opens its kids page; a movie plays. Stable, so the memoised posters skip re-renders. */
export function openKidsTitle(item: BaseItemDto) {
  if (item.Type === 'Series') router.push({ pathname: '/kids-show/[id]', params: { id: item.Id } });
  else playItem(item);
}

export function KidsHome() {
  const home = useKidsHome();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const wide = useWide();
  const { width } = useWindowDimensions();
  const { columns, tileWidth, gap } = kidsColumns(width, wide);
  const { refreshing, onRefresh } = usePullToRefresh(home.loading, refreshKids);

  const header = (
    <View style={styles.header}>
      <View style={styles.bar}>
        <KidsBrand />
      </View>
      {home.offline.offline && <Offline busy={home.offline.busy} retry={refreshKids} />}
      {home.error && <LoadError error={home.error} retry={refreshKids} />}
      {home.empty && <Message text="Nothing to watch yet." />}
    </View>
  );

  const placeholders =
    home.loading && home.titles.length === 0 && !home.offline.offline ? (
      <View testID="kids-loading" style={[styles.grid, { gap }]}>
        {Array.from({ length: columns * 2 }, (_, i) => (
          <CardPlaceholder key={i} shape="poster" width={tileWidth} />
        ))}
      </View>
    ) : undefined;

  // The list starts under the status bar, so pull to refresh shows its spinner on screen (not behind the clock).
  return (
    <View style={[styles.fill, { paddingTop: insets.top, backgroundColor: c.background }]}>
      <FlatList
        // A new column count needs a new list (FlatList can't change numColumns in place).
        key={columns}
        {...scrollList}
        testID="kids-home"
        data={home.titles}
        numColumns={columns}
        keyExtractor={(item) => item.Id}
        ListHeaderComponent={header}
        ListEmptyComponent={placeholders}
        columnWrapperStyle={{ gap }}
        // Rows as far apart as columns: posters only, no titles under them.
        contentContainerStyle={[styles.content, { gap, paddingBottom: insets.bottom + kids.gap }]}
        renderItem={({ item }) => <KidsPoster item={item} width={tileWidth} onOpen={openKidsTitle} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.text} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingHorizontal: kids.gutter },
  header: { gap: kids.gap },
  bar: { flexDirection: 'row', alignItems: 'center', paddingTop: kids.gutter / 2, paddingHorizontal: kids.gutter / 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
});
