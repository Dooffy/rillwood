// SPDX-License-Identifier: GPL-3.0-or-later
import { useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Endpoint, ItemsResult } from '@/api';
import { activeFilters, DECADES, MIN_RATINGS, NO_FILTERS, SHOW_STATES, type Filters } from '@/items';
import { useDebounced } from '@/useDebounced';
import { useFetch } from '@/useFetch';
import { backdrop, minTouch, palettes, radii, scrollList, spacing, type, useColors } from '@/theme';

import { Button } from './Button';
import { Chip } from './Chip';
import { IconButton } from './IconButton';
import { Text } from './Text';

export type FilterSheetProps = {
  visible: boolean;
  value: Filters;
  /** Genres to offer (from the server). */
  genres: string[];
  /** Applied filters. */
  onApply: (filters: Filters) => void;
  onClose: () => void;
  /** Count-only request for the filters being edited ("Show 24 Results"); undefined = no count. */
  countEndpoint?: (draft: Filters) => Endpoint | undefined;
};

/** Wait this long after the last toggle before counting. */
const COUNT_DEBOUNCE_MS = 250;

function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

/**
 * The filters being edited in a sheet / panel: a draft that starts from the applied filters on each opening, edits, a
 * reset, and the live result count once toggling pauses (`countEndpoint`). Phone sheet and Apple TV panel.
 */
export function useFilterDraft(
  visible: boolean,
  value: Filters,
  countEndpoint?: (draft: Filters) => Endpoint | undefined,
) {
  const [draft, setDraft] = useState(value);
  const [opened, setOpened] = useState(visible);
  // Each opening starts from the applied filters.
  if (visible && !opened) {
    setOpened(true);
    setDraft(value);
  } else if (!visible && opened) {
    setOpened(false);
  }
  const set = (change: Partial<Filters>) => setDraft((d) => ({ ...d, ...change }));
  // Count once toggling pauses, not per tap.
  const debounced = useDebounced(draft, COUNT_DEBOUNCE_MS);
  // Untouched since opening: count right away (the debounced draft may still be the last opening's).
  const counted = draft === value ? draft : debounced;
  const countRequest = visible ? countEndpoint?.(counted) : undefined;
  const { data } = useFetch<ItemsResult>(countRequest?.path ?? null, { query: countRequest?.query });
  const count = countRequest ? data?.TotalRecordCount : undefined;
  return {
    draft,
    set,
    reset: () => setDraft(NO_FILTERS),
    toggleGenre: (genre: string) => set({ genres: toggle(draft.genres, genre) }),
    toggleDecade: (decade: Filters['decades'][number]) => set({ decades: toggle(draft.decades, decade) }),
    /** "Show 24 Results" (or without the number until it's known). */
    showLabel: count === undefined ? 'Show Results' : `Show ${count} Result${count === 1 ? '' : 's'}`,
  };
}

/**
 * Tall sheet with every filter as tap-to-toggle chips: Show, Genres, Year, Rating, Quality. Edits a draft; Reset clears
 * it, the bottom button applies it (with the live result count when `countFor` knows it).
 */
export function FilterSheet({ visible, value, genres, onApply, onClose, countEndpoint }: FilterSheetProps) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { draft, set, reset, toggleGenre, toggleDecade, showLabel } = useFilterDraft(visible, value, countEndpoint);

  const section = (title: string, chips: ReactNode) => (
    <View style={styles.section}>
      <Text variant="caption" secondary accessibilityRole="header">
        {title.toUpperCase()}
      </Text>
      <View style={styles.chips}>{chips}</View>
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close" style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: c.surface, paddingBottom: insets.bottom + spacing.sm }]}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Reset filters"
            onPress={reset}
            style={styles.headerButton}
          >
            <Text secondary>Reset</Text>
          </Pressable>
          <Text variant="button" accessibilityRole="header">
            Filters
          </Text>
          <IconButton icon={{ ios: 'xmark', android: 'close' }} label="Close filters" onPress={onClose} />
        </View>
        <ScrollView {...scrollList} contentContainerStyle={styles.body}>
          {section(
            'Show',
            SHOW_STATES.map((s) => (
              <Chip key={s.key} label={s.label} selected={draft.show === s.key} onPress={() => set({ show: s.key })} />
            )),
          )}
          {genres.length > 0 &&
            section(
              'Genres',
              genres.map((g) => (
                <Chip key={g} label={g} selected={draft.genres.includes(g)} onPress={() => toggleGenre(g)} />
              )),
            )}
          {section(
            'Year',
            DECADES.map((d) => (
              <Chip
                key={d.key}
                label={d.label}
                selected={draft.decades.includes(d.key)}
                onPress={() => toggleDecade(d.key)}
              />
            )),
          )}
          {section('Rating', [
            <Chip
              key="any"
              label="Any"
              selected={draft.minRating === undefined}
              onPress={() => set({ minRating: undefined })}
            />,
            ...MIN_RATINGS.map((r) => (
              <Chip key={r} label={`★ ${r}+`} selected={draft.minRating === r} onPress={() => set({ minRating: r })} />
            )),
          ])}
          {section(
            'Quality',
            <Chip label="4K" selected={draft.only4K} onPress={() => set({ only4K: !draft.only4K })} />,
          )}
        </ScrollView>
        <View style={[styles.footer, { borderTopColor: c.separator }]}>
          <Button
            title={showLabel}
            onPress={() => {
              onApply(draft);
              onClose();
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

const BADGE_SIZE = 18;

/** Round filter button: filled with a count badge while filters are on. */
export function FilterButton({ value, onPress }: { value: Filters; onPress: () => void }) {
  const c = useColors();
  const on = activeFilters(value).length;
  return (
    <View>
      <IconButton
        icon={{ ios: 'line.3.horizontal.decrease', android: 'filter_list' }}
        label={on ? `Filters, ${on} on` : 'Filters'}
        variant={on ? 'primary' : 'secondary'}
        onPress={onPress}
      />
      {on > 0 && (
        <View
          style={[styles.badge, { backgroundColor: c.danger }]}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
        >
          {/* Grows a little with the text size, never past the button it sits on. */}
          <Text variant="caption" maxFontSizeMultiplier={1.4} style={[styles.badgeText, { color: palettes.dark.text }]}>
            {on}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -spacing.xs,
    right: -spacing.xs,
    minWidth: BADGE_SIZE,
    minHeight: BADGE_SIZE,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontWeight: type.button.fontWeight },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: backdrop },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '88%',
    borderTopLeftRadius: radii.cardLarge,
    borderTopRightRadius: radii.cardLarge,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  headerButton: { minHeight: minTouch, justifyContent: 'center' },
  body: { padding: spacing.md, gap: spacing.lg },
  section: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  footer: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm + spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
