// SPDX-License-Identifier: GPL-3.0-or-later
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { minTouch, pressedOpacity, spacing } from '@/theme';

import { Chevron } from './List';
import { Text } from './Text';

/** Space between cards in a row. */
export const CARD_GAP = spacing.sm + spacing.xs;

/**
 * Whole cards across `width` (no padding in it): as many as fit at least `target` wide, but never fewer than `min`
 * (then narrower). The count and the card width. Tablet rows and the Library grid - the row ends on a card's edge.
 */
export function fitCards(width: number, target: number, min = 1): { count: number; width: number } {
  const count = Math.max(min, Math.floor((width + CARD_GAP) / (target + CARD_GAP)));
  return { count, width: Math.floor((width - (count - 1) * CARD_GAP) / count) };
}

export type RowProps = {
  title: string;
  /** Opens the full list; the header gets "See All ›". */
  onPress?: () => void;
  /** Cards, scrolled horizontally. */
  children: ReactNode;
};

/** Home / detail shelf: section header (20/700, "See All ›" when tappable) over a horizontal list of cards. */
export function Row({ title, onPress, children }: RowProps) {
  const heading = (
    <Text variant="sectionHeader" accessibilityRole={onPress ? undefined : 'header'} numberOfLines={1}>
      {title}
    </Text>
  );
  return (
    <View style={styles.row}>
      {onPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${title}, See All`}
          onPress={onPress}
          style={({ pressed }) => [styles.header, styles.wide, pressed && styles.pressed]}
        >
          {heading}
          <View style={styles.seeAll}>
            <Text variant="label" secondary>
              See All
            </Text>
            <Chevron />
          </View>
        </Pressable>
      ) : (
        <View style={styles.header}>{heading}</View>
      )}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.list}>
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.xs },
  header: {
    minHeight: minTouch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    alignSelf: 'flex-start',
  },
  // Tappable header: title left, See All right, across the row.
  wide: { alignSelf: 'stretch', justifyContent: 'space-between' },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  pressed: { opacity: pressedOpacity },
  list: { paddingHorizontal: spacing.md, gap: CARD_GAP },
});
