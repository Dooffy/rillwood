// SPDX-License-Identifier: GPL-3.0-or-later
import { SymbolView } from 'expo-symbols';
import { Children, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { minTouch, radii, spacing, useColors } from '@/theme';

import { Text } from './Text';

/** Grouped list section (settings-style): caption title + rounded surface with hairline separators. */
export function ListSection({ title, children }: { title?: string; children: ReactNode }) {
  const c = useColors();
  const rows = Children.toArray(children);
  return (
    <View style={styles.section}>
      {title && (
        <Text variant="caption" secondary accessibilityRole="header" style={styles.title}>
          {title.toUpperCase()}
        </Text>
      )}
      <View style={[styles.group, { backgroundColor: c.surface }]}>
        {rows.map((row, i) => (
          <View key={i} style={i < rows.length - 1 && [styles.divider, { borderBottomColor: c.separator }]}>
            {row}
          </View>
        ))}
      </View>
    </View>
  );
}

/** Disclosure chevron for tappable rows and cards. */
export function Chevron() {
  const c = useColors();
  return <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right' }} tintColor={c.iconInactive} size={14} />;
}

export type ListRowProps = {
  label: string;
  value?: string;
  onPress?: () => void;
};

/** Tappable rows get a chevron; rows without `onPress` show a read-only value. */
export function ListRow({ label, value, onPress }: ListRowProps) {
  const c = useColors();
  const content = (
    <>
      <Text style={styles.label}>{label}</Text>
      {value !== undefined && <Text secondary>{value}</Text>}
      {onPress && <Chevron />}
    </>
  );

  if (!onPress) return <View style={styles.row}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: c.elevated }]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  title: { paddingHorizontal: spacing.md },
  group: { borderRadius: radii.card, overflow: 'hidden' },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth },
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
