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

/** Disclosure chevron for tappable rows and cards; `down` on a row that is open. */
export function Chevron({ down = false }: { down?: boolean }) {
  const c = useColors();
  return (
    <SymbolView
      name={down ? { ios: 'chevron.down', android: 'expand_more' } : { ios: 'chevron.right', android: 'chevron_right' }}
      tintColor={c.iconInactive}
      size={14}
    />
  );
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
  /** Colour dot before the value (a colour preset). */
  swatch?: string;
  onPress?: () => void;
  /** The page it opens is the one shown beside the list (Settings split view on tablets). */
  selected?: boolean;
};

/** Tappable rows get a chevron; rows without `onPress` show a read-only value. */
export function ListRow({ label, value, swatch, onPress, selected }: ListRowProps) {
  const c = useColors();
  const content = (
    <>
      <Text style={[styles.label, value !== undefined && styles.labelBesideValue]}>{label}</Text>
      {value !== undefined && (
        <View style={styles.value}>
          {swatch && <Swatch color={swatch} />}
          <Text secondary numberOfLines={1} style={styles.valueText}>
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
      accessibilityState={selected === undefined ? undefined : { selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        selected && { backgroundColor: c.elevated },
        pressed && { backgroundColor: selected ? c.elevated2 : c.elevated },
      ]}
    >
      {content}
    </Pressable>
  );
}

/** Action row (Sign out, Remove account): a plain tappable label, danger colour when `destructive`, no chevron. */
export function ListAction({
  label,
  destructive,
  onPress,
}: {
  label: string;
  destructive?: boolean;
  onPress: () => void;
}) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: c.elevated }]}
    >
      <Text style={[styles.label, destructive && { color: c.danger }]}>{label}</Text>
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
  // A label alone (a recent search) wraps.
  label: { flexGrow: 1, flexShrink: 1 },
  // Next to a value the value gives way first (truncates to one line): "Audio" must not break to "Audi / o". A label
  // too long for the row anyway (large text) still wraps at 60%.
  labelBesideValue: { flexGrow: 0, flexShrink: 0, maxWidth: '60%' },
  value: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: spacing.xs + 2, flex: 1 },
  valueText: { flexShrink: 1 },
  swatch: { width: 16, height: 16, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth },
});

/** A list row's box (min height, padding), for rows built on their own (`MediaRow`). */
export const listRowStyle = styles.row;
/** A row label next to a value (`MediaRow`). */
export const listLabelStyle = styles.labelBesideValue;
