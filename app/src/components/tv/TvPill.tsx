// SPDX-License-Identifier: GPL-3.0-or-later
// Apple TV pill: one choice in a row of them (Library types, seasons). The selected one is filled, the others text
// only; focused, any pill turns the palette's text colour and lifts, like the buttons. `TvPills` lays a row out as
// one focus target (`TvFocusRow`): a swipe down from above lands on the last-focused pill.
import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { radii, tv, useColors } from '@/theme';

import { Text } from '../Text';
import { focusStyles, rememberFocus, TvFocusRow } from './focus';

export type TvPillProps = {
  label: string;
  selected?: boolean;
  onPress: () => void;
  /** Holds for a pill menu (a season's ⋯ actions). */
  onLongPress?: () => void;
  /** Takes focus when the screen opens. */
  preferredFocus?: boolean;
  /** false inside menus and panels: a closing one hands focus back to what opened it, not to its own pills. */
  rememberFocus?: boolean;
};

export function TvPill({
  label,
  selected = false,
  onPress,
  onLongPress,
  preferredFocus,
  rememberFocus: remember = true,
}: TvPillProps) {
  const c = useColors();
  return (
    <Pressable
      onFocus={remember ? rememberFocus : undefined}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      hasTVPreferredFocus={preferredFocus}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ focused }) => [
        styles.pill,
        { backgroundColor: focused ? c.text : selected ? tv.unfocused : 'transparent' },
        focused && focusStyles.pill,
      ]}
    >
      {({ focused }) => (
        <Text
          numberOfLines={1}
          style={[tv.type.quiet, { color: focused ? c.background : selected ? c.text : c.textSecondary }]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export type TvPillsProps<T extends string> = {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  /** What VoiceOver calls the row ("Type", "Season"). */
  accessibilityLabel?: string;
};

/** A row of pills, one selected, scrolled sideways when it runs past the screen. */
export function TvPills<T extends string>({ options, value, onChange, accessibilityLabel }: TvPillsProps<T>) {
  return (
    <TvFocusRow>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityLabel={accessibilityLabel}
        contentContainerStyle={styles.row}
      >
        {options.map((o) => (
          <TvPill key={o.value} label={o.label} selected={o.value === value} onPress={() => onChange(o.value)} />
        ))}
      </ScrollView>
    </TvFocusRow>
  );
}

const styles = StyleSheet.create({
  pill: {
    height: tv.quietButton.height,
    paddingHorizontal: tv.quietButton.paddingHorizontal,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Room on every side for a focused pill to grow.
  row: { gap: tv.gap.sm, paddingHorizontal: tv.margin, paddingVertical: tv.gap.sm },
});
