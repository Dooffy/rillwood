// SPDX-License-Identifier: GPL-3.0-or-later
import { StyleSheet, View } from 'react-native';

import { radii, spacing, useColors } from '@/theme';

import { Text } from './Text';

/** Small capsule facts in a wrapping line: "2010", "1h 53m", "PG", "4K". Read as one line by VoiceOver. */
export function Chips({ items }: { items: string[] }) {
  const c = useColors();
  if (items.length === 0) return null;
  return (
    <View accessible accessibilityLabel={items.join(', ')} style={styles.chips}>
      {items.map((item) => (
        <View key={item} style={[styles.chip, { backgroundColor: c.surface }]}>
          <Text variant="caption" secondary>
            {item}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs + 2 },
  chip: { borderRadius: radii.pill, paddingHorizontal: spacing.sm + 2, paddingVertical: spacing.xs },
});
