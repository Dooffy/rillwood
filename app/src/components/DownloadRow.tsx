// SPDX-License-Identifier: GPL-3.0-or-later
// Download rows (docs/context/downloads.md, Downloads screen; one look with kids Downloads - draft
// docs/research/downloads-parity.html). `DownloadRowFrame` is the shared row: art, title, caption lines, a 44pt slot at
// the end, › for a show. The Downloads tab's rows (one download, one show) are built on it; each reads its own live
// progress, so a progress event re-renders only that row, not the list. Swipe left to delete. `DownloadShowHeader` tops
// a show's page (the tab's and kids').
import { memo, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type PressableStateCallbackType } from 'react-native';

import { bytesOf, downloadStatus, episodeCount, groupStatus, type DownloadEntry } from '@/downloadList';
import { downloadGroup, summarize, useDownload, useDownloadSummary, useGroupValue, type Download } from '@/downloads';
import { documentUri } from '@/downloadSnapshot';
import { formatBytes } from '@/format';
import { expiresAt, expiryLabel, soonestExpiry, watchedSinceReset } from '@/offload';
import { useDownloadNetwork, useOffloadDays, useOffloadWatched } from '@/settings';
import { minTouch, pressedOpacity, spacing, useColors, useWide } from '@/theme';

import { Artwork } from './Artwork';
import { longPressProps } from './Card';
import { DownloadRing } from './DownloadRing';
import { EPISODE_ROW_STILL } from './EpisodeRow';
import { Chevron } from './List';
import { ProgressBar } from './ProgressBar';
import { SwipeToDelete } from './SwipeToDelete';
import { Text } from './Text';

/** Space between download rows in a list. */
export const DOWNLOAD_ROW_GAP = spacing.sm + spacing.xs;

/** Poster width in a row: phone size, bigger on wide screens (iPad) where a 56pt poster looks lost in a column. */
export const DOWNLOAD_POSTER = { phone: 56, wide: 140 } as const;
/** An episode's 16:9 still on wide screens: about the poster's height, so rows line up. */
export const WIDE_DOWNLOAD_STILL = 240;

/** A row's art width: a 2:3 poster or (`still`) a 16:9 episode still. */
export const downloadArtWidth = (still: boolean, wide: boolean) =>
  still ? (wide ? WIDE_DOWNLOAD_STILL : EPISODE_ROW_STILL) : wide ? DOWNLOAD_POSTER.wide : DOWNLOAD_POSTER.phone;

/**
 * A list's `ItemSeparatorComponent`: the row gap. Not `gap` on a virtualised list's content - its spacers for the
 * rows off screen would get the gap too.
 */
export function DownloadRowGap() {
  return <View style={styles.gap} />;
}

/** A caption line under a row's title: secondary, or orange (a timer under a day), or green (kids: kept). */
export type RowLine = { text: string; tone?: 'warning' | 'success' };

/** Lines left out when false / undefined. */
type Lines = readonly (RowLine | false | undefined | null)[];

/** Auto-remove's line: "Expires in 5 days", orange under a day; a show's "Next expires in 3 days". */
export const expiryLine = (expires: number | undefined, next = false): RowLine | undefined => {
  if (expires === undefined) return undefined;
  const { text, soon } = expiryLabel(expires);
  return { text: next ? `Next ${text.toLowerCase()}` : text, tone: soon ? 'warning' : undefined };
};

/** When the first download of a group goes (auto-remove), live: a finish or a Reset Timer re-renders. */
export function useGroupExpiry(group: string | null): number | undefined {
  const days = useOffloadDays();
  const hours = useOffloadWatched();
  return useGroupValue(group, (ds) => soonestExpiry(ds, days, hours));
}

function RowLines({ lines, wide }: { lines: Lines; wide: boolean }) {
  const c = useColors();
  return lines.map(
    (l) =>
      l && (
        <Text
          key={l.text}
          variant={wide ? 'body' : 'caption'}
          secondary={!l.tone}
          numberOfLines={1}
          style={l.tone && { color: l.tone === 'warning' ? c.warning : c.success }}
        >
          {l.text}
        </Text>
      ),
  );
}

