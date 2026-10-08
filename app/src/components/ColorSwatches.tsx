// SPDX-License-Identifier: GPL-3.0-or-later
import { Pressable, StyleSheet, View } from 'react-native';

import { minTouch, radii, spacing, useColors } from '@/theme';

/** Row of colour presets (radio group): a filled circle each, the picked one ringed. */
export function ColorSwatches<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: string;
  onChange: (value: T) => void;
}) {
  const c = useColors();
  return (
    <View accessibilityRole="radiogroup" style={styles.row}>
      {options.map(({ value: color, label }) => {
        const selected = color === value;
        return (
          <Pressable
            key={color}
            accessibilityRole="radio"
            accessibilityLabel={label}
            accessibilityState={{ checked: selected }}
            onPress={() => onChange(color)}
            style={[styles.ring, { borderColor: selected ? c.text : 'transparent' }]}
          >
            <View style={[styles.swatch, { backgroundColor: color, borderColor: c.separator }]} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md, padding: spacing.sm },
  ring: {
    width: minTouch,
    height: minTouch,
    borderRadius: radii.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatch: { width: 32, height: 32, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth },
});
