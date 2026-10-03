// SPDX-License-Identifier: GPL-3.0-or-later
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, StyleSheet } from 'react-native';

import { minTouch, pressedOpacity, radii, useColors } from '@/theme';

export type IconButtonProps = {
  /** SF Symbol on iOS, Material Symbol on Android. */
  icon: SymbolViewProps['name'];
  /** Accessibility label - icon buttons have no visible text. */
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
};

/** Round icon button (Apple TV style). */
export function IconButton({ icon, label, onPress, variant = 'secondary' }: IconButtonProps) {
  const c = useColors();
  const primary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: primary ? c.accent : c.elevated },
        pressed && styles.pressed,
      ]}
    >
      <SymbolView name={icon} tintColor={primary ? c.onAccent : c.text} size={20} />
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
  pressed: { opacity: pressedOpacity },
});
