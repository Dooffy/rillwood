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
  /** Bigger circle (the player's play / pause). */
  large?: boolean;
  /** Toggle (watched, favourite): on = the filled look, read out as selected. */
  selected?: boolean;
};

/** Round icon button (Apple TV style). */
export function IconButton({ icon, label, onPress, variant = 'secondary', selected, large }: IconButtonProps) {
  const c = useColors();
  const primary = variant === 'primary' || selected === true;
  const size = large ? styles.large : undefined;
  const iconSize = large ? 30 : 20;
  if (variant === 'glass') {
    // No pressed opacity on glass (Apple: glass must stay opaque); the glass gives its own press feedback.
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}>
        <Glass interactive style={[styles.base, size]}>
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
        size,
        variant !== 'plain' && { backgroundColor: primary ? c.accent : c.elevated },
        pressed && styles.pressed,
      ]}
    >
      <SymbolView name={icon} tintColor={primary ? c.onAccent : c.text} size={iconSize} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    width: minTouch,
    height: minTouch,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  large: { width: minTouch * 1.6, height: minTouch * 1.6 },
  pressed: { opacity: pressedOpacity },
});
