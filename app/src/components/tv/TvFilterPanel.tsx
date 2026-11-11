// SPDX-License-Identifier: GPL-3.0-or-later
// Apple TV Library filters (screen draft 05): a side panel down the right edge (`ActionSheet side` → `TvMenu`) with the
// phone sheet's filters, one sideways pill row each - Show, Genres, Year, Rating, Quality. As tvOS media apps do, a pick
// applies at once (the grid behind updates once picking pauses) and Back closes; no Show Results button. Clear Filters
// sits on top, one press up from the first focus (the selected Show pill).
import { useEffect, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { activeFilters, DECADES, MIN_RATINGS, SHOW_STATES, type Filters } from '@/items';
import { scrollList, tv } from '@/theme';
import { useDebounced } from '@/useDebounced';

import { ActionSheet } from '../ActionSheet';
import { useFilterDraft } from '../FilterSheet';
import { Text } from '../Text';
import { TvFocusRow } from './focus';
import { TvButton } from './TvButton';
import { TvPill } from './TvPill';

/** Apply once picking pauses, not per press (each change refetches the grid). */
const APPLY_DEBOUNCE_MS = 250;

export type TvFilterPanelProps = {
  visible: boolean;
  value: Filters;
  /** Genres to offer (from the server). */
  genres: string[];
  /** Called with the filters as they change (no apply step). */
  onChange: (filters: Filters) => void;
  onClose: () => void;
};

export function TvFilterPanel({ visible, value, genres, onChange, onClose }: TvFilterPanelProps) {
  const { draft, set, reset, toggleGenre, toggleDecade } = useFilterDraft(visible, value);
  const settled = useDebounced(draft, APPLY_DEBOUNCE_MS);
  // Applies the picks once they settle (`settled === draft`: not a lagging value from the last opening).
  useEffect(() => {
    if (visible && settled === draft && draft !== value) onChange(draft);
  }, [visible, settled, draft, value, onChange]);
  // Closing applies what's still waiting.
  const close = () => {
    if (draft !== value) onChange(draft);
    onClose();
  };
  // Clear Filters shows once anything is on and stays for this opening: focus would be lost if it went away under it.
  const [clearShown, setClearShown] = useState(false);
  if (!visible && clearShown) setClearShown(false);
  else if (visible && !clearShown && activeFilters(draft).length > 0) setClearShown(true);

  // The panel's own pills and buttons don't remember focus: what had it last opened the panel.
  const pill = (key: string, label: string, selected: boolean, onPress: () => void, preferredFocus = false) => (
    <TvPill
      key={key}
      label={label}
      selected={selected}
      onPress={onPress}
      preferredFocus={preferredFocus}
      rememberFocus={false}
    />
  );
  const section = (title: string, pills: ReactNode) => (
    <View style={styles.section}>
      <Text secondary accessibilityRole="header" style={[tv.type.label, styles.heading]}>
        {title.toUpperCase()}
      </Text>
      {/* One row per section, scrolled sideways when long (Genres): a swipe down from any pill lands on the next
          section (its last-focused pill) - wrapped lines left gaps with nothing straight below. */}
      <TvFocusRow>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills}>
          {pills}
        </ScrollView>
      </TvFocusRow>
    </View>
  );

  return (
    <ActionSheet visible={visible} side title="Filters" onClose={close}>
      <ScrollView {...scrollList} style={styles.scroll} contentContainerStyle={styles.body}>
        {clearShown && (
          <View style={styles.clear}>
            <TvButton variant="quiet" title="Clear Filters" icon="xmark" rememberFocus={false} onPress={reset} />
          </View>
        )}
        {section(
          'Show',
          SHOW_STATES.map((s) =>
            pill(s.key, s.label, draft.show === s.key, () => set({ show: s.key }), draft.show === s.key),
          ),
        )}
        {genres.length > 0 &&
          section(
            'Genres',
            genres.map((g) => pill(g, g, draft.genres.includes(g), () => toggleGenre(g))),
          )}
        {section(
          'Year',
          DECADES.map((d) => pill(String(d.key), d.label, draft.decades.includes(d.key), () => toggleDecade(d.key))),
        )}
        {section('Rating', [
          pill('any', 'Any', draft.minRating === undefined, () => set({ minRating: undefined })),
          ...MIN_RATINGS.map((r) => pill(String(r), `★ ${r}+`, draft.minRating === r, () => set({ minRating: r }))),
        ])}
        {section(
          'Quality',
          pill('4k', '4K', draft.only4K, () => set({ only4K: !draft.only4K })),
        )}
      </ScrollView>
    </ActionSheet>
  );
}

const styles = StyleSheet.create({
  // Shrinks to the panel; the sections scroll.
  scroll: { flexShrink: 1 },
  // Room above / below for a focused pill to grow (the rows add their own at the sides).
  body: { gap: tv.gap.lg, paddingVertical: tv.gap.sm },
  section: { gap: tv.gap.sm },
  heading: { letterSpacing: 1, paddingHorizontal: tv.gap.sm },
  pills: { gap: tv.gap.sm / 2, padding: tv.gap.sm },
  // Left-aligned with the pills, room to grow when focused.
  clear: { alignItems: 'flex-start', paddingHorizontal: tv.gap.sm },
});
