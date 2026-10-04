// SPDX-License-Identifier: GPL-3.0-or-later
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { BaseItemDto } from '@/api';
import { seasonDetail } from '@/items';
import { minTouch, pressedOpacity, spacing, useColors } from '@/theme';

import { ActionSheet } from './ActionSheet';
import { Text } from './Text';

/**
 * "Season 2 ⌃⌄" heading that opens a sheet of seasons ("Watched" / "5 unwatched", ✓ on the current one). One season
 * is a plain heading. Owns its open state, so opening it re-renders only this.
 */
export function SeasonMenu({
  seasons,
  value,
  onChange,
}: {
  seasons: BaseItemDto[];
  value?: string;
  onChange: (seasonId: string) => void;
}) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const current = seasons.find((s) => s.Id === value);

  if (seasons.length === 1) {
    return (
      <View style={styles.heading}>
        <Text variant="sectionHeader" accessibilityRole="header">
          {seasons[0].Name}
        </Text>
      </View>
    );
  }
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={current?.Name ?? 'Season'}
        accessibilityHint="Chooses a season"
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.heading, pressed && styles.pressed]}
      >
        <Text variant="sectionHeader">{current?.Name ?? ' '}</Text>
        <SymbolView
          name={{ ios: 'chevron.up.chevron.down', android: 'unfold_more' }}
          tintColor={c.textSecondary}
          size={14}
        />
      </Pressable>
      <ActionSheet
        visible={open}
        actions={seasons.map((s) => ({
          label: s.Name,
          detail: seasonDetail(s),
          selected: s.Id === value,
          onPress: () => onChange(s.Id),
        }))}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  heading: {
    minHeight: minTouch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
  },
  pressed: { opacity: pressedOpacity },
});
