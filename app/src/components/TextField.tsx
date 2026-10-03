// SPDX-License-Identifier: GPL-3.0-or-later
import { SymbolView } from 'expo-symbols';
import { forwardRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputInstance, type TextInputProps } from 'react-native';

import { minTouch, radii, spacing, type, useColors } from '@/theme';

import { Text } from './Text';

export type TextFieldProps = Omit<TextInputProps, 'style' | 'secureTextEntry'> & {
  label: string;
  error?: string;
  /** Password field with a show / hide toggle. */
  secure?: boolean;
};

/** Labelled text input with an optional error line. */
export const TextField = forwardRef<TextInputInstance, TextFieldProps>(function TextField(
  { label, error, secure = false, ...input },
  ref,
) {
  const c = useColors();
  const [hidden, setHidden] = useState(true);

  return (
    <View style={styles.container}>
      <Text variant="label" secondary>
        {label}
      </Text>
      <View style={[styles.box, { backgroundColor: c.surface, borderColor: error ? c.danger : c.surface }]}>
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          placeholderTextColor={c.textSecondary}
          selectionColor={c.text}
          cursorColor={c.text}
          secureTextEntry={secure && hidden}
          {...input}
          style={[styles.input, { color: c.text }]}
        />
        {secure && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
            onPress={() => setHidden((h) => !h)}
            style={styles.toggle}
          >
            <SymbolView
              name={hidden ? { ios: 'eye', android: 'visibility' } : { ios: 'eye.slash', android: 'visibility_off' }}
              tintColor={c.iconInactive}
              size={20}
            />
          </Pressable>
        )}
      </View>
      {error && (
        <Text variant="caption" accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ color: c.danger }}>
          {error}
        </Text>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { gap: spacing.xs + 2 },
  box: {
    minHeight: minTouch,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  input: { flex: 1, ...type.body, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + spacing.xs },
  toggle: { width: minTouch, height: minTouch, alignItems: 'center', justifyContent: 'center' },
});
