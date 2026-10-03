// SPDX-License-Identifier: GPL-3.0-or-later
// Download progress ring from plain views (no SVG): grey track, white arc from 12 o'clock clockwise. Each half of the
// arc is a half-ring rotating into a clip that covers one half of the circle.
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { minTouch, pressedOpacity, radii, useColors } from '@/theme';

import { clamp01 } from './ProgressBar';

export type DownloadRingProps = {
  /** 0-1. */
  progress: number;
  /** Paused shows a resume arrow; running shows a stop square. */
  paused?: boolean;
  size?: number;
  /** Pause / resume. Without it the ring is display-only. */
  onPress?: () => void;
};

/**
 * Right half of the arc: a clip over the circle's right half, with the left half-ring rotating into it by `degrees`
 * (0-180) - the visible arc grows clockwise from 12 o'clock. The left half is the same view turned 180deg.
 */
function HalfArc({
  testID,
  degrees,
  size,
  stroke,
  color,
}: {
  testID: string;
  degrees: number;
  size: number;
  stroke: number;
  color: string;
}) {
  const half = size / 2;
  const box = { width: size, height: size };
  return (
    <View style={[styles.clip, { width: half, height: size, left: half }]}>
      <View testID={testID} style={[styles.abs, box, { left: -half, transform: [{ rotate: `${degrees}deg` }] }]}>
        <View style={[styles.clip, { width: half, height: size, left: 0 }]}>
          <View style={[styles.abs, box, styles.round, { borderWidth: stroke, borderColor: color }]} />
        </View>
      </View>
    </View>
  );
}

/** Ring for a running / paused download: stop square while downloading, arrow when paused. */
export function DownloadRing({ progress, paused = false, size = 28, onPress }: DownloadRingProps) {
  const c = useColors();
  const p = clamp01(progress);
  const degrees = p * 360;
  const stroke = Math.max(2, Math.round(size / 10));
  const percent = Math.round(p * 100);

  const ring = (
    <View
      style={{ width: size, height: size }}
      // Display-only: the ring itself is the progress bar; with onPress the button below announces it.
      accessible={!onPress}
      accessibilityRole={onPress ? undefined : 'progressbar'}
      accessibilityLabel={onPress ? undefined : paused ? 'Download paused' : 'Downloading'}
      accessibilityValue={onPress ? undefined : { min: 0, max: 100, now: percent, text: `${percent}%` }}
      importantForAccessibility={onPress ? 'no-hide-descendants' : 'auto'}
      accessibilityElementsHidden={!!onPress}
    >
      <View
        style={[StyleSheet.absoluteFill, { borderRadius: radii.pill, borderWidth: stroke, borderColor: c.elevated2 }]}
      />
      {degrees > 0 && (
        <HalfArc testID="ring-right" degrees={Math.min(degrees, 180)} size={size} stroke={stroke} color={c.text} />
      )}
      {degrees > 180 && (
        <View style={[StyleSheet.absoluteFill, styles.flip]}>
          <HalfArc testID="ring-left" degrees={degrees - 180} size={size} stroke={stroke} color={c.text} />
        </View>
      )}
      <View style={[StyleSheet.absoluteFill, styles.center]}>
        {paused ? (
          <SymbolView name={{ ios: 'arrow.down', android: 'arrow_downward' }} tintColor={c.text} size={size * 0.45} />
        ) : (
          <View
            testID="ring-stop"
            style={{ width: size * 0.3, height: size * 0.3, borderRadius: 2, backgroundColor: c.text }}
          />
        )}
      </View>
    </View>
  );

  if (!onPress) return ring;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={paused ? 'Resume download' : 'Pause download'}
      accessibilityValue={{ min: 0, max: 100, now: percent, text: `${percent}%` }}
      onPress={onPress}
      hitSlop={Math.max(0, (minTouch - size) / 2)}
      style={({ pressed }) => [styles.center, pressed && styles.pressed]}
    >
      {ring}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  clip: { position: 'absolute', top: 0, overflow: 'hidden' },
  abs: { position: 'absolute', top: 0 },
  round: { borderRadius: radii.pill },
  flip: { transform: [{ rotate: '180deg' }] },
  center: { alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: pressedOpacity },
});
