// SPDX-License-Identifier: GPL-3.0-or-later
import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { activeFilters, removeFilter, type Filters, NO_FILTERS } from '@/items';
import { minTouch, spacing } from '@/theme';

import { Chip } from './Chip';
import { Text } from './Text';

/** Active filters as removable chips + Clear; nothing when no filter is on. */
export function FilterChips({ value, onChange }: { value: Filters; onChange: (filters: Filters) => void }) {
  const active = activeFilters(value);
  if (active.length === 0) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {active.map((f) => (
        <Chip key={f.id} label={f.label} removable onPress={() => onChange(removeFilter(value, f.id))} />
      ))}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Clear filters"
        onPress={() => onChange(NO_FILTERS)}
        style={styles.clear}
      >
        <Text variant="label" secondary>
          Clear
        </Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: spacing.md, gap: spacing.sm, alignItems: 'center' },
  clear: { minHeight: minTouch, justifyContent: 'center', paddingHorizontal: spacing.sm },
});
