// SPDX-License-Identifier: GPL-3.0-or-later
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { formatRemaining, spokenRemaining } from '@/format';
import { minTouch, radii, spacing, useColors } from '@/theme';

import { clamp01 } from './ProgressBar';
import { Text } from './Text';

export type PlayButtonProps = {
  /** What it plays, shown after ▶ ("S1, E4"). Without one: "Play", or only the progress when in progress. */
  label?: string;
  /** How a screen reader says the label ("Season 1, Episode 4"); defaults to the label. */
  spokenLabel?: string;
  /** Watched share 0-1 when in progress: a track and the time left replace the word "Resume". */
  progress?: number;
  remainingSeconds?: number;
  /** undefined: nothing to play yet (dimmed, not tappable). */
  onPress?: () => void;
};

/** Play capsule that carries the progress: "▶ Play", "▶ ━━── 1h 3m left", "▶ S1, E4 ━── 31m left". */
export function PlayButton({ label, spokenLabel, progress, remainingSeconds = 0, onPress }: PlayButtonProps) {
  const c = useColors();
  // Any saved position counts (as on the detail screens), even one at the end: "Resume", without a bare "left".
  const inProgress = progress !== undefined;
  const left = inProgress ? formatRemaining(remainingSeconds) : undefined;
  const spokenLeft = inProgress ? spokenRemaining(remainingSeconds) : undefined;
  const verb = inProgress ? 'Resume' : 'Play';
  const name = [(spokenLabel ?? label) ? `${verb} ${spokenLabel ?? label}` : verb, spokenLeft && `${spokenLeft} left`]
    .filter(Boolean)
    .join(', ');
  const text = label ?? (inProgress ? undefined : 'Play');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      accessibilityState={{ disabled: !onPress }}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.capsule, { backgroundColor: c.accent }, (pressed || !onPress) && styles.dimmed]}
    >
      <SymbolView name={{ ios: 'play.fill', android: 'play_arrow' }} tintColor={c.onAccent} size={16} />
      {text !== undefined && (
        <Text variant="button" numberOfLines={1} style={[styles.text, { color: c.onAccent }]}>
          {text}
        </Text>
      )}
      {inProgress && (
        <>
          <View testID="play-progress" style={styles.track}>
            <View style={[StyleSheet.absoluteFill, styles.trackBack, { backgroundColor: c.onAccent }]} />
            <View
              testID="play-progress-fill"
              style={[styles.fill, { width: `${clamp01(progress ?? 0) * 100}%`, backgroundColor: c.onAccent }]}
            />
          </View>
          {left && (
            <Text variant="label" numberOfLines={1} style={[styles.left, { color: c.onAccent }]}>
              {`${left} left`}
            </Text>
          )}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  capsule: {
    minHeight: minTouch,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm + spacing.xs,
  },
  text: { flexShrink: 1 },
  track: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 32,
    maxWidth: 120,
    height: 5,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  // The unwatched part: the button's text colour at low strength; the watched part at full strength.
  trackBack: { opacity: 0.3 },
  fill: { height: '100%', borderRadius: radii.pill },
  left: { fontVariant: ['tabular-nums'] },
  dimmed: { opacity: 0.5 },
});
