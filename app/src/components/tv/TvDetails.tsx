// SPDX-License-Identifier: GPL-3.0-or-later
// Apple TV Details (screen draft 08), at the bottom of a detail screen: About (tagline + whole overview), Information,
// then Production, On Your Server and Accessibility - plain text in three columns, label over value. The focus engine
// skips text, so the Media card is the one focusable spot down here (reaching it scrolls the Details into view): a
// click opens every track in a side panel.
import { SymbolView } from 'expo-symbols';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { BaseItemDto } from '@/api';
import type { DetailView, Fact } from '@/detail';
import type { TrackRow } from '@/items';
import { radii, scrollList, tv, useColors } from '@/theme';

import { ActionSheet } from '../ActionSheet';
import { fileLine } from '../DetailsSection';
import { Text } from '../Text';
import { focusStyles, rememberFocus } from './focus';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={tv.type.shelf}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function Facts({ facts }: { facts: Fact[] }) {
  return (
    <View style={styles.facts}>
      {facts.map(({ label, value }) => (
        <View key={label} accessible accessibilityLabel={`${label}, ${value}`}>
          <Text secondary style={tv.type.label}>
            {label}
          </Text>
          <Text style={tv.type.caption}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

const TRACK_TYPES: { key: 'video' | 'audio' | 'subtitles'; label: string }[] = [
  { key: 'video', label: 'Video' },
  { key: 'audio', label: 'Audio' },
  { key: 'subtitles', label: 'Subtitles' },
];

/** One track in the Media panel: focusable so the list scrolls with the remote; nothing to click. */
function TrackLine({ label, picked }: { label: string; picked: boolean }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityLabel={picked ? `${label}, default` : label}
      style={({ focused }) => [styles.track, focused && { backgroundColor: tv.unfocused }]}
    >
      <View style={styles.check}>
        {picked && <SymbolView name="checkmark" tintColor={c.text} size={tv.icon.button} />}
      </View>
      <Text secondary={!picked} style={[tv.type.caption, styles.trackLabel]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function TvDetails({ item, view }: { item: BaseItemDto; view: DetailView }) {
  const c = useColors();
  const [mediaOpen, setMediaOpen] = useState(false);
  const { media, versions, overview, tagline, information, production, library, sdh } = view;
  const file = fileLine(item);
  const rows = TRACK_TYPES.flatMap(({ key, label }) => {
    const row: TrackRow | undefined = media[key];
    return row ? [{ label: row.count > 1 ? `${label} (${row.count})` : label, row }] : [];
  });
  const hasMedia = rows.length > 0 || !!file || !!versions;
  const right = production.length > 0 || library.length > 0 || sdh;
  if (!overview && !information.length && !right && !hasMedia) return null;

  return (
    <View testID="tv-details" style={styles.root}>
      <View style={styles.columns}>
        {overview && (
          <View style={styles.column}>
            <Section title="About">
              {tagline && (
                <Text secondary style={[tv.type.body, styles.tagline]}>
                  {tagline}
                </Text>
              )}
              <Text style={tv.type.body}>{overview}</Text>
            </Section>
          </View>
        )}
        {information.length > 0 && (
          <View style={styles.column}>
            <Section title="Information">
              <Facts facts={information} />
            </Section>
          </View>
        )}
        {right && (
          <View style={[styles.column, styles.stack]}>
            {production.length > 0 && (
              <Section title="Production">
                <Facts facts={production} />
              </Section>
            )}
            {library.length > 0 && (
              <Section title="On Your Server">
                <Facts facts={library} />
              </Section>
            )}
            {sdh && (
              <Section title="Accessibility">
                <Text secondary style={tv.type.caption}>
                  SDH - subtitles for the deaf and hard of hearing: the original language plus sounds, music and who is
                  speaking.
                </Text>
              </Section>
            )}
          </View>
        )}
      </View>
      {hasMedia && (
        <Section title="Media">
          <Pressable
            onFocus={rememberFocus}
            accessibilityRole="button"
            accessibilityLabel="Media"
            accessibilityHint="Shows every track"
            onPress={() => setMediaOpen(true)}
            style={({ focused }) => [
              styles.card,
              { backgroundColor: focused ? c.elevated2 : c.surface },
              focused && focusStyles.lift,
            ]}
          >
            {rows.map(({ label, row }) => (
              <View key={label} style={styles.mediaRow}>
                <Text secondary style={[tv.type.label, styles.mediaLabel]}>
                  {label}
                </Text>
                <Text numberOfLines={1} style={[tv.type.caption, styles.mediaValue]}>
                  {row.value}
                </Text>
              </View>
            ))}
            {versions && (
              <View style={styles.mediaRow}>
                <Text secondary style={[tv.type.label, styles.mediaLabel]}>
                  {`Version (${versions.count})`}
                </Text>
                <Text numberOfLines={1} style={[tv.type.caption, styles.mediaValue]}>
                  {versions.name ?? ''}
                </Text>
              </View>
            )}
            {file && (
              <View style={styles.mediaRow}>
                <Text secondary style={[tv.type.label, styles.mediaLabel]}>
                  File
                </Text>
                <Text numberOfLines={1} style={[tv.type.caption, styles.mediaValue]}>
                  {file}
                </Text>
              </View>
            )}
          </Pressable>
        </Section>
      )}
      <ActionSheet visible={mediaOpen} side title="Media" onClose={() => setMediaOpen(false)}>
        <ScrollView {...scrollList} style={styles.panel} contentContainerStyle={styles.panelBody}>
          {rows.map(({ label, row }) => (
            <View key={label} style={styles.panelSection}>
              <Text secondary accessibilityRole="header" style={[tv.type.label, styles.panelHeading]}>
                {label.toUpperCase()}
              </Text>
              {row.tracks.map((t, i) => (
                <TrackLine key={i} label={t.label} picked={t.picked} />
              ))}
            </View>
          ))}
        </ScrollView>
      </ActionSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: tv.margin, gap: tv.gap.lg },
  columns: { flexDirection: 'row', alignItems: 'flex-start', gap: tv.columnGap },
  column: { flex: 1, minWidth: 0 },
  stack: { gap: tv.gap.lg },
  section: { gap: tv.gap.sm },
  tagline: { fontStyle: 'italic' },
  facts: { gap: tv.gap.sm },
  card: { borderRadius: radii.cardLarge, padding: tv.gap.lg, gap: tv.gap.sm, maxWidth: tv.textWidth },
  mediaRow: { flexDirection: 'row', alignItems: 'baseline', gap: tv.gap.sm },
  mediaLabel: { width: tv.detail.mediaLabelWidth },
  mediaValue: { flex: 1 },
  panel: { flexShrink: 1 },
  panelBody: { gap: tv.gap.lg, paddingVertical: tv.gap.sm },
  panelSection: { gap: tv.gap.sm / 2 },
  panelHeading: { letterSpacing: 1 },
  track: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tv.gap.sm,
    paddingHorizontal: tv.gap.sm,
    paddingVertical: tv.gap.sm / 2,
    borderRadius: radii.card,
  },
  check: { width: tv.icon.button },
  trackLabel: { flex: 1 },
});
