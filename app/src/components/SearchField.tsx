// SPDX-License-Identifier: GPL-3.0-or-later
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { minTouch, radii, spacing, type, useColors } from '@/theme';

export type SearchFieldProps = {
  value: string;
  onChangeText: (text: string) => void;
  /** Return key pressed. */
  onSubmit?: () => void;
  placeholder?: string;
  onFocus?: () => void;
  onBlur?: () => void;
};

/** Rounded search bar: magnifier, text, clear ✕ while there is text. */
export function SearchField({
  value,
  onChangeText,
  onSubmit,
  placeholder = 'Search',
  onFocus,
  onBlur,
}: SearchFieldProps) {
  const c = useColors();
  return (
    <View style={[styles.field, { backgroundColor: c.surface }]}>
      <SymbolView name={{ ios: 'magnifyingglass', android: 'search' }} tintColor={c.iconInactive} size={18} />
      <TextInput
        accessibilityLabel={placeholder}
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder={placeholder}
        placeholderTextColor={c.textSecondary}
        returnKeyType="search"
        autoCorrect={false}
        autoCapitalize="none"
        clearButtonMode="never"
        style={[styles.input, { color: c.text }]}
      />
      {value !== '' && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          onPress={() => onChangeText('')}
          style={styles.clear}
        >
          <SymbolView name={{ ios: 'xmark.circle.fill', android: 'cancel' }} tintColor={c.iconInactive} size={18} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    minHeight: minTouch,
    borderRadius: radii.pill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: spacing.md,
  },
  input: { flex: 1, fontSize: type.body.fontSize, paddingVertical: spacing.sm },
  clear: { width: minTouch, height: minTouch, alignItems: 'center', justifyContent: 'center' },
});
