// SPDX-License-Identifier: GPL-3.0-or-later
// Kids show page (docs/context/kids.md, screen draft 03): the show's art and its title logo (else its name), then every
// episode as a big 16:9 picture - one column on phones, a grid on tablets - the next one marked ▶. Opens at the top. Tap
// plays. A big round Back, always on top.
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CardPlaceholder } from '@/components/Card';
import { KidsEpisode } from '@/components/kids/KidsCards';
import { LoadError, Message, Offline } from '@/components/Message';
import { Text } from '@/components/Text';
import { backdropImage, logoImage } from '@/items';
import { episodeRows } from '@/kids';
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
  // The show's title logo (its own lettering), else its name as text - also when the logo fails to load or offline.
  const logo = show.show ? image(logoImage(show.show), kids.show.logoWidth) : undefined;
  const [logoFailed, setLogoFailed] = useState<string>();
  const showLogo = logo !== undefined && logoFailed !== logo;

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
        {showLogo ? (
          <Image
            testID="kids-show-logo"
            source={logo}
            cachePolicy="memory-disk"
            contentFit="contain"
            style={styles.logo}
            onError={() => setLogoFailed(logo)}
            accessible
            accessibilityRole="header"
            accessibilityLabel={show.show?.Name ?? ''}
          />
        ) : (
          <Text style={[kids.type.show, styles.name]} numberOfLines={2} accessibilityRole="header">
            {show.show?.Name ?? ''}
          </Text>
        )}
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
      {/* Opens at the top (the header and the first season); the next episode is marked, not scrolled to. */}
      <FlatList
        // A new column count regroups the rows.
        key={columns}
        {...scrollList}
        testID="kids-show"
        data={rows}
        keyExtractor={(r) => r.key}
        ListHeaderComponent={header}
        ListEmptyComponent={placeholders}
        contentContainerStyle={[styles.content, { gap, paddingBottom: insets.bottom + kids.gap }]}
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
  logo: {
    alignSelf: 'center',
    width: kids.show.logoWidth,
    maxWidth: '80%',
    height: kids.show.logoHeight,
    marginBottom: kids.gap,
  },
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
