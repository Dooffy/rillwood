// SPDX-License-Identifier: GPL-3.0-or-later
// Progress ring from plain views (no SVG): grey track, white arc from 12 o'clock clockwise. Each half of the arc is a
// half-ring rotating into a clip that covers one half of the circle.
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { radii, useColors } from '@/theme';

import { clamp01 } from './ProgressBar';

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

/** Progress ring (grey track, arc clockwise from 12 o'clock) with `children` centred - downloads and play buttons. */
export function ProgressRing({ progress, size, children }: { progress: number; size: number; children?: ReactNode }) {
  const c = useColors();
  const degrees = clamp01(progress) * 360;
  const stroke = Math.max(2, Math.round(size / 10));
  return (
    <View style={{ width: size, height: size }}>
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
      <View style={[StyleSheet.absoluteFill, styles.center]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { position: 'absolute', top: 0, overflow: 'hidden' },
  abs: { position: 'absolute', top: 0 },
  round: { borderRadius: radii.pill },
  flip: { transform: [{ rotate: '180deg' }] },
  center: { alignItems: 'center', justifyContent: 'center' },
});
