// SPDX-License-Identifier: GPL-3.0-or-later
// Player overlay, Apple TV style, on glass (`Glass`): close + title on top, ⟲10 / play-pause / 10⟳ in the middle,
// scrubber at the bottom (`PlayerScrubber` in `PlayerBottom`, placed by the screen: the bottom stack also holds the Up
// Next card, which stays mounted while the controls come and go). No dimming layer - the glass keeps the controls
// readable over the video. The screen decides when they show; before playback starts (loading, error) only the top bar.
// Tablets: wider margins and bigger centre buttons (the same layout, sized for the screen).
import { useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View, type GestureResponderEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Glass } from '@/components/Glass';
import { IconButton } from '@/components/IconButton';
import { clamp01 } from '@/components/ProgressBar';
import { Text } from '@/components/Text';
import { formatClock } from '@/format';
import { positionAt, SEEK_STEP } from '@/player/controls';
import { useProgress, type ProgressStore } from '@/player/progress';
import type { VideoZoom } from '@/player/Player';
import { minTouch, onArtwork, radii, spacing, useWide } from '@/theme';

export type PlayerControlsProps = {
  title?: string;
  subtitle?: string;
  /** False while loading / on error: top bar only. */
  started: boolean;
  paused: boolean;
  onClose: () => void;
  /** Opens the audio / subtitles / speed menu (shown once playing). */
  onTracks: () => void;
  /** Current video zoom; with `onToggleZoom`, a button switches it (landscape only - portrait always fits). */
  zoom?: VideoZoom;
  onToggleZoom?: () => void;
  onTogglePause: () => void;
  onSeekBy: (seconds: number) => void;
};

export function PlayerControls(props: PlayerControlsProps) {
  const { title, subtitle, started, paused, onClose, onTracks, zoom, onToggleZoom, onTogglePause, onSeekBy } = props;
  const insets = useSafeAreaInsets();
  const wide = useWide();
  const sides = sidePadding(insets, wide);
  const filled = zoom === 'fill';
  return (
    // box-none: touches between the controls reach the video (tap to hide, pull down to close).
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <View style={[styles.top, sides, { paddingTop: insets.top + spacing.sm }]} pointerEvents="box-none">
        <IconButton
          icon={{ ios: 'chevron.down', android: 'keyboard_arrow_down' }}
          label="Close"
          variant="glass"
          onPress={onClose}
        />
        {(title !== undefined || subtitle !== undefined) && (
          <Glass style={styles.titles}>
            {title !== undefined && (
              <Text variant="label" numberOfLines={1}>
                {title}
              </Text>
            )}
            {subtitle !== undefined && (
              <Text variant="caption" secondary numberOfLines={1}>
                {subtitle}
              </Text>
            )}
          </Glass>
        )}
        {started && (
          // Right edge, past the title pill.
          <View style={styles.trailing}>
            {onToggleZoom && (
              <IconButton
                icon={
                  filled
                    ? { ios: 'arrow.down.right.and.arrow.up.left', android: 'close_fullscreen' }
                    : { ios: 'arrow.up.left.and.arrow.down.right', android: 'open_in_full' }
                }
                label={filled ? 'Fit to screen' : 'Fill screen'}
                variant="glass"
                onPress={onToggleZoom}
              />
            )}
            <IconButton
              icon={{ ios: 'ellipsis', android: 'more_horiz' }}
              label="Audio, subtitles and speed"
              variant="glass"
              onPress={onTracks}
            />
          </View>
        )}
      </View>
      {started && (
        <View style={[styles.center, wide && styles.centerWide]} pointerEvents="box-none">
          <IconButton
            icon={{ ios: 'gobackward.10', android: 'replay_10' }}
            label={`Back ${SEEK_STEP} seconds`}
            variant="glass"
            size={wide ? 'large' : undefined}
            onPress={() => onSeekBy(-SEEK_STEP)}
          />
          <IconButton
            icon={paused ? { ios: 'play.fill', android: 'play_arrow' } : { ios: 'pause.fill', android: 'pause' }}
            label={paused ? 'Play' : 'Pause'}
            variant="glass"
            size={wide ? 'xlarge' : 'large'}
            onPress={onTogglePause}
          />
          <IconButton
            icon={{ ios: 'goforward.10', android: 'forward_10' }}
            label={`Forward ${SEEK_STEP} seconds`}
            variant="glass"
            size={wide ? 'large' : undefined}
            onPress={() => onSeekBy(SEEK_STEP)}
          />
        </View>
      )}
    </View>
  );
}

