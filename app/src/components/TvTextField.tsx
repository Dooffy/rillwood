// SPDX-License-Identifier: GPL-3.0-or-later
// Apple TV text field: the system's own field (its focused pill, its full-screen keyboard), at TV size. Its colours
// are left to tvOS - the same field is drawn on the screen and on the dark keyboard screen, so a fixed text colour
// turns unreadable on one of them. Error text under it.
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { tv, useColors } from '@/theme';

import { Text } from './Text';

export type TvTextFieldProps = Omit<TextInputProps, 'style'> & {
  /** Read out and shown as the keyboard's title. */
  label: string;
  error?: string;
  preferredFocus?: boolean;
};

export function TvTextField({ label, error, preferredFocus, ...rest }: TvTextFieldProps) {
  const c = useColors();
  return (
    <View style={styles.root}>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={c.textSecondary}
        hasTVPreferredFocus={preferredFocus}
        style={[styles.field, tv.type.field]}
        {...rest}
      />
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
  field: { height: tv.field.height },
});
