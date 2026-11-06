// SPDX-License-Identifier: GPL-3.0-or-later
// Apple TV text field: label above, icon inside, sunken fill + hairline so it reads as an input. The field itself is
// the system's (its focused pill, its full-screen keyboard); its text colours are left to tvOS - the same field is
// drawn on the screen and on the dark keyboard screen, so a fixed text colour turns unreadable on one of them.
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { radii, tv, useColors } from '@/theme';

import { Text } from './Text';

export type TvTextFieldProps = Omit<TextInputProps, 'style'> & {
  /** Shown above the field, read out, and the keyboard's title. */
  label: string;
  /** SF Symbol inside the field, before the text. */
  icon?: SymbolViewProps['name'];
  error?: string;
  preferredFocus?: boolean;
};

export function TvTextField({ label, icon, error, preferredFocus, onFocus, onBlur, ...rest }: TvTextFieldProps) {
  const c = useColors();
  // Only for the icon (it sits on the system's white pill while focused); the text keeps the system colours.
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.root}>
      <Text secondary style={[tv.type.label, styles.label]}>
        {label}
      </Text>
      <View>
        <TextInput
          accessibilityLabel={label}
          placeholderTextColor={c.textSecondary}
          hasTVPreferredFocus={preferredFocus}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[styles.field, tv.type.field, icon !== undefined && styles.withIcon]}
          {...rest}
        />
        {icon && (
          <View style={styles.icon} pointerEvents="none">
            <SymbolView name={icon} tintColor={focused ? c.background : c.textSecondary} size={tv.icon.field} />
          </View>
        )}
      </View>
      {error && (
        <Text accessibilityRole="alert" style={[tv.type.small, { color: c.danger }]}>
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: tv.gap.sm / 2, alignSelf: 'stretch' },
  label: { marginLeft: tv.gap.sm / 2 },
  field: {
    height: tv.field.height,
    borderRadius: radii.pill, // the system's focused pill is a capsule too
    backgroundColor: tv.field.fill,
    borderWidth: 2,
    borderColor: tv.field.hairline,
  },
  withIcon: { paddingLeft: tv.field.textInset },
  icon: { position: 'absolute', left: tv.field.iconInset, top: 0, bottom: 0, justifyContent: 'center' },
});
