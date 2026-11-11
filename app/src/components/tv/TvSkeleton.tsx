// SPDX-License-Identifier: GPL-3.0-or-later
// Apple TV placeholders, laid out like the TV screens they stand in for - the phone / tablet ones would put the
// content somewhere else, and it would jump when it loads.
import { StyleSheet, View } from 'react-native';

import { tv, useColors } from '@/theme';

import { Bone, Loading } from '../Skeleton';

/** Movie / episode detail (`TvItemDetail`): the text and play row bottom left, the credits bottom right. */
export function TvDetailPlaceholder() {
  const c = useColors();
  return (
    <Loading testID="tv-detail-placeholder" style={[styles.fill, { backgroundColor: c.background }]}>
      <View style={styles.onArt}>
        <View style={styles.text}>
          <Bone width="60%" height={tv.type.title.fontSize} />
          <Bone width="35%" height={tv.type.body.fontSize} />
          <View style={styles.lines}>
            <Bone height={tv.type.body.fontSize} />
            <Bone height={tv.type.body.fontSize} />
            <Bone width="70%" height={tv.type.body.fontSize} />
          </View>
          <Bone width="45%" height={tv.type.caption.fontSize} />
        </View>
        <View style={styles.buttons}>
          <Bone width={tv.detail.placeholderPlayWidth} height={tv.button.height} round />
          <Bone width={tv.button.height} height={tv.button.height} round />
          <Bone width={tv.button.height} height={tv.button.height} round />
        </View>
      </View>
      <View style={styles.credits}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={styles.credit}>
            <Bone width="30%" height={tv.type.label.fontSize} />
            <Bone width="80%" height={tv.type.caption.fontSize} />
          </View>
        ))}
      </View>
    </Loading>
  );
}

// Same places as `TvItemDetail`.
const styles = StyleSheet.create({
  fill: { flex: 1 },
  onArt: { position: 'absolute', left: 0, right: 0, bottom: tv.marginTop, gap: tv.gap.lg },
  text: { marginLeft: tv.margin, width: tv.hero.textWidth, gap: tv.gap.sm },
  lines: { gap: tv.gap.sm / 2 },
  buttons: { flexDirection: 'row', gap: tv.gap.sm, paddingHorizontal: tv.margin },
  credits: {
    position: 'absolute',
    right: tv.margin,
    bottom: tv.marginTop,
    width: tv.detail.creditsWidth,
    gap: tv.gap.sm,
  },
  credit: { gap: tv.gap.sm / 2 },
});
