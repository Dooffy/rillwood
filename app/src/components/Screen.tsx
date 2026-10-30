// SPDX-License-Identifier: GPL-3.0-or-later
import type { ReactNode } from 'react';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { minTouch, pressedOpacity, spacing, useColors } from '@/theme';

import { Text } from './Text';

export type ScreenProps = {
  title: string;
  /** Makes the title a menu button ("Movies ⌄"): tapping it calls this (open a sheet of choices). */
  onTitlePress?: () => void;
  /** Next to the title (profile button, round icon buttons). */
  right?: ReactNode;
  /** false: content runs edge to edge (horizontal rows pad themselves). */
  padded?: boolean;
  children?: ReactNode;
};

/** Screen with its own large title (tabs). Stack screens with a native header use `Page`. */
export function Screen({ title, onTitlePress, right, padded = true, children }: ScreenProps) {
  const c = useColors();
  const heading = (
    <Text variant="largeTitle" accessibilityRole={onTitlePress ? undefined : 'header'}>
      {title}
    </Text>
  );
  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <View style={styles.header}>
        {onTitlePress ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={title}
            accessibilityHint="Opens a menu"
            onPress={onTitlePress}
            style={({ pressed }) => [styles.titleButton, pressed && styles.pressed]}
          >
            {heading}
            <SymbolView name={{ ios: 'chevron.down', android: 'expand_more' }} tintColor={c.textSecondary} size={18} />
          </Pressable>
        ) : (
          heading
        )}
        <View testID="screen-right" style={styles.right}>
          {right}
        </View>
      </View>
      <View style={[styles.body, padded && styles.padded]}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    // The same gap above every tab's content (the profile / filter buttons never touch it).
    paddingBottom: spacing.sm,
  },
  titleButton: { minHeight: minTouch, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
  pressed: { opacity: pressedOpacity },
  // Button height even when empty: every tab's header is the same height, so the title doesn't jump between tabs.
  right: { minHeight: minTouch, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  body: { flex: 1 },
  // No top padding: the header's gap is the one above the content on every tab.
  padded: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, gap: spacing.md },
});
