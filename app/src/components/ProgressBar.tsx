// SPDX-License-Identifier: GPL-3.0-or-later
import { StyleSheet, View } from 'react-native';

import { onArtwork, radii, useColors } from '@/theme';

export function clamp01(n: number): number {
  'worklet'; // Animated rings call it on the UI thread.
  return Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));
}

/** Started but not finished: the bar (and "x% watched") only show then. */
export function isInProgress(progress: number | undefined, played = false): progress is number {
  return !played && progress !== undefined && progress > 0 && progress < 1;
}

export type ProgressBarProps = {
  /** Bar thickness when it isn't the default (TV card artwork). */
  height?: number;
  /** 0-1; out-of-range values are clamped. */
  progress: number;
  /** Drawn over artwork: white on a translucent track, in both themes, a little thicker. */
  overArtwork?: boolean;
  /** Warning fill (storage over its limit). */
  warning?: boolean;
  /**
   * Standalone bar: its own accessibility element ("Watched, 40%"). Without one it is hidden from screen readers - inside
   * a card or button whose label already says it (TalkBack would stop on an unlabelled nested element).
   */
  label?: string;
};

/** Thin watched-progress bar (white fill in the dark palette). */
export function ProgressBar({ progress, overArtwork = false, warning = false, label, height }: ProgressBarProps) {
  const c = useColors();
  const p = clamp01(progress);
  return (
    <View
      testID="progress-bar"
      {...(label
        ? {
            accessible: true,
            accessibilityRole: 'progressbar',
            accessibilityLabel: label,
            accessibilityValue: { min: 0, max: 100, now: Math.round(p * 100) },
          }
        : { accessible: false })}
      style={[
        styles.track,
        overArtwork ? styles.overArtwork : { backgroundColor: c.elevated2 },
        height !== undefined && { height },
      ]}
    >
      <View
        testID="progress-fill"
        style={[
          styles.fill,
          { width: `${p * 100}%`, backgroundColor: overArtwork ? onArtwork.fill : warning ? c.warning : c.text },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 4, borderRadius: radii.pill, overflow: 'hidden' },
  overArtwork: { height: 5, backgroundColor: onArtwork.track },
  fill: { height: '100%', borderRadius: radii.pill },
});
