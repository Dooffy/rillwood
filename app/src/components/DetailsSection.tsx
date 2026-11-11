// SPDX-License-Identifier: GPL-3.0-or-later
import type { ReactNode } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import type { BaseItemDto } from '@/api';
import type { DetailView, Fact } from '@/detail';
import { getDownload, useDownloadSummary } from '@/downloads';
import { formatBytes } from '@/format';
import { expiresAt, expiryLabel } from '@/offload';
import { useOffloadDays, useOffloadWatched } from '@/settings';
import { spacing, useTwoColumns } from '@/theme';
import { useDownloadGroup } from '@/useDownloadControl';

import { ListRow, ListSection } from './List';
import { MediaRow } from './MediaRow';
import { Text } from './Text';

/** "4.2 GB MKV" for the first file; undefined without a size. */
export function fileLine(item: BaseItemDto): string | undefined {
  const source = item.MediaSources?.[0];
  if (!source?.Size) return undefined;
  return [formatBytes(source.Size), source.Container?.split(',')[0].toUpperCase()].filter(Boolean).join(' ');
}

/** What the item's download is doing: "Expires in 90 days", "Kept until deleted", "Downloading", "Paused". */
function useDownloadLine(item: BaseItemDto): string | undefined {
  const summary = useDownloadSummary(useDownloadGroup(item));
  const days = useOffloadDays();
  const hours = useOffloadWatched();
  if (!summary) return undefined;
  if (summary.state !== 'done') return summary.state === 'downloading' ? 'Downloading' : 'Paused';
  const download = summary.ids.map(getDownload).find((d) => d?.status === 'done');
  const expires = download ? expiresAt(download, days, hours) : undefined;
  return expires === undefined ? 'Kept until deleted' : expiryLabel(expires).text;
}

/** Read-only facts as plain text, label over value, one under the other (Apple's Information style). */
function Facts({ facts }: { facts: Fact[] }) {
  return (
    <View style={styles.facts}>
      {facts.map(({ label, value }) => (
        // One element for VoiceOver: "Studio, Northlight Pictures".
        <View key={label} accessible accessibilityLabel={`${label}, ${value}`}>
          <Text variant="label">{label}</Text>
          <Text secondary selectable>
            {value}
          </Text>
        </View>
      ))}
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.block}>
      <Text variant="sectionHeader" accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

/**
 * Bottom of a detail screen. Facts you only read are plain text: About (tagline + whole overview - the hero's More
 * scrolls here), then Information beside Production, On Your Server and Accessibility (what SDH means, when a
 * track is) - two columns on big tablet windows (`useTwoColumns`), one otherwise. Media is a card: its rows open to list every track.
 * `onLayout`: where it sits, to scroll to.
 */
export function DetailsSection({
  item,
  view,
  onLayout,
}: {
  item: BaseItemDto;
  view: DetailView;
  onLayout?: (event: LayoutChangeEvent) => void;
}) {
  const wide = useTwoColumns();
  const file = fileLine(item);
  const download = useDownloadLine(item);
  const { media, versions, overview, tagline, information, production, library, sdh } = view;
  const tracks = !!(media.video || media.audio || media.subtitles);
  const extra = !!(versions || file || download);
  if (!overview && !information.length && !production.length && !library.length && !tracks && !extra) return null;

  return (
    <View testID="details" onLayout={onLayout} style={styles.section}>
      {overview && (
        <Section title="About">
          <View style={styles.about}>
            {tagline && (
              <Text secondary style={styles.tagline}>
                {tagline}
              </Text>
            )}
            <Text selectable>{overview}</Text>
          </View>
        </Section>
      )}
      {/* Two-column windows: what the title is on the left; who made it, the server's record and accessibility on the right. */}
      <View testID="details-columns" style={wide ? styles.columns : styles.stack}>
        {information.length > 0 && (
          <View style={wide && styles.column}>
            <Section title="Information">
              <Facts facts={information} />
            </Section>
          </View>
        )}
        <View style={[styles.stack, wide && styles.column]}>
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
              <Text secondary>
                <Text variant="label" secondary>
                  SDH{'  '}
                </Text>
                Subtitles for the deaf and hard of hearing: the original language plus sounds, music and who is
                speaking.
              </Text>
            </Section>
          )}
        </View>
      </View>
      {(tracks || extra) && (
        <Section title="Media">
          <View style={styles.media}>
            {tracks && (
              <ListSection>
                {media.video && <MediaRow label="Video" row={media.video} />}
                {media.audio && <MediaRow label="Audio" row={media.audio} />}
                {media.subtitles && <MediaRow label="Subtitles" row={media.subtitles} />}
              </ListSection>
            )}
            {extra && (
              <ListSection>
                {versions && <ListRow label={`Version (${versions.count})`} value={versions.name} />}
                {file && <ListRow label="File" value={file} />}
                {download && <ListRow label="Download" value={download} />}
              </ListSection>
            )}
          </View>
        </Section>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingHorizontal: spacing.md, gap: spacing.lg + spacing.sm },
  block: { gap: spacing.sm + spacing.xs },
  about: { gap: spacing.sm },
  tagline: { fontStyle: 'italic' },
  media: { gap: spacing.md },
  facts: { gap: spacing.md },
  columns: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.lg },
  column: { flex: 1, minWidth: 0 },
  stack: { gap: spacing.lg + spacing.sm },
});
