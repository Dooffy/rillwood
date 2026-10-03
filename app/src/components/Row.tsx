// SPDX-License-Identifier: GPL-3.0-or-later
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { minTouch, pressedOpacity, spacing } from '@/theme';

import { Chevron } from './List';
import { Text } from './Text';

export type RowProps = {
  title: string;
  /** Opens the full list; the header gets a chevron. */
  onPress?: () => void;
  /** Cards, scrolled horizontally. */
  children: ReactNode;
};

/** Home / detail shelf: section header (20/700, chevron when tappable) over a horizontal list of cards. */
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
          accessibilityLabel={title}
          accessibilityHint="Shows all"
          onPress={onPress}
          style={({ pressed }) => [styles.header, pressed && styles.pressed]}
        >
          {heading}
          <Chevron />
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
  pressed: { opacity: pressedOpacity },
  list: { paddingHorizontal: spacing.md, gap: spacing.sm + spacing.xs },
});
