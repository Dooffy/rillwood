// SPDX-License-Identifier: GPL-3.0-or-later
// Download state ring: stop square while downloading, arrow when paused (ring drawing in ProgressRing).
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { minTouch, pressedOpacity, useColors } from '@/theme';

import { clamp01 } from './ProgressBar';
import { ProgressRing } from './ProgressRing';

export type DownloadRingProps = {
  /** 0-1. */
  progress: number;
  /** Paused shows a resume arrow; running shows a stop square. */
  paused?: boolean;
  size?: number;
  /** Pause / resume. Without it the ring is display-only. */
  onPress?: () => void;
};

/** Ring for a running / paused download: stop square while downloading, arrow when paused. */
export function DownloadRing({ progress, paused = false, size = 28, onPress }: DownloadRingProps) {
  const c = useColors();
  const percent = Math.round(clamp01(progress) * 100);

  const ring = (
    <View
      // Display-only: the ring itself is the progress bar; with onPress the button below announces it.
      accessible={!onPress}
      accessibilityRole={onPress ? undefined : 'progressbar'}
      accessibilityLabel={onPress ? undefined : paused ? 'Download paused' : 'Downloading'}
      accessibilityValue={onPress ? undefined : { min: 0, max: 100, now: percent, text: `${percent}%` }}
      importantForAccessibility={onPress ? 'no-hide-descendants' : 'auto'}
      accessibilityElementsHidden={!!onPress}
    >
      <ProgressRing progress={progress} size={size}>
        {paused ? (
          <SymbolView name={{ ios: 'arrow.down', android: 'arrow_downward' }} tintColor={c.text} size={size * 0.45} />
        ) : (
          <View
            testID="ring-stop"
            style={{ width: size * 0.3, height: size * 0.3, borderRadius: 2, backgroundColor: c.text }}
          />
        )}
      </ProgressRing>
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
  center: { alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: pressedOpacity },
});
