// SPDX-License-Identifier: GPL-3.0-or-later
import { SymbolView } from 'expo-symbols';
import { forwardRef } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputInstance } from 'react-native';

import { kids, minTouch, radii, spacing, type, useColors } from '@/theme';

export type SearchFieldProps = {
  value: string;
  onChangeText: (text: string) => void;
  /** Return key pressed. */
  onSubmit?: () => void;
  placeholder?: string;
  onFocus?: () => void;
  onBlur?: () => void;
  /** Kids search: taller, bigger type. */
  large?: boolean;
};

/** Rounded search bar: magnifier, text, clear ✕ while there is text. The ref is the text input (focus it). */
export const SearchField = forwardRef<TextInputInstance, SearchFieldProps>(function SearchField(
  { value, onChangeText, onSubmit, placeholder = 'Search', onFocus, onBlur, large = false },
  ref,
) {
  const c = useColors();
  const icon = large ? kids.search.icon : 18;
  return (
    <View style={[styles.field, large && styles.large, { backgroundColor: large ? c.elevated : c.surface }]}>
      <SymbolView name={{ ios: 'magnifyingglass', android: 'search' }} tintColor={c.iconInactive} size={icon} />
      <TextInput
        ref={ref}
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
        style={[styles.input, large && kids.type.search, { color: c.text }]}
      />
      {value !== '' && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          onPress={() => onChangeText('')}
          style={styles.clear}
        >
          <SymbolView name={{ ios: 'xmark.circle.fill', android: 'cancel' }} tintColor={c.iconInactive} size={icon} />
        </Pressable>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  field: {
    minHeight: minTouch,
    borderRadius: radii.pill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: spacing.md,
  },
  large: { minHeight: kids.search.field, paddingLeft: spacing.md + spacing.xs },
  input: { flex: 1, fontSize: type.body.fontSize, paddingVertical: spacing.sm },
  clear: { width: minTouch, height: minTouch, alignItems: 'center', justifyContent: 'center' },
});
