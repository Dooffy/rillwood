// SPDX-License-Identifier: GPL-3.0-or-later
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, StyleSheet } from 'react-native';

import { Glass } from '@/components/Glass';
import { minTouch, pressedOpacity, radii, useColors } from '@/theme';

export type IconButtonProps = {
  /** SF Symbol on iOS, Material Symbol on Android. */
  icon: SymbolViewProps['name'];
  /** Accessibility label - icon buttons have no visible text. */
  label: string;
  onPress: () => void;
  /** plain: no circle (header bar buttons, where iOS draws its own). glass: over video (player). */
  variant?: 'primary' | 'secondary' | 'plain' | 'glass';
  /** Bigger circle: the player's play / pause (large), its centre buttons on tablets (large, play / pause xlarge). */
  size?: 'large' | 'xlarge';
  /** Toggle (watched, favourite): on = the filled look, read out as selected. */
  selected?: boolean;
};

/** Round icon button (Apple TV style). */
export function IconButton({ icon, label, onPress, variant = 'secondary', selected, size }: IconButtonProps) {
  const c = useColors();
  const primary = variant === 'primary' || selected === true;
  const { box, icon: iconSize } = SIZES[size ?? 'regular'];
  if (variant === 'glass') {
    // No pressed opacity on glass (Apple: glass must stay opaque); the glass gives its own press feedback.
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}>
        <Glass interactive style={[styles.base, box]}>
          <SymbolView name={icon} tintColor={c.text} size={iconSize} />
        </Glass>
      </Pressable>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={selected === undefined ? undefined : { selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        box,
        variant !== 'plain' && { backgroundColor: primary ? c.accent : c.elevated },
        pressed && styles.pressed,
      ]}
    >
      <SymbolView name={icon} tintColor={primary ? c.onAccent : c.text} size={iconSize} />
    </Pressable>
  );
}

const SIZES = {
  regular: { box: undefined, icon: 20 },
  large: { box: { width: minTouch * 1.6, height: minTouch * 1.6 }, icon: 30 },
  xlarge: { box: { width: minTouch * 2, height: minTouch * 2 }, icon: 36 },
} as const;

const styles = StyleSheet.create({
  base: {
    width: minTouch,
    height: minTouch,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: pressedOpacity },
});