/** Space between the controls and the screen's sides: wider on tablets. */
const playerSide = (wide: boolean) => (wide ? spacing.lg : spacing.md);

/** Where the tracks menu hangs on tablets: under the top bar's right end (the "⋯" button). */
export const tracksAnchor = (insets: { top: number; right: number }) => ({
  top: insets.top + spacing.sm + minTouch + spacing.sm,
  right: insets.right + playerSide(true),
});

const sidePadding = (insets: { left: number; right: number }, wide: boolean) => ({
  paddingLeft: insets.left + playerSide(wide),
  paddingRight: insets.right + playerSide(wide),
});

/** Bottom edge of the player, clear of the safe area: the Up Next card over the scrubber panel. */
export function PlayerBottom({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const wide = useWide();
  return (
    <View
      style={[styles.bottom, sidePadding(insets, wide), { paddingBottom: insets.bottom + playerSide(wide) }]}
      pointerEvents="box-none"
    >
      {children}
    </View>
  );
}

export type PlayerScrubberProps = {
  progress: ProgressStore;
  onSeek: (seconds: number) => void;
  onSeekBy: (seconds: number) => void;
  /** Scrubbing keeps the controls up. */
  onScrub: (active: boolean) => void;
};

/** Scrubber panel on glass with elapsed / remaining, shown with the controls (inside `PlayerBottom`). */
export function PlayerScrubber(props: PlayerScrubberProps) {
  return (
    <Glass style={styles.panel}>
      <Scrubber {...props} />
    </Glass>
  );
}

/** Track; drag or tap to seek, VoiceOver swipes up / down for ±10s. Seeks on release. */
function Scrubber({ progress, onSeek, onScrub, onSeekBy }: PlayerScrubberProps) {
  const { position, duration } = useProgress(progress);
  const width = useRef(0);
  const [dragging, setDragging] = useState<number | null>(null);
  const shown = dragging ?? position;
  const fraction = clamp01(shown / duration);
  const at = (e: GestureResponderEvent) => positionAt(e.nativeEvent.locationX, width.current, duration);
  const end = () => {
    setDragging(null);
    onScrub(false);
  };

  return (
    <View>
      <View
        testID="scrubber"
        style={styles.track}
        onLayout={(e) => {
          width.current = e.nativeEvent.layout.width;
        }}
        onStartShouldSetResponder={() => duration > 0}
        onResponderTerminationRequest={() => false}
        onResponderGrant={(e) => {
          onScrub(true);
          setDragging(at(e));
        }}
        onResponderMove={(e) => setDragging(at(e))}
        onResponderRelease={(e) => {
          onSeek(at(e));
          end();
        }}
        onResponderTerminate={end}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Playback position"
        accessibilityValue={{ text: `${formatClock(shown)} of ${formatClock(duration)}` }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => onSeekBy(e.nativeEvent.actionName === 'increment' ? SEEK_STEP : -SEEK_STEP)}
      >
        {/* Children ignore touches, so locationX is always relative to the track. */}
        <View style={styles.bar} pointerEvents="none">
          <View style={[styles.fill, { width: `${fraction * 100}%` }]} />
        </View>
        <View style={[styles.thumb, { left: `${fraction * 100}%` }]} pointerEvents="none" />
      </View>
      <View style={styles.times} pointerEvents="none">
        <Text variant="caption">{formatClock(shown)}</Text>
        <Text variant="caption">-{formatClock(Math.max(duration - shown, 0))}</Text>
      </View>
    </View>
  );
}

const BAR = 4;
const THUMB = 14;

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  // Title pill: as wide as its text, never past the screen edge.
  trailing: { marginLeft: 'auto', flexDirection: 'row', gap: spacing.sm },
  titles: {
    flexShrink: 1,
    minHeight: minTouch,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
  },
  center: {
    ...StyleSheet.absoluteFill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg * 2,
  },
  centerWide: { gap: spacing.lg * 3 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, gap: spacing.sm },
  panel: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm, borderRadius: radii.cardLarge },
  // Full touch height around a thin bar.
  track: { height: minTouch, justifyContent: 'center' },
  bar: { height: BAR, borderRadius: radii.pill, backgroundColor: onArtwork.track, overflow: 'hidden' },
  fill: { height: BAR, backgroundColor: onArtwork.fill },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    marginLeft: -THUMB / 2,
    borderRadius: radii.pill,
    backgroundColor: onArtwork.fill,
  },
  times: { flexDirection: 'row', justifyContent: 'space-between' },
});
