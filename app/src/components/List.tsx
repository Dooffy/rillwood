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
  /** Status dot before the value: `active` → green dot + primary text, `muted` → grey dot. */
  dot?: 'active' | 'muted';
  onPress?: () => void;
};

/** Tappable rows get a chevron; rows without `onPress` show a read-only value. */
export function ListRow({ label, value, dot, onPress }: ListRowProps) {
  const c = useColors();
  const content = (
    <>
      <Text style={styles.label}>{label}</Text>
      {value !== undefined && (
        <View style={styles.value}>
          {dot && <View style={[styles.dot, { backgroundColor: dot === 'active' ? c.success : c.elevated2 }]} />}
          <Text secondary={dot !== 'active'}>{value}</Text>
        </View>
      )}
      {onPress && <Chevron />}
    </>
  );

  if (!onPress) return <View style={styles.row}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityValue={value === undefined ? undefined : { text: value }}
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
  value: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 },
  dot: { width: 8, height: 8, borderRadius: radii.pill },
});
