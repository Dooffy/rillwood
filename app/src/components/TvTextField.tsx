// SPDX-License-Identifier: GPL-3.0-or-later
// Apple TV text field: label above, then a capsule we draw (icon, our font and colours; white when focused, like the
// system's) that opens the system keyboard. The typing happens in a separate, hidden TextInput with no style at all:
// tvOS copies a field's font, colour and padding into its full-screen keyboard screen and lays them out badly (tiny,
// off centre - react-native-tvos #1134 only fixes the value), so the field it sees is a plain one. Clicking the
// capsule mounts that input with autoFocus (the one way to start editing from code on tvOS).
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, TVFocusGuideView, View, type TextInputProps } from 'react-native';

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

export function TvTextField({ label, icon, error, preferredFocus, ...input }: TvTextFieldProps) {
  const c = useColors();
  // A new key per click mounts a new input, whose autoFocus opens the keyboard.
  const [opened, setOpened] = useState(0);
  const value = input.value ?? '';
  const shown = input.secureTextEntry ? '•'.repeat(value.length) : value;
  const editable = input.editable !== false;
  return (
    <View style={styles.root}>
      <Text secondary style={[tv.type.label, styles.label]}>
        {label}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityValue={{ text: input.secureTextEntry || !value ? undefined : value }}
        accessibilityState={{ disabled: !editable }}
        hasTVPreferredFocus={preferredFocus}
        onPress={editable ? () => setOpened((n) => n + 1) : undefined}
        style={({ focused }) => [
          styles.field,
          { backgroundColor: focused ? c.text : tv.field.fill },
          focused && styles.focused,
        ]}
      >
        {({ focused }) => {
          const ink = focused ? c.background : c.text;
          return (
            <>
              {icon && <SymbolView name={icon} tintColor={focused ? ink : c.textSecondary} size={tv.icon.field} />}
              <Text numberOfLines={1} style={[tv.type.field, styles.text, { color: value ? ink : c.textSecondary }]}>
                {shown || input.placeholder}
              </Text>
            </>
          );
        }}
      </Pressable>
      {/* The typing field: no style, never focused by the remote, only opened by the capsule. */}
      <TVFocusGuideView focusable={false} style={styles.hidden} pointerEvents="none">
        <TextInput key={opened} testID={`${label} input`} accessible={false} autoFocus={opened > 0} {...input} />
      </TVFocusGuideView>
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
    borderRadius: radii.pill,
    borderWidth: 2,
    borderColor: tv.field.hairline,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tv.gap.sm,
    paddingHorizontal: tv.field.iconInset,
  },
  focused: { transform: [{ scale: tv.focus.buttonScale }], ...tv.focus.shadow, borderColor: 'transparent' },
  text: { flex: 1 },
  // Out of sight; still in the window, so it can open the keyboard.
  hidden: { position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden' },
});
