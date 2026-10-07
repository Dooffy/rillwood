// SPDX-License-Identifier: GPL-3.0-or-later
// Progress ring from plain views (no SVG): grey track, white arc from 12 o'clock clockwise. Each half of the arc is a
// half-ring rotating into a clip that covers one half of the circle. `AnimatedProgressRing` runs the same arc on the UI
// thread from a shared value (smooth countdowns).
import type { ComponentProps, ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { radii, useColors } from '@/theme';

import { clamp01 } from './ProgressBar';

/**
 * Right half of the arc: a clip over the circle's right half, with the left half-ring rotating into it by `degrees`
 * (0-180) - the visible arc grows clockwise from 12 o'clock. The left half is the same view turned 180deg.
 */
function HalfArc({
  testID,
  rotation,
  size,
  stroke,
  color,
}: {
  testID: string;
  /** The half-ring's turn: a plain `rotate` transform, or an animated style. */
  rotation: Rotation;
  size: number;
  stroke: number;
  color: string;
}) {
  const half = size / 2;
  const box = { width: size, height: size };
  return (
    <View style={[styles.clip, { width: half, height: size, left: half }]}>
      <Animated.View testID={testID} style={[styles.abs, box, { left: -half }, rotation]}>
        <View style={[styles.clip, { width: half, height: size, left: 0 }]}>
          <View style={[styles.abs, box, styles.round, { borderWidth: stroke, borderColor: color }]} />
        </View>
      </Animated.View>
    </View>
  );
}

type Rotation = ComponentProps<typeof Animated.View>['style'];

/** Track, the two half arcs (either may be left out) and the centred children. */
function Ring({
  size,
  right,
  left,
  children,
}: {
  size: number;
  right?: Rotation;
  left?: Rotation;
  children?: ReactNode;
}) {
  const c = useColors();
  const stroke = Math.max(2, Math.round(size / 10));
  return (
    <View style={{ width: size, height: size }}>
      <View
        style={[StyleSheet.absoluteFill, { borderRadius: radii.pill, borderWidth: stroke, borderColor: c.elevated2 }]}
      />
      {right !== undefined && (
        <HalfArc testID="ring-right" rotation={right} size={size} stroke={stroke} color={c.text} />
      )}
      {left !== undefined && (
        <View style={[StyleSheet.absoluteFill, styles.flip]}>
          <HalfArc testID="ring-left" rotation={left} size={size} stroke={stroke} color={c.text} />
        </View>
      )}
      <View style={[StyleSheet.absoluteFill, styles.center]}>{children}</View>
    </View>
  );
}

/** A half-ring's turn for progress `p` (0-1): the right half covers 0-0.5, the left 0.5-1. A worklet for animated styles. */
function turn(p: number, half: 'right' | 'left') {
  'worklet';
  const degrees = clamp01(half === 'right' ? p * 2 : p * 2 - 1) * 180;
  return { transform: [{ rotate: `${degrees}deg` }] };
}

/** Progress ring (grey track, arc clockwise from 12 o'clock) with `children` centred - downloads and play buttons. */
export function ProgressRing({ progress, size, children }: { progress: number; size: number; children?: ReactNode }) {
  const p = clamp01(progress);
  return (
    <Ring size={size} right={p > 0 ? turn(p, 'right') : undefined} left={p > 0.5 ? turn(p, 'left') : undefined}>
      {children}
    </Ring>
  );
}

/**
 * `ProgressRing` driven by `progress` (0-1) on the UI thread (smooth countdowns): both halves always mounted - a half
 * at 0deg is outside its clip, so invisible.
 */
export function AnimatedProgressRing({
  progress,
  size,
  children,
}: {
  progress: SharedValue<number>;
  size: number;
  children?: ReactNode;
}) {
  const right = useAnimatedStyle(() => turn(progress.value, 'right'));
  const left = useAnimatedStyle(() => turn(progress.value, 'left'));
  return (
    <Ring size={size} right={right} left={left}>
      {children}
    </Ring>
  );
}

const styles = StyleSheet.create({
  clip: { position: 'absolute', top: 0, overflow: 'hidden' },
  abs: { position: 'absolute', top: 0 },
  round: { borderRadius: radii.pill },
  flip: { transform: [{ rotate: '180deg' }] },
  center: { alignItems: 'center', justifyContent: 'center' },
});
