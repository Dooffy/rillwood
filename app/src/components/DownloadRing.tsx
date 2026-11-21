// SPDX-License-Identifier: GPL-3.0-or-later
// Download state ring: stop square while downloading, arrow when paused (ring drawing in ProgressRing). Waiting or
// nothing in yet: a spinning arc instead, so it never looks stuck.
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';

import { minTouch, pressedOpacity, useColors } from '@/theme';

import { clamp01 } from './ProgressBar';
import { ProgressRing } from './ProgressRing';

export type DownloadRingProps = {
  /** 0-1. */
  progress: number;
  /** Paused shows a resume arrow; running shows a stop square. */
  paused?: boolean;
  size?: number;
  /** Waiting (queued, for Wi-Fi) or nothing in yet: a spinning arc instead of the fill. */
  spinning?: boolean;
  /** Opens the download's menu (pause / resume, cancel). Without it the ring is display-only. */
  onPress?: () => void;
};

/** A quarter arc going round (a loader around the icon). */
function SpinningArc({ size }: { size: number }) {
  const [turn] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(turn, { toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [turn]);
  const rotate = turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <Animated.View testID="ring-spinning" style={[StyleSheet.absoluteFill, { transform: [{ rotate }] }]}>
      <ProgressRing progress={0.25} size={size} />
    </Animated.View>
  );
}

/** Ring for a running / paused download: stop square while downloading, arrow when paused. */
export function DownloadRing({ progress, paused = false, size = 28, spinning = false, onPress }: DownloadRingProps) {
  const c = useColors();
  const percent = Math.round(clamp01(progress) * 100);
  const icon = paused ? (
    <SymbolView name={{ ios: 'arrow.down', android: 'arrow_downward' }} tintColor={c.text} size={size * 0.45} />
  ) : (
    <View
      testID="ring-stop"
      style={{ width: size * 0.3, height: size * 0.3, borderRadius: 2, backgroundColor: c.text }}
    />
  );

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
      {spinning ? (
        <View style={[styles.center, { width: size, height: size }]}>
          <SpinningArc size={size} />
          {icon}
        </View>
      ) : (
        <ProgressRing progress={progress} size={size}>
          {icon}
        </ProgressRing>
      )}
    </View>
  );

  if (!onPress) return ring;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={paused ? 'Download paused' : 'Downloading'}
      accessibilityHint={paused ? 'Resume or cancel' : 'Pause or cancel'}
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
