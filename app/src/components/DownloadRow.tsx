// SPDX-License-Identifier: GPL-3.0-or-later
// Downloads tab rows: one download (a movie, an episode) and one show (its episodes together). Each reads its own live
// progress, so a progress event re-renders only that row, not the list. Swipe left to delete.
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { downloadStatus, episodeCount, type DownloadEntry } from '@/downloadList';
import { downloadGroup, getDownload, summarize, useDownload, useDownloadSummary, type Download } from '@/downloads';
import { documentUri } from '@/downloadSnapshot';
import { formatBytes } from '@/format';
import { expiresAt, expiryLabel, watchedSinceReset } from '@/offload';
import { useDownloadNetwork, useOffloadDays, useOffloadWatched } from '@/settings';
import { minTouch, pressedOpacity, spacing, useColors } from '@/theme';

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

/** Space between download rows in a list. */
export const DOWNLOAD_ROW_GAP = spacing.sm + spacing.xs;

/**
 * A list's `ItemSeparatorComponent`: the row gap. Not `gap` on a virtualised list's content - its spacers for the
 * rows off screen would get the gap too.
 */
export function DownloadRowGap() {
  return <View style={styles.gap} />;
}

const poster = (d: Download | undefined) => (d?.snapshot?.poster ? documentUri(d.snapshot.poster) : undefined);

/** Poster, title, size + status, then the ring (opens the menu) while it isn't done. Tap plays a ready one. */
export const DownloadRow = memo(function DownloadRow({ id, title, onPlay, onDelete, onMenu }: DownloadRowProps) {
  const d = useDownload(id);
  const network = useDownloadNetwork();
  const days = useOffloadDays();
  const hours = useOffloadWatched();
  if (!d) return null;
  const { state, progress } = summarize([d])!;
  const done = state === 'done';
  const name = title ?? d.title;
  // Auto-remove: "Watched" once the watched rule counts it, then when it goes.
  const watched = done && hours > 0 && watchedSinceReset(d);
  const expires = expiresAt(d, days, hours);
  const expiry = expires === undefined ? undefined : expiryLabel(expires);
  const detail = done
    ? [formatBytes(d.total), watched && 'Watched'].filter(Boolean).join(' · ')
    : `${downloadStatus(d, network)} · ${formatBytes(Math.min(d.bytes, d.total))} of ${formatBytes(d.total)}`;
  return (
    <SwipeToDelete label={`Delete ${name}`} onDelete={() => onDelete(d)}>
      <View style={styles.row}>
        <Pressable
          // Only a ready row does something on tap; the others have the long-press "More" action.
          accessibilityRole={done ? 'button' : undefined}
          accessibilityLabel={[name, detail, expiry?.text].filter(Boolean).join(', ')}
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
            {expiry && <Expiry {...expiry} />}
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
  /** Swipe → Delete (every episode): asks, then deletes. */
  onDelete: (show: ShowDownloadRowProps['show']) => void;
  /** Long press (VoiceOver: "More"): Reset Timers, Delete Downloads. */
  onMenu: (show: ShowDownloadRowProps['show']) => void;
};

/** A show's downloaded episodes as one row: poster, name, "3 episodes · 1.8 GB", a ring while any isn't done. */
export const ShowDownloadRow = memo(function ShowDownloadRow({
  accountId,
  show,
  onOpen,
  onDelete,
  onMenu,
}: ShowDownloadRowProps) {
  const summary = useDownloadSummary(downloadGroup(accountId, { seriesId: show.seriesId }));
  // The latest episode's poster: an episode's snapshot poster is its show's.
  const first = useDownload(show.ids[0] ?? null);
  const days = useOffloadDays();
  const hours = useOffloadWatched();
  if (!summary) return null;
  const detail = `${episodeCount(show.ids.length)} · ${formatBytes(show.total)}`;
  // The episode that goes first (the list re-renders this row when any of them changes).
  const soonest = Math.min(
    ...show.ids.map((id) => {
      const e = getDownload(id);
      return (e && expiresAt(e, days, hours)) ?? Infinity;
    }),
  );
  const expiry = Number.isFinite(soonest) ? expiryLabel(soonest) : undefined;
  const status = summary.state === 'downloading' ? 'Downloading' : summary.state === 'paused' ? 'Paused' : undefined;
  return (
    <SwipeToDelete label={`Delete ${show.name}`} onDelete={() => onDelete(show)}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={[show.name, detail, status, expiry && `Next ${expiry.text.toLowerCase()}`]
          .filter(Boolean)
          .join(', ')}
        accessibilityHint="Shows the downloaded episodes"
        {...longPressProps(() => onMenu(show))}
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
            {status ? (
              <Text variant="caption" secondary numberOfLines={1}>
                {status}
              </Text>
            ) : (
              expiry && <Expiry text={`Next ${expiry.text.toLowerCase()}`} soon={expiry.soon} />
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

/** "Expires in 5 days" / "45h": orange under a day. */
function Expiry({ text, soon }: { text: string; soon: boolean }) {
  const c = useColors();
  return (
    <Text variant="caption" secondary={!soon} numberOfLines={1} style={soon && { color: c.warning }}>
      {text}
    </Text>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm + spacing.xs, minHeight: minTouch },
  poster: { width: 56 },
  text: { flex: 1, gap: spacing.xs / 2 },
  control: { width: minTouch, height: minTouch, alignItems: 'center', justifyContent: 'center' },
  chevron: { width: spacing.lg, alignItems: 'center' },
  pressed: { opacity: pressedOpacity },
  gap: { height: DOWNLOAD_ROW_GAP },
});
