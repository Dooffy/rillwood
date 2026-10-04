// SPDX-License-Identifier: GPL-3.0-or-later
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { spacing } from '@/theme';

import { Text } from './Text';

export type ScreenProps = {
  title: string;
  /** Next to the title (profile button). */
  right?: ReactNode;
  /** false: content runs edge to edge (horizontal rows pad themselves). */
  padded?: boolean;
  children?: ReactNode;
};

/** Screen with its own large title (tabs). Stack screens with a native header use `Page`. */
export function Screen({ title, right, padded = true, children }: ScreenProps) {
  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <View style={styles.header}>
        <Text variant="largeTitle" accessibilityRole="header">
          {title}
        </Text>
        {right}
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
  },
  body: { flex: 1 },
  padded: { padding: spacing.md, gap: spacing.md },
});
