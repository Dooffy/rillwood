// SPDX-License-Identifier: GPL-3.0-or-later
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { minTouch, radii, spacing, useColors } from '@/theme';

import { Text } from './Text';

export type ButtonProps = {
  title: string;
  onPress: () => void;
  /** destructive = secondary surface with danger text (remove, sign out). */
  variant?: 'primary' | 'secondary' | 'destructive';
  loading?: boolean;
  disabled?: boolean;
  /** Symbol before the title (SF Symbol on iOS, Material Symbol on Android): `play.fill` on Play. */
  icon?: SymbolViewProps['name'];
};

export function Button({ title, onPress, variant = 'primary', loading = false, disabled = false, icon }: ButtonProps) {
  const c = useColors();
  const primary = variant === 'primary';
  const fg = primary ? c.onAccent : variant === 'destructive' ? c.danger : c.text;
  const inactive = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: primary ? c.accent : c.elevated },
        (pressed || disabled) && styles.dimmed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon && <SymbolView name={icon} tintColor={fg} size={16} />}
          <Text variant="button" style={[styles.title, { color: fg }]}>
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: minTouch,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { flexShrink: 1 },
  dimmed: { opacity: 0.5 },
});
