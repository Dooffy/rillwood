// SPDX-License-Identifier: GPL-3.0-or-later
import { StyleSheet, View } from 'react-native';

import type { Credit } from '@/detail';
import { spacing } from '@/theme';

import { Text } from './Text';

/**
 * The hero's credits on wide screens: Starring, Director, Writers, Studio, a label over its names, in a column beside
 * the hero text. Phones leave them out - Cast & Crew right under the hero names the same people.
 */
export function Credits({ credits }: { credits: Credit[] }) {
  if (credits.length === 0) return null;
  return (
    <View testID="credits" style={styles.column}>
      {credits.map(({ label, names }) => (
        <View key={label} accessible accessibilityLabel={`${label}: ${names.join(', ')}`}>
          <Text variant="label">{label}</Text>
          <Text secondary numberOfLines={2}>
            {names.join(', ')}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: spacing.sm },
});
