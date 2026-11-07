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
export function fitCards(width: number, target: number, min = 1, gap = CARD_GAP): { count: number; width: number } {
  const count = Math.max(min, Math.floor((width + gap) / (target + gap)));
  return { count, width: Math.floor((width - (count - 1) * gap) / count) };
}

export type RowProps = {
  title: string;
  /** Opens the full list; the header gets "See All ›". */
  onPress?: () => void;
  /** Cards, scrolled horizontally. */
  children?: ReactNode;
  /** A long shelf: its own horizontal list (virtualised, `rowListContent`) instead of `children` in a ScrollView. */
  list?: ReactNode;
};

/** Home / detail shelf: section header (20/700, "See All ›" when tappable) over a horizontal list of cards. */
export function Row({ title, onPress, children, list }: RowProps) {
  return (
    <View style={styles.row}>
      {/* The title stays a header for VoiceOver's headings rotor; See All is its own button beside it. */}
      <View style={styles.header}>
        <Text variant="sectionHeader" accessibilityRole="header" numberOfLines={1} style={styles.title}>
          {title}
        </Text>
        {onPress && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${title}, See All`}
            hitSlop={spacing.sm}
            onPress={onPress}
            style={({ pressed }) => [styles.seeAll, pressed && styles.pressed]}
          >
            <Text variant="label" secondary>
              See All
            </Text>
            <Chevron />
          </Pressable>
        )}
      </View>
      {list ?? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.list}>
          {children}
        </ScrollView>
      )}
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
    justifyContent: 'space-between',
  },
  title: { flexShrink: 1 },
  // A touch target tall (the header's height); `hitSlop` widens it.
  seeAll: { minHeight: minTouch, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  pressed: { opacity: pressedOpacity },
  list: { paddingHorizontal: spacing.md, gap: CARD_GAP },
});

/** Padding and card gap of a shelf's own horizontal list (`Row` `list`). */
export const rowListContent = styles.list;
