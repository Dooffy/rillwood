// SPDX-License-Identifier: GPL-3.0-or-later
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import type { BaseItemDto } from '@/api';
import type { DetailView } from '@/detail';
import { getDownload, useDownloadSummary } from '@/downloads';
import { formatBytes } from '@/format';
import { expiresAt, expiryLabel } from '@/offload';
import { useOffloadDays, useOffloadWatched } from '@/settings';
import { spacing, useWide } from '@/theme';
import { useDownloadGroup } from '@/useDownloadControl';

import { ListRow, ListSection } from './List';
import { MediaRow } from './MediaRow';
import { Text } from './Text';

/** "4.2 GB MKV" for the first file; undefined without a size. */
function fileLine(item: BaseItemDto): string | undefined {
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

/**
 * Bottom of a detail screen: About (the whole overview - the hero's More scrolls here) and Media (tracks, then version,
 * file and download). Two columns on wide screens, one above the other on phones. `onLayout`: where it sits, to scroll to.
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
  const wide = useWide();
  const file = fileLine(item);
  const download = useDownloadLine(item);
  const { media, versions, overview } = view;
  const tracks = !!(media.video || media.audio || media.subtitles);
  const extra = !!(versions || file || download);
  if (!overview && !tracks && !extra) return null;

  return (
    <View testID="details" onLayout={onLayout} style={styles.section}>
      <Text variant="sectionHeader" accessibilityRole="header">
        Details
      </Text>
      <View testID="details-columns" style={wide ? styles.columns : styles.stack}>
        {overview && (
          <View style={wide && styles.column}>
            <ListSection title="About">
              <View style={styles.about}>
                <Text selectable>{overview}</Text>
              </View>
            </ListSection>
          </View>
        )}
        {(tracks || extra) && (
          <View style={[styles.stack, wide && styles.column]}>
            {tracks && (
              <ListSection title="Media">
                {media.video && <MediaRow label="Video" row={media.video} />}
                {media.audio && <MediaRow label="Audio" row={media.audio} />}
                {media.subtitles && <MediaRow label="Subtitles" row={media.subtitles} />}
              </ListSection>
            )}
            {extra && (
              <ListSection title={tracks ? undefined : 'Media'}>
                {versions && <ListRow label={`Version (${versions.count})`} value={versions.name} />}
                {file && <ListRow label="File" value={file} />}
                {download && <ListRow label="Download" value={download} />}
              </ListSection>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingHorizontal: spacing.md, gap: spacing.sm },
  columns: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.lg },
  column: { flex: 1, minWidth: 0 },
  stack: { gap: spacing.md },
  about: { padding: spacing.md },
});
