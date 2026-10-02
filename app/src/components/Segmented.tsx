// SPDX-License-Identifier: GPL-3.0-or-later
import { Pressable, StyleSheet, View } from 'react-native';

import { minTouch, radii, spacing, useColors } from '@/theme';

import { Text } from './Text';

export type SegmentedProps<T extends string> = {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
};

export function Segmented<T extends string>({ options, value, onChange }: SegmentedProps<T>) {
  const c = useColors();
  return (
    <View accessibilityRole="radiogroup" style={[styles.track, { backgroundColor: c.elevated }]}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityLabel={o.label}
            accessibilityState={{ checked: selected }}
            onPress={() => onChange(o.value)}
            style={[styles.segment, selected && { backgroundColor: c.elevated2 }]}
          >
            <Text variant="label">{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', borderRadius: radii.pill, padding: 2 },
  segment: {
    flex: 1,
    minHeight: minTouch,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
});
