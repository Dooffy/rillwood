// SPDX-License-Identifier: GPL-3.0-or-later
// Kids show page (docs/context/kids.md, screen draft 03): the show's art and name, then every episode as a big 16:9
// picture - one column on phones, a grid on tablets - the next one marked ▶ and scrolled into view. Tap plays. A big round
// Back, always on top.
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useRef } from 'react';
import { FlatList, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CardPlaceholder } from '@/components/Card';
import { KidsEpisode } from '@/components/kids/KidsCards';
import { LoadError, Message, Offline } from '@/components/Message';
import { Text } from '@/components/Text';
import { backdropImage } from '@/items';
import { episodeRows, type EpisodeRow } from '@/kids';
import { playItem } from '@/navigation';
import { backdrop, kids, onArtwork, pressedOpacity, scrollList, spacing, useColors, useWide } from '@/theme';
import { useImage } from '@/useImage';
import { refreshKidsShow, useKidsShow } from '@/useKidsShow';

/** Episode grid: one column on phones; wide windows fit as many of at least `kids.show.episodeWide` as they can. */
export function episodeColumns(width: number, wide: boolean): { columns: number; tileWidth: number; gap: number } {
  const room = width - kids.gutter * 2;
  const gap = wide ? kids.grid.gapWide : kids.grid.gap;
  const columns = wide ? Math.max(2, Math.floor((room + gap) / (kids.show.episodeWide + gap))) : 1;
  return { columns, tileWidth: (room - (columns - 1) * gap) / columns, gap };
}

/** Where the next episode sits when the page opens: under the header, in the top third. */
const NEXT_OFFSET = 120;

export function KidsShow({ id }: { id: string }) {
  const show = useKidsShow(id);
  const c = useColors();
  const image = useImage();
  const insets = useSafeAreaInsets();
  const wide = useWide();
  const { width } = useWindowDimensions();
  const { columns, tileWidth, gap } = episodeColumns(width, wide);
  const rows = useMemo(() => episodeRows(show.episodes, columns), [show.episodes, columns]);
  const withSeason = rows.some((r) => r.kind === 'season');
  const list = useRef<FlatList<EpisodeRow>>(null);

  // Open with the next episode in view, once per page (not again after a refetch).
  const nextRow = rows.findIndex((r) => r.kind === 'episodes' && r.items.some((e) => e.Id === show.nextId));
  const scrolled = useRef(false);
  useEffect(() => {
    if (scrolled.current || nextRow <= 0) return;
    scrolled.current = true;
    list.current?.scrollToIndex({ index: nextRow, viewOffset: NEXT_OFFSET, animated: false });
  }, [nextRow]);

  const header = (
    <View style={styles.headerWrap}>
      <View style={[styles.head, { height: kids.show.header + insets.top, backgroundColor: c.surface }]}>
        {show.show && (
          <Image
            source={image(backdropImage(show.show), width) ?? show.art.get(id)}
            cachePolicy="memory-disk"
            contentFit="cover"
            transition={150}
            style={StyleSheet.absoluteFill}
            accessible={false}
          />
        )}
        <View style={styles.fade} />
        <Text style={[kids.type.show, styles.name]} numberOfLines={2} accessibilityRole="header">
          {show.show?.Name ?? ''}
        </Text>
      </View>
      {show.offline.offline && <Offline busy={show.offline.busy} retry={() => refreshKidsShow(id)} />}
      {show.error && <LoadError error={show.error} retry={() => refreshKidsShow(id)} />}
      {(show.empty || (!show.loading && show.episodes.length > 0 && rows.length === 0)) && (
        <Message text={show.downloaded ? 'None of its episodes are on this phone.' : 'No episodes yet.'} />
      )}
    </View>
  );

  const placeholders =
    show.loading && rows.length === 0 && !show.offline.offline ? (
      <View testID="kids-show-loading" style={[styles.row, { gap }]}>
        {Array.from({ length: columns }, (_, i) => (
          <CardPlaceholder key={i} shape="landscape" width={tileWidth} />
        ))}
      </View>
    ) : undefined;

  return (
    <View style={[styles.fill, { backgroundColor: c.background }]}>
      <FlatList
        ref={list}
        // A new column count regroups the rows.
        key={columns}
        {...scrollList}
        testID="kids-show"
        data={rows}
        keyExtractor={(r) => r.key}
        ListHeaderComponent={header}
        ListEmptyComponent={placeholders}
        contentContainerStyle={[styles.content, { gap, paddingBottom: insets.bottom + kids.gap }]}
        // The next episode not drawn yet (a long show): jump near it, then onto it once those rows are drawn.
        onScrollToIndexFailed={({ index, averageItemLength }) => {
          list.current?.scrollToOffset({ offset: index * averageItemLength, animated: false });
          setTimeout(() => list.current?.scrollToIndex({ index, viewOffset: NEXT_OFFSET, animated: false }), 100);
        }}
        renderItem={({ item: row }) =>
          row.kind === 'season' ? (
            <View style={styles.divider}>
              <View style={[styles.line, { backgroundColor: c.separator }]} />
              <Text variant="label" secondary>{`Season ${row.season}`}</Text>
              <View style={[styles.line, { backgroundColor: c.separator }]} />
            </View>
          ) : (
            <View style={[styles.row, { gap }]}>
              {row.items.map((episode) => (
                <KidsEpisode
                  key={episode.Id}
                  item={episode}
                  width={tileWidth}
                  next={episode.Id === show.nextId}
                  withSeason={withSeason}
                  onPlay={playItem}
                  art={show.art.get(episode.Id)}
                />
              ))}
            </View>
          )
        }
      />
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Back"
        style={({ pressed }) => [styles.back, { top: insets.top + kids.gutter / 2 }, pressed && styles.pressed]}
      >
        <SymbolView
          name={{ ios: 'chevron.left', android: 'arrow_back' }}
          tintColor={onArtwork.fill}
          size={kids.show.backIcon}
          weight="bold"
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingHorizontal: kids.gutter },
  // The header runs edge to edge over the list's side padding.
  headerWrap: { marginHorizontal: -kids.gutter, gap: kids.gap },
  head: {
    borderBottomLeftRadius: kids.show.headerRadius,
    borderBottomRightRadius: kids.show.headerRadius,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '55%', backgroundImage: onArtwork.fade },
  name: {
    color: onArtwork.fill,
    textAlign: 'center',
    paddingHorizontal: kids.show.titleInset,
    paddingBottom: kids.gap,
  },
  row: { flexDirection: 'row' },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md - spacing.xs,
    paddingHorizontal: kids.gutter / 4,
  },
  line: { flex: 1, height: StyleSheet.hairlineWidth },
  back: {
    position: 'absolute',
    left: kids.gutter,
    width: kids.show.back,
    height: kids.show.back,
    borderRadius: kids.show.back / 2,
    backgroundColor: backdrop,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: pressedOpacity },
});
