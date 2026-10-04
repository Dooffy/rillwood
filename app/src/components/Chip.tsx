// SPDX-License-Identifier: GPL-3.0-or-later
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet } from 'react-native';

import { minTouch, pressedOpacity, radii, spacing, type, useColors } from '@/theme';

import { Text } from './Text';

export type ChipProps = {
  label: string;
  /** Filled with the accent (a chosen option). */
  selected?: boolean;
  /** Active filter tag: smaller, with ✕; tapping removes it. */
  removable?: boolean;
  onPress: () => void;
};

/** Small capsule: a toggle option (filter sheet) or, smaller with ✕, a removable active filter tag. */
export function Chip({ label, selected = false, removable = false, onPress }: ChipProps) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={removable ? `Remove ${label}` : label}
      accessibilityState={removable ? undefined : { selected }}
      onPress={onPress}
      // The capsule is 36pt; the hit area reaches 44pt.
      hitSlop={(minTouch - (removable ? TAG_HEIGHT : CHIP_HEIGHT)) / 2}
      style={({ pressed }) => [
        styles.chip,
        removable ? [styles.tag, { borderColor: c.elevated2 }] : { backgroundColor: selected ? c.accent : c.elevated },
        pressed && styles.pressed,
      ]}
    >
      <Text
        variant={removable ? 'caption' : 'label'}
        style={[{ color: selected ? c.onAccent : c.text }, removable && styles.tagText]}
      >
        {label}
      </Text>
      {removable && <SymbolView name={{ ios: 'xmark', android: 'close' }} tintColor={c.textSecondary} size={10} />}
    </Pressable>
  );
}

const CHIP_HEIGHT = 36;
/** Active filter tags: smaller and outlined, so they read as removable, not as options. */
const TAG_HEIGHT = 26;

const styles = StyleSheet.create({
  chip: {
    minHeight: CHIP_HEIGHT,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  tag: {
    minHeight: TAG_HEIGHT,
    paddingLeft: spacing.sm + spacing.xs,
    paddingRight: spacing.sm,
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  tagText: { fontWeight: type.label.fontWeight },
  pressed: { opacity: pressedOpacity },
});
