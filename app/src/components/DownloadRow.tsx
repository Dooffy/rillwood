// SPDX-License-Identifier: GPL-3.0-or-later
// Downloads tab rows: one download (a movie, an episode) and one show (its episodes together). Each reads its own live
// progress, so a progress event re-renders only that row, not the list. Swipe left to delete.
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { downloadStatus, episodeCount, type DownloadEntry } from '@/downloadList';
import { downloadGroup, summarize, useDownload, useDownloadSummary, type Download } from '@/downloads';
import { snapshotUri } from '@/downloadSnapshot';
import { formatBytes } from '@/format';
import { useDownloadNetwork } from '@/settings';
import { minTouch, pressedOpacity, spacing } from '@/theme';

import { Artwork } from './Artwork';
import { longPressProps } from './Card';
import { DownloadRing } from './DownloadRing';
import { Chevron } from './List';
import { SwipeToDelete } from './SwipeToDelete';
import { Text } from './Text';

export type DownloadRowProps = {
  id: string;
  /** Shown instead of the download's own title (an episode in its show's list: "3. Pilot"). */
  title?: string;
  /** Ready rows: play it. */
  onPlay: (d: Download) => void;
  /** Swipe → Delete: asks, then deletes. */
  onDelete: (d: Download) => void;
  /** Ring tap, long press (VoiceOver: "More"): the download's menu. */
  onMenu: (d: Download) => void;
};

const poster = (d: Download | undefined) => (d?.snapshot?.poster ? snapshotUri(d.snapshot.poster) : undefined);

/** Poster, title, size + status, then the ring (opens the menu) while it isn't done. Tap plays a ready one. */
export const DownloadRow = memo(function DownloadRow({ id, title, onPlay, onDelete, onMenu }: DownloadRowProps) {
  const d = useDownload(id);
  const network = useDownloadNetwork();
  if (!d) return null;
  const { state, progress } = summarize([d])!;
  const done = state === 'done';
  const name = title ?? d.title;
  const detail = done
    ? formatBytes(d.total)
    : `${downloadStatus(d, network)} · ${formatBytes(Math.min(d.bytes, d.total))} of ${formatBytes(d.total)}`;
  return (
    <SwipeToDelete label={`Delete ${d.title}`} onDelete={() => onDelete(d)}>
      <View style={styles.row}>
        <Pressable
          // Only a ready row does something on tap; the others have the long-press "More" action.
          accessibilityRole={done ? 'button' : undefined}
          accessibilityLabel={`${name}, ${detail}`}
          accessibilityHint={done ? 'Plays it' : undefined}
          {...longPressProps(() => onMenu(d))}
          onPress={done ? () => onPlay(d) : undefined}
          style={({ pressed }) => [styles.main, pressed && styles.pressed]}
        >
          <View style={styles.poster}>
            <Artwork image={poster(d)} aspectRatio={2 / 3} />
          </View>
          <View style={styles.text}>
            <Text variant="label" numberOfLines={2}>
              {name}
            </Text>
            <Text variant="caption" secondary numberOfLines={1}>
              {detail}
            </Text>
          </View>
        </Pressable>
        {!done && (
          <View style={styles.control}>
            <DownloadRing progress={progress} paused={state === 'paused'} onPress={() => onMenu(d)} />
          </View>
        )}
      </View>
    </SwipeToDelete>
  );
});

export type ShowDownloadRowProps = {
  accountId: string;
  show: Extract<DownloadEntry, { kind: 'show' }>;
  /** Tap: the show's episodes. */
  onOpen: (show: ShowDownloadRowProps['show']) => void;
  /** Swipe → Delete (every episode), long press: asks, then deletes. */
  onDelete: (show: ShowDownloadRowProps['show']) => void;
};

/** A show's downloaded episodes as one row: poster, name, "3 episodes · 1.8 GB", a ring while any isn't done. */
export const ShowDownloadRow = memo(function ShowDownloadRow({
  accountId,
  show,
  onOpen,
  onDelete,
}: ShowDownloadRowProps) {
  const summary = useDownloadSummary(downloadGroup(accountId, { seriesId: show.seriesId }));
  // The latest episode's poster: an episode's snapshot poster is its show's.
  const first = useDownload(show.ids[0] ?? null);
  if (!summary) return null;
  const detail = `${episodeCount(show.ids.length)} · ${formatBytes(show.total)}`;
  const status = summary.state === 'downloading' ? 'Downloading' : summary.state === 'paused' ? 'Paused' : undefined;
  return (
    <SwipeToDelete label={`Delete ${show.name}`} onDelete={() => onDelete(show)}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={[show.name, detail, status].filter(Boolean).join(', ')}
        accessibilityHint="Shows the downloaded episodes"
        {...longPressProps(() => onDelete(show))}
        onPress={() => onOpen(show)}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      >
        <View style={styles.main}>
          <View style={styles.poster}>
            <Artwork image={poster(first ?? undefined)} aspectRatio={2 / 3} />
          </View>
          <View style={styles.text}>
            <Text variant="label" numberOfLines={2}>
              {show.name}
            </Text>
            <Text variant="caption" secondary numberOfLines={1}>
              {detail}
            </Text>
            {status && (
              <Text variant="caption" secondary numberOfLines={1}>
                {status}
              </Text>
            )}
          </View>
        </View>
        {status && <DownloadRing progress={summary.progress} paused={summary.state === 'paused'} size={24} />}
        <View style={styles.chevron}>
          <Chevron />
        </View>
      </Pressable>
    </SwipeToDelete>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm + spacing.xs, minHeight: minTouch },
  poster: { width: 56 },
  text: { flex: 1, gap: spacing.xs / 2 },
  control: { width: minTouch, height: minTouch, alignItems: 'center', justifyContent: 'center' },
  chevron: { width: spacing.lg, alignItems: 'center' },
  pressed: { opacity: pressedOpacity },
});
