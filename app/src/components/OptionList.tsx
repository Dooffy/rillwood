// SPDX-License-Identifier: GPL-3.0-or-later
// iOS Settings style choices: `OptionRow` shows an option's current value and opens its checkmark list
// (`/option/[key]`), `OptionList` is that list - one tap saves.
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { type OptionChoice, type PickerKey, PICKERS, usePicker } from '@/pickers';
import { minTouch, spacing, useColors } from '@/theme';

import { Checkmark, ListRow, ListSection, Swatch } from './List';
import { Text } from './Text';

/** A row that opens the option's list, with the current choice as its value. */
export function OptionRow({ option }: { option: PickerKey }) {
  const { choice } = usePicker(option);
  return (
    <ListRow
      label={PICKERS[option].title}
      value={choice?.label}
      swatch={choice?.swatch}
      onPress={() => router.push({ pathname: '/option/[key]', params: { key: option } })}
    />
  );
}

export function OptionList<T extends string | number>({
  choices,
  value,
  onChange,
  title,
  footer,
}: {
  choices: readonly OptionChoice<T>[];
  title?: string;
  value: T;
  onChange: (value: T) => void;
  footer?: string;
}) {
  const c = useColors();
  return (
    <View accessibilityRole="radiogroup">
      <ListSection title={title} footer={footer}>
        {choices.map((o) => {
          const selected = o.value === value;
          return (
            <Pressable
              key={String(o.value)}
              accessibilityRole="radio"
              accessibilityLabel={o.label}
              accessibilityState={{ checked: selected }}
              onPress={() => onChange(o.value)}
              style={({ pressed }) => [styles.row, pressed && { backgroundColor: c.elevated }]}
            >
              {o.swatch && <Swatch color={o.swatch} />}
              <Text style={[styles.label, o.fontFamily ? { fontFamily: o.fontFamily } : undefined]}>{o.label}</Text>
              {selected && <Checkmark />}
            </Pressable>
          );
        })}
      </ListSection>
    </View>
  );
}

const styles = StyleSheet.create({
  // As `ListRow`.
  row: {
    minHeight: minTouch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + spacing.xs,
  },
  label: { flex: 1 },
});
