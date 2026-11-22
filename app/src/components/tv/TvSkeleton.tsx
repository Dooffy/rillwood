// SPDX-License-Identifier: GPL-3.0-or-later
// Apple TV placeholders, laid out like the TV screens they stand in for - the phone / tablet ones would put the
// content somewhere else, and it would jump when it loads. Text stands in as line-high bones (`TextBone`), with the
// screen's own paddings and gaps.
import { StyleSheet, View } from 'react-native';

import { tv, useColors } from '@/theme';

import { useShelfCards } from '../shelfCards';
import { Bone, CardRowPlaceholder, Loading } from '../Skeleton';
import { Text, TextBone } from '../Text';
import { tvShelfListContent } from './TvShelf';

/** Badges (4K, 5.1, CC) the usual item has. */
const BADGES = ['XXXX', 'XXX', 'XX'];

/**
 * Movie / episode / series detail (`TvDetailScreen`): the text and play row bottom left, the credits bottom right.
 * Shaped like a movie with a long summary (three lines + More), facts and badges; both columns grow up from the bottom,
 * so the play row stays put whatever loads.
 */
export function TvDetailPlaceholder() {
  const c = useColors();
  return (
    <Loading testID="tv-detail-placeholder" style={[styles.fill, { backgroundColor: c.background }]}>
      <View style={styles.onArt}>
        <View testID="tv-detail-placeholder-text" style={styles.text}>
          <TextBone style={tv.type.title} width="60%" />
          <TextBone style={tv.type.body} width="35%" />
          <View style={styles.summary}>
            <TextBone style={tv.type.body} />
            <TextBone style={tv.type.body} />
            <TextBone style={tv.type.body} width="70%" />
            <TextBone style={tv.type.label} width={tv.detail.placeholderMoreWidth} />
          </View>
          <TextBone style={tv.type.caption} width="45%" />
          <View style={styles.badges}>
            {BADGES.map((b) => (
              <View key={b} style={[styles.badge, { backgroundColor: c.surface }]}>
                {/* Sets the badge's size; hidden. */}
                <Text style={[tv.type.label, styles.hidden]}>{b}</Text>
              </View>
            ))}
          </View>
        </View>
        <View style={styles.buttons}>
          <Bone width={tv.detail.placeholderPlayWidth} height={tv.button.height} round />
          <Bone width={tv.button.height} height={tv.button.height} round />
          <Bone width={tv.button.height} height={tv.button.height} round />
        </View>
      </View>
      <View style={styles.credits}>
        {[0, 1, 2].map((i) => (
          <View key={i}>
            <TextBone style={tv.type.label} width="30%" />
            <TextBone style={tv.type.caption} width="80%" />
          </View>
        ))}
      </View>
    </Loading>
  );
}

/** A `TvShelf` loading: its title and poster row, in the shelf's own paddings. */
function TvShelfPlaceholder() {
  const { posters } = useShelfCards();
  return (
    <View>
      <View style={styles.shelfTitle}>
        <TextBone style={tv.type.shelf} width={tv.shelf.placeholderTitleWidth} />
      </View>
      <View style={tvShelfListContent}>
        <CardRowPlaceholder shape="poster" width={posters.width} count={posters.count} />
      </View>
    </View>
  );
}

/** Poster shelves loading (Library, All), as one "Loading" element; spaced like the loaded shelves. */
export function TvShelvesPlaceholder({ rows, gap }: { rows: number; gap: number }) {
  return (
    <Loading testID="tv-shelves-placeholder" style={{ gap }}>
      {Array.from({ length: rows }, (_, i) => (
        <TvShelfPlaceholder key={i} />
      ))}
    </Loading>
  );
}

// Same places as `TvDetailScreen` and `TvShelf`.
const styles = StyleSheet.create({
  fill: { flex: 1 },
  onArt: { position: 'absolute', left: 0, right: 0, bottom: tv.marginTop, gap: tv.gap.lg },
  text: { marginLeft: tv.margin, maxWidth: tv.hero.textWidth, gap: tv.gap.sm / 2 },
  summary: { paddingVertical: tv.gap.sm / 2 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: tv.gap.sm / 2, paddingTop: tv.gap.sm / 2 },
  badge: {
    borderWidth: tv.detail.badge.border,
    borderColor: 'transparent',
    borderRadius: tv.detail.badge.radius,
    paddingHorizontal: tv.detail.badge.paddingHorizontal,
    paddingVertical: tv.detail.badge.paddingVertical,
  },
  hidden: { color: 'transparent' },
  buttons: { flexDirection: 'row', alignItems: 'center', gap: tv.gap.sm, paddingHorizontal: tv.margin },
  credits: {
    position: 'absolute',
    right: tv.margin,
    bottom: tv.marginTop,
    width: tv.detail.creditsWidth,
    gap: tv.gap.sm,
  },
  shelfTitle: { paddingHorizontal: tv.margin },
});
