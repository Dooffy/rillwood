// SPDX-License-Identifier: GPL-3.0-or-later
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { spacing } from '@/theme';

import { Text } from './Text';

/** Screen with its own large title (tabs). Stack screens with a native header use `Page`. */
export function Screen({ title, right, children }: { title: string; right?: ReactNode; children?: ReactNode }) {
  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <View style={styles.header}>
        <Text variant="largeTitle" accessibilityRole="header">
          {title}
        </Text>
        {right}
      </View>
      <View style={styles.body}>{children}</View>
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
  body: { flex: 1, padding: spacing.md, gap: spacing.md },
});
