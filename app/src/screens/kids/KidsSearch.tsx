// SPDX-License-Identifier: GPL-3.0-or-later
// Kids search (docs/context/kids.md, Search; screen draft 02): the field focused once the screen is in, results with each
// letter - shows and movies as Home's posters (a show opens its page, a movie plays), then episodes as big stills (tap
// plays). Nothing before typing (Home already shows everything). ✕ back to Home; the term is forgotten.
import { router, useNavigation } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View, type TextInputInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CardPlaceholder } from '@/components/Card';
import { KidsEpisode, KidsPoster } from '@/components/kids/KidsCards';
import { LoadError, Message, Offline } from '@/components/Message';
import { SearchField } from '@/components/SearchField';
import { Text } from '@/components/Text';
import { playItem } from '@/navigation';
import { kids, pressedOpacity, scrollList, useColors, useWide } from '@/theme';
import { refreshKidsSearch, useKidsSearch } from '@/useKidsSearch';

import { kidsColumns, openKidsTitle } from './KidsHome';
import { episodeColumns } from './KidsShow';

/** The native stack's transition event (the router's own type doesn't list stack events). */
type StackEvents = {
  addListener: (event: 'transitionEnd', listener: (e: { data?: { closing?: boolean } }) => void) => () => void;
};

export function KidsSearch() {
  const [text, setText] = useState('');
  const search = useKidsSearch(text);
  const field = useRef<TextInputInstance>(null);
  const navigation = useNavigation() as unknown as StackEvents;
  // Keyboard up once the screen is in place: a field focused while its screen still animates in can take one key and
  // then stop (iOS).
  useEffect(
    () =>
      navigation.addListener('transitionEnd', (e) => {
        if (!e.data?.closing) field.current?.focus();
      }),
    [navigation],
  );
  const c = useColors();
  const insets = useSafeAreaInsets();
  const wide = useWide();
  const { width } = useWindowDimensions();
  const posters = kidsColumns(width, wide);
  const stills = episodeColumns(width, wide);

  return (
    <View style={[styles.fill, { paddingTop: insets.top, backgroundColor: c.background }]}>
      <View style={styles.top}>
        <View style={styles.field}>
          <SearchField ref={field} large value={text} onChangeText={setText} placeholder="Find a show" />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.close, { backgroundColor: c.elevated }, pressed && styles.pressed]}
        >
          <SymbolView
            name={{ ios: 'xmark', android: 'close' }}
            tintColor={c.text}
            size={kids.search.icon}
            weight="bold"
          />
        </Pressable>
      </View>
      <ScrollView
        {...scrollList}
        testID="kids-search"
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + kids.gap }]}
      >
        {search.offline.offline && <Offline busy={search.offline.busy} retry={refreshKidsSearch} />}
        {search.error && <LoadError error={search.error} retry={refreshKidsSearch} />}
        {search.empty && <Message text="Nothing called that." />}
        {search.loading && (
          <View testID="kids-search-loading" style={[styles.grid, { gap: posters.gap }]}>
            {Array.from({ length: posters.columns }, (_, i) => (
              <CardPlaceholder key={i} shape="poster" width={posters.tileWidth} />
            ))}
          </View>
        )}
        {search.titles.length > 0 && (
          <View style={styles.section}>
            <Text variant="label" secondary>
              Shows and movies
            </Text>
            <View style={[styles.grid, { gap: posters.gap }]}>
              {search.titles.map((item) => (
                <KidsPoster key={item.Id} item={item} width={posters.tileWidth} onOpen={openKidsTitle} />
              ))}
            </View>
          </View>
        )}
        {search.episodes.length > 0 && (
          <View style={styles.section}>
            <Text variant="label" secondary>
              Episodes
            </Text>
            <View style={[styles.grid, { gap: stills.gap }]}>
              {search.episodes.map((item) => (
                <KidsEpisode
                  key={item.Id}
                  item={item}
                  width={stills.tileWidth}
                  next={false}
                  withSeason={false}
                  onPlay={playItem}
                />
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: kids.grid.gap / 2,
    paddingHorizontal: kids.gutter,
    paddingTop: kids.gutter / 2,
    paddingBottom: kids.gutter,
  },
  field: { flex: 1 },
  close: {
    width: kids.search.field,
    height: kids.search.field,
    borderRadius: kids.search.field / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: pressedOpacity },
  content: { paddingHorizontal: kids.gutter, gap: kids.gap },
  section: { gap: kids.grid.gap / 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
});
