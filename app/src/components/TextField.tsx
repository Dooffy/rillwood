// SPDX-License-Identifier: GPL-3.0-or-later
import { SymbolView } from 'expo-symbols';
import { forwardRef, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type TextInputInstance,
  type TextInputProps,
} from 'react-native';

import { minTouch, radii, spacing, type, useColors } from '@/theme';

import { Text } from './Text';

export type TextFieldProps = Omit<TextInputProps, 'style' | 'secureTextEntry'> & {
  label: string;
  error?: string;
  /** Password field with a show / hide toggle. */
  secure?: boolean;
};

/**
 * iOS wipes a hidden password field on the first keystroke after it regains focus, so a typo can't be fixed.
 * Rebuild the intended text: wiped by a delete → drop the last character, wiped by typing → append it.
 * A wipe leaves at most the one typed character; longer text is a normal edit, autofill or paste - kept as is.
 */
export function repairSecureEdit(previous: string, next: string): string {
  if (previous === '' || next.length > 1) return next;
  return next === '' ? previous.slice(0, -1) : previous + next;
}

/** Labelled text input with an optional error line. */
export const TextField = forwardRef<TextInputInstance, TextFieldProps>(function TextField(
  { label, error, secure = false, ...input },
  ref,
) {
  const c = useColors();
  const [hidden, setHidden] = useState(true);
  const refocused = useRef(false);
  const locked = input.editable === false;
  const guard = secure && hidden && Platform.OS === 'ios';

  return (
    <View style={styles.container}>
      <Text variant="label" secondary>
        {label}
      </Text>
      <View
        style={[
          styles.box,
          { backgroundColor: c.surface, borderColor: error ? c.danger : c.surface },
          locked && styles.locked,
        ]}
      >
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          placeholderTextColor={c.textSecondary}
          selectionColor={c.text}
          cursorColor={c.text}
          secureTextEntry={secure && hidden}
          {...input}
          onFocus={(e) => {
            refocused.current = guard && !!input.value;
            input.onFocus?.(e);
          }}
          onChangeText={(text) => {
            const repair = refocused.current;
            refocused.current = false;
            input.onChangeText?.(repair ? repairSecureEdit(input.value ?? '', text) : text);
          }}
          style={[styles.input, { color: c.text }]}
        />
        {secure && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
            disabled={locked}
            onPress={() => {
              // iOS also wipes on the first keystroke after the text is hidden again; shown text is never wiped.
              refocused.current = hidden ? false : Platform.OS === 'ios' && !!input.value;
              setHidden(!hidden);
            }}
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
  locked: { opacity: 0.5 },
  toggle: { width: minTouch, height: minTouch, alignItems: 'center', justifyContent: 'center' },
});
