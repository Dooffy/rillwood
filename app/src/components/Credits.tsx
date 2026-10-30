// SPDX-License-Identifier: GPL-3.0-or-later
import { StyleSheet, View } from 'react-native';

import type { Credit } from '@/detail';
import { spacing } from '@/theme';

import { Text } from './Text';

/**
 * The hero's credits: Starring, Director, Writers, Studio. `column`: a label over its names (beside the hero text on
 * wide screens); `inline`: "Director Jun Aldren" on one line each (under the summary on phones).
 */
export function Credits({ credits, layout }: { credits: Credit[]; layout: 'column' | 'inline' }) {
  if (credits.length === 0) return null;
  return (
    <View testID="credits" style={layout === 'column' ? styles.column : styles.inline}>
      {credits.map(({ label, names }) =>
        layout === 'column' ? (
          <View key={label} accessible accessibilityLabel={`${label}: ${names.join(', ')}`}>
            <Text variant="label">{label}</Text>
            <Text secondary numberOfLines={2}>
              {names.join(', ')}
            </Text>
          </View>
        ) : (
          <Text key={label} secondary numberOfLines={2}>
            <Text variant="label">{label} </Text>
            {names.join(', ')}
          </Text>
        ),
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: spacing.sm },
  inline: { gap: spacing.xs },
});
