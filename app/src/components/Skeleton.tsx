// SPDX-License-Identifier: GPL-3.0-or-later
// Grey placeholders shaped like the content while it loads, where the layout is known (no bare spinner). Each is one
// element for screen readers ("Loading"); an accessible group isn't read part by part.
import type { ReactNode } from 'react';
import { StyleSheet, View, type DimensionValue, type ViewProps } from 'react-native';

import { minTouch, radii, spacing, useColors } from '@/theme';

import { CardPlaceholder } from './Card';
import { HERO_RATIO } from './DetailHero';
import { EPISODE_CARD_WIDTH } from './EpisodeCard';
import { EPISODE_ROW_STILL } from './EpisodeRow';
import { CARD_GAP } from './Row';

const EPISODE_ROWS = 6;

/** A grey block: a text line by default, or a box (`aspectRatio`, or a fixed `height`). */
function Bone({
  width = '100%',
  height = 14,
  aspectRatio,
  round = false,
}: {
  width?: DimensionValue;
  height?: number;
  aspectRatio?: number;
  round?: boolean;
}) {
  const c = useColors();
  return (
    <View
      style={{
        width,
        ...(aspectRatio ? { aspectRatio } : { height }),
        borderRadius: round ? radii.pill : radii.card / 2,
        backgroundColor: c.surface,
      }}
    />
  );
}

/** One "Loading" element for screen readers, whatever it draws. */
function Loading({
  label = 'Loading',
  testID,
  style,
  children,
}: {
  label?: string;
  testID?: string;
  style?: ViewProps['style'];
  children: ReactNode;
}) {
  return (
    <View testID={testID} accessible accessibilityLabel={label} style={style}>
      {children}
    </View>
  );
}

/**
 * A row of grey cards (a shelf loading). No padding: inside a `Row`, or padded by the caller. With a `label` it is the
 * "Loading" element itself; without, part of a bigger placeholder.
 */
export function CardRowPlaceholder({
  shape,
  width,
  count = 3,
  label,
  testID,
}: {
  shape: 'poster' | 'landscape';
  width?: number;
  count?: number;
  label?: string;
  testID?: string;
}) {
  return (
    <View testID={testID} accessible={!!label} accessibilityLabel={label} style={styles.cardRow}>
      {Array.from({ length: count }, (_, i) => (
        <CardPlaceholder key={i} shape={shape} width={width} />
      ))}
    </View>
  );
}

/** Movie / episode / series detail before the item loads: hero art, title, the action row, overview lines. */
export function DetailPlaceholder() {
  return (
    <Loading testID="detail-placeholder" style={styles.detail}>
      <Bone aspectRatio={1 / HERO_RATIO} />
      <View style={styles.body}>
        <View style={styles.title}>
          <Bone width="60%" height={28} />
          <Bone width="35%" />
        </View>
        <View style={styles.actions}>
          <View style={styles.play}>
            <Bone height={minTouch} round />
          </View>
          <Bone width={minTouch} height={minTouch} round />
          <Bone width={minTouch} height={minTouch} round />
        </View>
        <Bone />
        <Bone />
        <Bone width="70%" />
      </View>
    </Loading>
  );
}

/** A season's episode cards before they load (series screen). */
export function EpisodeCardsPlaceholder() {
  return (
    <View style={styles.padded}>
      <CardRowPlaceholder
        testID="episodes-placeholder"
        shape="landscape"
        width={EPISODE_CARD_WIDTH}
        count={2}
        label="Loading episodes"
      />
    </View>
  );
}

/** Episodes as a vertical list (Library, Episodes) before the first page. */
export function EpisodeRowsPlaceholder() {
  return (
    <Loading testID="episode-rows-placeholder" style={styles.rows}>
      {Array.from({ length: EPISODE_ROWS }, (_, i) => (
        <View key={i} style={styles.row}>
          <Bone width={EPISODE_ROW_STILL} aspectRatio={16 / 9} />
          <View style={styles.rowText}>
            <Bone width="70%" />
            <Bone width="45%" />
          </View>
        </View>
      ))}
    </Loading>
  );
}

/** A poster grid's first page loading (Library Movies / Shows): `columns` posters `width` wide, three rows. */
export function PosterGridPlaceholder({ columns, width }: { columns: number; width: number }) {
  return (
    <Loading testID="poster-grid-placeholder" style={styles.grid}>
      {Array.from({ length: columns * 3 }, (_, i) => (
        <CardPlaceholder key={i} shape="poster" width={width} />
      ))}
    </Loading>
  );
}

/** Rows of posters (Library browse / search) before they load: a heading bar over a few cards, like a `Row`. */
export function PosterRowsPlaceholder({ rows = 2 }: { rows?: number }) {
  return (
    <Loading testID="poster-rows-placeholder" style={styles.posterRows}>
      {Array.from({ length: rows }, (_, i) => (
        <View key={i}>
          <View style={styles.heading}>
            <Bone width={120} height={20} />
          </View>
          <View style={styles.padded}>
            <CardRowPlaceholder shape="poster" />
          </View>
        </View>
      ))}
    </Loading>
  );
}

const styles = StyleSheet.create({
  detail: { gap: spacing.lg },
  body: { paddingHorizontal: spacing.md, gap: spacing.md },
  title: { alignItems: 'center', gap: spacing.sm },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  play: { flex: 1 },
  // Cards past the screen edge are cut off, as in a row that scrolls.
  cardRow: { flexDirection: 'row', gap: CARD_GAP, overflow: 'hidden' },
  padded: { paddingHorizontal: spacing.md },
  rows: { gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + spacing.xs },
  rowText: { flex: 1, gap: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: CARD_GAP },
  posterRows: { gap: spacing.lg },
  // Same height as a `Row` heading.
  heading: { minHeight: minTouch, justifyContent: 'center', paddingHorizontal: spacing.md },
});
