// SPDX-License-Identifier: GPL-3.0-or-later
// Apple TV Search tab (screen draft 06, keyboard on the left - decided 2026-11-11): the left column has the field (what's
// typed; a click opens the system's full-screen keyboard, dictation included - for now, see docs/open-items.md) and
// our on-screen keyboard
// (`TvKeyboard`); the right column has the results, updating as you type: Movies, Shows and Episodes shelves. Before
// anything is typed, recent searches there; nothing found: "No results for ...". Left / Right moves between keyboard
// and results. Same search as the phone's Library (`useLibrary`: debounced, one request per type).
import { ScrollView, StyleSheet, View } from 'react-native';

import type { BaseItemDto } from '@/api';
import { LandscapeCard, PosterCard } from '@/components/Card';
import { loadErrorMessage, Message, Offline } from '@/components/Message';
import { useShelfCards } from '@/components/shelfCards';
import { Text } from '@/components/Text';
import { TvFocusRow } from '@/components/tv/focus';
import { TvEmptyState } from '@/components/tv/TvEmptyState';
import { TvKeyboard } from '@/components/tv/TvKeyboard';
import { TvPill } from '@/components/tv/TvPill';
import { TvShelf } from '@/components/tv/TvShelf';
import { TvTextField } from '@/components/tv/TvTextField';
import { cardTitles, landscapeImage, playback, posterImage } from '@/items';
import { tabList, tv, useColors } from '@/theme';
import { useImage } from '@/useImage';
import { useLibrary } from '@/useLibrary';

export function TvSearch() {
  const lib = useLibrary();
  const c = useColors();
  const image = useImage();
  const { posters, landscape } = useShelfCards();
  const { term, groups } = lib;

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

  let results;
  if (!term) {
    results =
      lib.recent.length > 0 ? (
        <View style={styles.recent}>
          <Text secondary style={[tv.type.label, styles.heading]}>
            RECENT
          </Text>
          <TvFocusRow style={styles.pills}>
            {lib.recent.map((t) => (
              <TvPill key={t} label={t} onPress={() => lib.setText(t)} />
            ))}
          </TvFocusRow>
        </View>
      ) : null;
  } else if (lib.offline.offline) {
    results = (
      <View style={styles.padded}>
        <Offline busy={lib.offline.busy} retry={lib.retryAll} />
      </View>
    );
  } else if (!groups) {
    results = lib.failed ? (
      <View style={styles.padded}>
        <Message text={loadErrorMessage(lib.failed)} retry={lib.retryAll} />
      </View>
    ) : null;
  } else if (groups.movies.length + groups.shows.length + groups.episodes.length === 0) {
    results = (
      <TvEmptyState
        testID="tv-search-empty"
        icon="magnifyingglass"
        title={`No results for "${term}"`}
        text="Check the spelling or try another word."
      />
    );
  } else {
    results = (
      <>
        {groups.movies.length > 0 && (
          <TvShelf title="Movies" margin={tv.gap.sm}>
            {groups.movies.map(poster)}
          </TvShelf>
        )}
        {groups.shows.length > 0 && (
          <TvShelf title="Shows" margin={tv.gap.sm}>
            {groups.shows.map(poster)}
          </TvShelf>
        )}
        {groups.episodes.length > 0 && (
          <TvShelf title="Episodes" margin={tv.gap.sm}>
            {groups.episodes.map((ep) => (
              <LandscapeCard
                key={ep.Id}
                width={landscape.width}
                {...cardTitles(ep)}
                {...playback(ep)}
                image={image(landscapeImage(ep), landscape.width)}
                item={ep}
                onOpen={lib.open}
                onMenu={lib.onMenu}
              />
            ))}
          </TvShelf>
        )}
      </>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <View style={styles.left}>
        <TvTextField
          label="Search"
          icon="magnifyingglass"
          placeholder="Movies, shows, episodes"
          value={lib.text}
          onChangeText={lib.setText}
          onSubmitEditing={lib.submit}
        />
        <TvKeyboard
          onKey={(char) => lib.setText((t) => t + char)}
          onDelete={() => lib.setText((t) => t.slice(0, -1))}
          onClear={() => lib.setText('')}
        />
      </View>
      <ScrollView {...tabList} testID="tv-search-results" style={styles.right} contentContainerStyle={styles.results}>
        {results}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  // Under the system's tab bar; the keyboard column at the safe margin, the results to the screen's edge.
  root: { flex: 1, flexDirection: 'row', paddingTop: tv.tabBarInset, gap: tv.search.gap },
  left: { width: tv.search.columnWidth, marginLeft: tv.margin, gap: tv.gap.lg },
  right: { flex: 1 },
  results: { gap: tv.gap.lg, paddingBottom: tv.margin },
  recent: { gap: tv.gap.sm, paddingHorizontal: tv.gap.sm },
  heading: { letterSpacing: 1 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: tv.gap.sm / 2 },
  padded: { paddingHorizontal: tv.gap.sm, paddingRight: tv.margin },
});
