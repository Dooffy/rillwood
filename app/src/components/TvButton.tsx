// SPDX-License-Identifier: GPL-3.0-or-later
// Apple TV button: capsule, translucent until focused, then the palette's text colour, scaled up and lifted.
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { pressedOpacity, radii, tv, useColors } from '@/theme';

import { Text } from './Text';

export type TvButtonProps = {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  /** Takes focus when the screen opens. */
  preferredFocus?: boolean;
};

export function TvButton({ title, onPress, loading = false, disabled = false, preferredFocus }: TvButtonProps) {
  const c = useColors();
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: inactive, busy: loading }}
      onPress={inactive ? undefined : onPress}
      hasTVPreferredFocus={preferredFocus}
      style={({ focused }) => [
        styles.base,
        { backgroundColor: focused ? c.text : tv.unfocused },
        focused && styles.focused,
      ]}
    >
      {({ focused }) =>
        loading ? (
          <ActivityIndicator color={focused ? c.background : c.text} />
        ) : (
          <Text style={[tv.type.button, { color: focused ? c.background : c.text }, disabled && styles.dimmed]}>
            {title}
          </Text>
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
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  focused: { transform: [{ scale: tv.focus.buttonScale }], ...tv.focus.shadow },
  dimmed: { opacity: pressedOpacity },
});
