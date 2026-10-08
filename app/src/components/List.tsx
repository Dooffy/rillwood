// SPDX-License-Identifier: GPL-3.0-or-later
import { SymbolView } from 'expo-symbols';
import { Children, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { minTouch, radii, spacing, useColors } from '@/theme';

import { Text } from './Text';

/** Grouped list section (settings-style): caption title + rounded surface with hairline separators + caption footer. */
export function ListSection({ title, footer, children }: { title?: string; footer?: string; children: ReactNode }) {
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
      {footer && (
        <Text variant="caption" secondary style={styles.title}>
          {footer}
        </Text>
      )}
    </View>
  );
}

/** Disclosure chevron for tappable rows and cards. */
export function Chevron() {
  const c = useColors();
  return <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right' }} tintColor={c.iconInactive} size={14} />;
}

/** Checkmark on the picked option (option lists, action sheets). */
export function Checkmark() {
  const c = useColors();
  return <SymbolView name={{ ios: 'checkmark', android: 'check' }} tintColor={c.text} size={16} />;
}

/** Colour dot for a colour preset. */
export function Swatch({ color }: { color: string }) {
  const c = useColors();
  return <View style={[styles.swatch, { backgroundColor: color, borderColor: c.separator }]} />;
}

export type ListRowProps = {
  label: string;
  value?: string;
  /** Status dot before the value: `active` → green dot + primary text, `muted` → grey dot. */
  dot?: 'active' | 'muted';
  /** Colour dot before the value (a colour preset). */
  swatch?: string;
  onPress?: () => void;
};

/** Tappable rows get a chevron; rows without `onPress` show a read-only value. */
export function ListRow({ label, value, dot, swatch, onPress }: ListRowProps) {
  const c = useColors();
  const content = (
    <>
      <Text style={styles.label}>{label}</Text>
      {value !== undefined && (
        <View style={styles.value}>
          {dot && <View style={[styles.dot, { backgroundColor: dot === 'active' ? c.success : c.elevated2 }]} />}
          {swatch && <Swatch color={swatch} />}
          <Text secondary={dot !== 'active'} numberOfLines={1} style={styles.valueText}>
            {value}
          </Text>
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
  // Both shrink: a long value truncates to one line, a long label (user name) wraps.
  label: { flexGrow: 1, flexShrink: 1 },
  value: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2, flexShrink: 1 },
  valueText: { flexShrink: 1 },
  dot: { width: 8, height: 8, borderRadius: radii.pill },
  swatch: { width: 16, height: 16, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth },
});
