// SPDX-License-Identifier: GPL-3.0-or-later
// Apple TV button. primary = the screen's main action (filled), default = translucent capsule, quiet = text only (a
// second way or a way out) - all turn the palette's text colour, scale up and lift when focused.
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { ComponentRef, Ref } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { pressedOpacity, radii, tv, useColors } from '@/theme';

import { Text } from './Text';

/** What a ref to a TvButton holds (a focus guide destination). */
export type TvButtonHandle = ComponentRef<typeof Pressable>;

export type TvButtonProps = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'default' | 'quiet';
  /** SF Symbol before the title. */
  icon?: SymbolViewProps['name'];
  /** Fills its column (a form's main button). */
  wide?: boolean;
  loading?: boolean;
  disabled?: boolean;
  /** Takes focus when the screen opens. */
  preferredFocus?: boolean;
  /** For a focus guide's destination. */
  ref?: Ref<TvButtonHandle>;
};

export function TvButton({
  title,
  onPress,
  variant = 'default',
  icon,
  wide = false,
  loading = false,
  disabled = false,
  preferredFocus,
  ref,
}: TvButtonProps) {
  const c = useColors();
  const inactive = disabled || loading;
  const quiet = variant === 'quiet';
  const fill = variant === 'primary' ? c.accent : quiet ? 'transparent' : tv.unfocused;
  const ink = (focused: boolean) =>
    focused ? c.background : variant === 'primary' ? c.onAccent : quiet ? c.textSecondary : c.text;
  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: inactive, busy: loading }}
      onPress={inactive ? undefined : onPress}
      hasTVPreferredFocus={preferredFocus}
      style={({ focused }) => [
        quiet ? styles.quiet : styles.base,
        wide && styles.wide,
        { backgroundColor: focused ? c.text : fill },
        focused && styles.focused,
        disabled && !focused && styles.dimmed,
      ]}
    >
      {({ focused }) =>
        loading ? (
          <ActivityIndicator color={ink(focused)} />
        ) : (
          <>
            {icon && <SymbolView name={icon} tintColor={ink(focused)} size={tv.icon.button} />}
            <Text style={[quiet ? tv.type.quiet : tv.type.button, { color: ink(focused) }]}>{title}</Text>
          </>
        )
      }
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: tv.button.height,
    paddingHorizontal: tv.button.paddingHorizontal,
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: tv.gap.sm / 2,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  quiet: {
    height: tv.quietButton.height,
    paddingHorizontal: tv.quietButton.paddingHorizontal,
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: tv.gap.sm / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wide: { alignSelf: 'stretch' },
  focused: { transform: [{ scale: tv.focus.buttonScale }], ...tv.focus.shadow },
  dimmed: { opacity: pressedOpacity },
});