export type DownloadRowFrameProps = {
  image: string | undefined;
  /** A 16:9 episode still, not a 2:3 poster. */
  still?: boolean;
  /** Over the art's corner (kids: the next episode's NEXT). */
  mark?: ReactNode;
  title: string;
  lines: Lines;
  /** In the 44pt box at the end, always there (empty keeps titles ending in one place): a ring, a round ↓ / ✓. */
  slot?: ReactNode;
  /** A show: › after the slot, opens what `onPress` does. */
  chevron?: boolean;
  /** Art + title (+ the ›). */
  onPress?: () => void;
  /** Long press (VoiceOver: "More"). */
  onLongPress?: () => void;
  /** The whole row is one button: its slot only shows something (a show's ring on the tab). */
  whole?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
};

/** The shared row: no card behind it - art, title (2 lines), caption lines, the slot, ›. */
export function DownloadRowFrame({
  image,
  still = false,
  mark,
  title,
  lines,
  slot,
  chevron = false,
  onPress,
  onLongPress,
  whole = false,
  accessibilityLabel,
  accessibilityHint,
}: DownloadRowFrameProps) {
  const wide = useWide();
  const press = {
    accessibilityRole: onPress ? ('button' as const) : undefined,
    accessibilityLabel,
    accessibilityHint,
    ...longPressProps(onLongPress),
    onPress,
  };
  const pressed = (style: object) => (state: PressableStateCallbackType) => [style, state.pressed && styles.pressed];
  const body = (
    <>
      <View testID="download-art" style={{ width: downloadArtWidth(still, wide) }}>
        <Artwork image={image} aspectRatio={still ? 16 / 9 : 2 / 3} />
        {mark}
      </View>
      <View style={styles.text}>
        <Text variant={wide ? 'sectionHeader' : 'label'} numberOfLines={2}>
          {title}
        </Text>
        <RowLines lines={lines} wide={wide} />
      </View>
    </>
  );
  const end = <View style={styles.slot}>{slot}</View>;
  const arrow = (
    <View style={styles.chevron}>
      <Chevron />
    </View>
  );
  if (whole)
    return (
      <Pressable {...press} style={pressed(styles.row)}>
        <View style={styles.main}>{body}</View>
        {end}
        {chevron && arrow}
      </Pressable>
    );
  return (
    <View style={styles.row}>
      {onPress || onLongPress ? (
        <Pressable {...press} style={pressed(styles.main)}>
          {body}
        </Pressable>
      ) : (
        <View style={styles.main}>{body}</View>
      )}
      {end}
      {chevron && (
        // The same as the art + title (VoiceOver has those): two pressables, not one around the slot's button.
        <Pressable
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          onPress={onPress}
          hitSlop={spacing.sm}
          style={pressed({})}
        >
          {arrow}
        </Pressable>
      )}
    </View>
  );
}

export type DownloadShowHeaderProps = {
  image: string | undefined;
  name: string;
  /** "5 episodes · 1.4 GB", "5 of 32 episodes · 1.4 GB". */
  totals: string;
  /** The bar under the totals (0-1), when there is one. */
  progress?: number;
  /** Its words for VoiceOver ("40% downloaded"). */
  progressLabel?: string;
  /** Under the bar: what it's doing, the next timer, kept. */
  lines: Lines;
};

/** Top of a show's downloads page (tab and kids): poster, name 20/700, totals, a bar, lines. */
export function DownloadShowHeader({ image, name, totals, progress, progressLabel, lines }: DownloadShowHeaderProps) {
  const wide = useWide();
  return (
    <View style={styles.head}>
      <View style={{ width: downloadArtWidth(false, wide) }}>
        <Artwork image={image} aspectRatio={2 / 3} />
      </View>
      <View style={styles.headText}>
        <Text variant="sectionHeader" accessibilityRole="header" numberOfLines={2}>
          {name}
        </Text>
        <Text variant={wide ? 'body' : 'caption'} secondary numberOfLines={1}>
          {totals}
        </Text>
        {progress !== undefined && (
          <View style={styles.meter}>
            <ProgressBar progress={progress} label={progressLabel} />
          </View>
        )}
        <RowLines lines={lines} wide={wide} />
      </View>
    </View>
  );
}

