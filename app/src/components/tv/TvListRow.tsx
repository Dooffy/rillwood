// SPDX-License-Identifier: GPL-3.0-or-later
// Apple TV list rows, tvOS Settings style (`TvSettings`): label on the left, the value (and › for a page) on the right,
// a soft fill until focused - then white with dark text and a lift. A checked row (an option's list) shows ✓ before
// its label. `TvListSection`: a group with a heading.
import { SymbolView } from 'expo-symbols';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { tv, useColors } from '@/theme';

import { Swatch } from '../List';
import { Text } from '../Text';
import { focusStyles } from './focus';

export type TvListRowProps = {
  label: string;
  value?: string;
  /** Opens a page: › after the value. */
  chevron?: boolean;
  /** An option's choice: ✓ when picked (read as a radio). */
  checked?: boolean;
  /** Before the label: an account's avatar. */
  leading?: ReactNode;
  /** Colour dot before the label (colour presets). */
  swatch?: string;
  /** Label drawn in this face (typefaces). */
  fontFamily?: string;
  onPress: () => void;
  onFocus?: () => void;
  preferredFocus?: boolean;
};

export function TvListRow({
  label,
  value,
  chevron = false,
  checked,
  leading,
  swatch,
  fontFamily,
  onPress,
  onFocus,
  preferredFocus,
}: TvListRowProps) {
  const c = useColors();
  const radio = checked !== undefined;
  return (
    <Pressable
      accessibilityRole={radio ? 'radio' : 'button'}
      accessibilityLabel={value ? `${label}, ${value}` : label}
      accessibilityState={radio ? { checked } : undefined}
      hasTVPreferredFocus={preferredFocus}
      onPress={onPress}
      onFocus={onFocus}
      style={({ focused }) => [
        styles.row,
        { backgroundColor: focused ? c.text : tv.unfocused },
        focused && focusStyles.pill,
      ]}
    >
      {({ focused }) => {
        const ink = focused ? c.background : c.text;
        const quiet = focused ? c.background : c.textSecondary;
        return (
          <>
            {radio && (
              <View style={styles.check}>
                {checked && <SymbolView name="checkmark" tintColor={ink} size={tv.icon.button} />}
              </View>
            )}
            {leading}
            {swatch && <Swatch color={swatch} />}
            <Text
              numberOfLines={1}
              style={[tv.type.body, styles.label, { color: ink }, fontFamily ? { fontFamily } : undefined]}
            >
              {label}
            </Text>
            {value !== undefined && (
              <Text numberOfLines={1} style={[tv.type.body, styles.value, { color: quiet }]}>
                {value}
              </Text>
            )}
            {chevron && <SymbolView name="chevron.right" tintColor={quiet} size={tv.icon.button} />}
          </>
        );
      }}
    </Pressable>
  );
}

/** A group of rows under a heading ("Playback"). */
export function TvListSection({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      {title !== undefined && (
        <Text secondary accessibilityRole="header" style={[tv.type.caption, styles.heading]}>
          {title}
        </Text>
      )}
      <View style={styles.rows}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: tv.settings.row.height,
    borderRadius: tv.settings.row.radius,
    paddingHorizontal: tv.settings.row.paddingHorizontal,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tv.gap.sm / 2,
  },
  check: { width: tv.icon.button, alignItems: 'center' },
  label: { flex: 1 },
  value: { flexShrink: 1, textAlign: 'right' },
  section: { gap: tv.gap.sm / 2 },
  heading: { paddingHorizontal: tv.settings.row.paddingHorizontal },
  rows: { gap: tv.settings.row.gap },
});
