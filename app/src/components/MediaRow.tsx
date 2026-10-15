// SPDX-License-Identifier: GPL-3.0-or-later
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { trackRowExpands, type TrackRow } from '@/items';
import { spacing, useColors } from '@/theme';

import { Checkmark, Chevron, ListRow, listLabelStyle, listRowStyle } from './List';
import { Text } from './Text';

/**
 * Detail screen Media row ("Audio (3)  English - Dolby Digital - 5.1"). Several tracks, or a default too long for
 * the row: a tap opens the full track list below (default ticked). Own state: a tap re-renders only this row.
 */
export function MediaRow({ label, row }: { label: string; row: TrackRow }) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const title = row.count > 1 ? `${label} (${row.count})` : label;
  if (!trackRowExpands(title, row)) return <ListRow label={title} value={row.value} />;

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityValue={{ text: row.value }}
        accessibilityState={{ expanded: open }}
        accessibilityHint={open ? 'Hides the tracks' : 'Shows every track'}
        onPress={() => setOpen((o) => !o)}
        style={({ pressed }) => [listRowStyle, pressed && { backgroundColor: c.elevated }]}
      >
        <Text style={listLabelStyle}>{title}</Text>
        {/* Open: the list below says it in full. */}
        <Text secondary numberOfLines={1} style={styles.value}>
          {open ? '' : row.value}
        </Text>
        <Chevron down={open} />
      </Pressable>
      {open && (
        <View style={styles.tracks}>
          {row.tracks.map((t, i) => (
            <View
              key={i}
              style={[styles.track, i > 0 && { borderTopColor: c.separator, borderTopWidth: StyleSheet.hairlineWidth }]}
            >
              <View style={styles.check}>{t.picked && <Checkmark />}</View>
              <Text secondary={!t.picked} style={styles.trackLabel}>
                {t.label}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  value: { flex: 1, textAlign: 'right' },
  tracks: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  track: { flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.sm },
  check: { width: 16, paddingTop: 2 },
  trackLabel: { flex: 1 },
});