export const poster = (d: Download | null | undefined) =>
  d?.snapshot?.poster ? documentUri(d.snapshot.poster) : undefined;

/** An episode's 16:9 art, as its card online: its still, else its backdrop (the show's, mostly). */
function still(d: Download) {
  const art = d.snapshot?.still ?? d.snapshot?.backdrop;
  return art ? documentUri(art) : undefined;
}

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

/**
 * Poster (an episode: its still), title, size + status, the timer, then the ring (opens the menu) while it isn't done.
 * Tap plays a ready one.
 */
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
  const expiry = expiryLine(expiresAt(d, days, hours));
  const detail = done
    ? [formatBytes(d.total), watched && 'Watched'].filter(Boolean).join(' · ')
    : `${downloadStatus(d, network)} · ${bytesOf(d.bytes, d.total)}`;
  return (
    <SwipeToDelete label={`Delete ${name}`} onDelete={() => onDelete(d)}>
      <DownloadRowFrame
        image={d.seriesId ? still(d) : poster(d)}
        still={!!d.seriesId}
        title={name}
        lines={[{ text: detail }, expiry]}
        // Only a ready row does something on tap; the others have the long-press "More" action.
        onPress={done ? () => onPlay(d) : undefined}
        onLongPress={() => onMenu(d)}
        accessibilityLabel={[name, detail, expiry?.text].filter(Boolean).join(', ')}
        accessibilityHint={done ? 'Plays it' : undefined}
        slot={!done && <DownloadRing progress={progress} paused={state === 'paused'} onPress={() => onMenu(d)} />}
      />
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

/**
 * A show's downloaded episodes as one row: poster, name, "3 episodes · 1.8 GB", what it's doing (a ring) while any
 * isn't done, else when the next one goes.
 */
export const ShowDownloadRow = memo(function ShowDownloadRow({
  accountId,
  show,
  onOpen,
  onDelete,
  onMenu,
}: ShowDownloadRowProps) {
  const group = downloadGroup(accountId, { seriesId: show.seriesId });
  const summary = useDownloadSummary(group);
  // The latest episode's poster: an episode's snapshot poster is its show's.
  const first = useDownload(show.ids[0] ?? null);
  const network = useDownloadNetwork();
  const expires = useGroupExpiry(group);
  if (!summary) return null;
  const detail = `${episodeCount(show.ids.length)} · ${formatBytes(show.total)}`;
  const running = summary.state !== 'done';
  const status = running ? `${groupStatus(summary, network)} · ${summary.done} of ${summary.ids.length}` : undefined;
  const next = running ? undefined : expiryLine(expires, true);
  return (
    <SwipeToDelete label={`Delete ${show.name}`} onDelete={() => onDelete(show)}>
      <DownloadRowFrame
        whole
        chevron
        image={poster(first)}
        title={show.name}
        lines={[{ text: detail }, status !== undefined && { text: status }, next]}
        onPress={() => onOpen(show)}
        onLongPress={() => onMenu(show)}
        accessibilityLabel={[show.name, detail, status, next?.text].filter(Boolean).join(', ')}
        accessibilityHint="Shows the downloaded episodes"
        slot={running && <DownloadRing progress={summary.progress} paused={summary.state === 'paused'} size={24} />}
      />
    </SwipeToDelete>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm + spacing.xs, minHeight: minTouch },
  text: { flex: 1, gap: spacing.xs / 2 },
  slot: { width: minTouch, height: minTouch, alignItems: 'center', justifyContent: 'center' },
  chevron: { width: spacing.lg, alignItems: 'center' },
  pressed: { opacity: pressedOpacity },
  gap: { height: DOWNLOAD_ROW_GAP },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + spacing.xs },
  headText: { flex: 1, gap: spacing.xs },
  meter: { marginVertical: spacing.xs / 2 },
});
