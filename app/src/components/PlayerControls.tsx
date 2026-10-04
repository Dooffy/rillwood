// SPDX-License-Identifier: GPL-3.0-or-later
// Player overlay, Apple TV style, on glass (`Glass`): close + title on top, ⟲10 / play-pause / 10⟳ in the middle,
// scrubber at the bottom. No dimming layer - the glass keeps the controls readable over the video.
// The screen decides when it shows; before playback starts (loading, error) only the top bar is there.
import { useMemo, useRef, useState } from 'react';
import { StyleSheet, View, type GestureResponderEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Glass } from '@/components/Glass';
import { IconButton } from '@/components/IconButton';
import { clamp01 } from '@/components/ProgressBar';
import { Text } from '@/components/Text';
import type { ChapterInfoDto } from '@/api';
import { formatClock } from '@/format';
import { chapterMarks, positionAt, SEEK_STEP } from '@/player/controls';
import { useProgress, type ProgressStore } from '@/player/progress';
import { backdrop, minTouch, onArtwork, radii, spacing } from '@/theme';

export type PlayerControlsProps = {
  title?: string;
  subtitle?: string;
  /** False while loading / on error: top bar only. */
  started: boolean;
  paused: boolean;
  progress: ProgressStore;
  /** The item's chapters; marks on the scrubber once the duration is known. */
  chapters?: ChapterInfoDto[];
  onClose: () => void;
  onTogglePause: () => void;
  onSeekBy: (seconds: number) => void;
  onSeek: (seconds: number) => void;
  /** Scrubbing keeps the controls up. */
  onScrub: (active: boolean) => void;
};

export function PlayerControls(props: PlayerControlsProps) {
  const { title, subtitle, started, paused, onClose, onTogglePause, onSeekBy } = props;
  const insets = useSafeAreaInsets();
  const sides = { paddingLeft: insets.left + spacing.md, paddingRight: insets.right + spacing.md };
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
      </View>
      {started && (
        <>
          <View style={styles.center} pointerEvents="box-none">
            <IconButton
              icon={{ ios: 'gobackward.10', android: 'replay_10' }}
              label={`Back ${SEEK_STEP} seconds`}
              variant="glass"
              onPress={() => onSeekBy(-SEEK_STEP)}
            />
            <IconButton
              icon={paused ? { ios: 'play.fill', android: 'play_arrow' } : { ios: 'pause.fill', android: 'pause' }}
              label={paused ? 'Play' : 'Pause'}
              variant="glass"
              large
              onPress={onTogglePause}
            />
            <IconButton
              icon={{ ios: 'goforward.10', android: 'forward_10' }}
              label={`Forward ${SEEK_STEP} seconds`}
              variant="glass"
              onPress={() => onSeekBy(SEEK_STEP)}
            />
          </View>
          <View style={[styles.bottom, sides, { paddingBottom: insets.bottom + spacing.md }]} pointerEvents="box-none">
            <Glass style={styles.panel}>
              <Scrubber {...props} />
            </Glass>
          </View>
        </>
      )}
    </View>
  );
}

/** Track with chapter ticks; drag or tap to seek, VoiceOver swipes up / down for ±10s. Seeks on release. */
function Scrubber({ progress, chapters, onSeek, onScrub, onSeekBy }: PlayerControlsProps) {
  const { position, duration } = useProgress(progress);
  const width = useRef(0);
  const [dragging, setDragging] = useState<number | null>(null);
  const shown = dragging ?? position;
  const fraction = clamp01(shown / duration);
  // Here, where the duration is subscribed: it arrives with the load, often after the item.
  const marks = useMemo(() => chapterMarks(chapters, duration), [chapters, duration]);
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
          {marks.map((f) => (
            <View key={f} testID="chapter-mark" style={[styles.mark, { left: `${f * 100}%` }]} />
          ))}
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
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  panel: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm, borderRadius: radii.cardLarge },
  // Full touch height around a thin bar.
  track: { height: minTouch, justifyContent: 'center' },
  bar: { height: BAR, borderRadius: radii.pill, backgroundColor: onArtwork.track, overflow: 'hidden' },
  fill: { height: BAR, backgroundColor: onArtwork.fill },
  mark: { position: 'absolute', top: 0, width: 2, height: BAR, backgroundColor: backdrop },
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
