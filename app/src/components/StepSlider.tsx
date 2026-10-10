// SPDX-License-Identifier: GPL-3.0-or-later
// Slider over a few fixed stops (Settings → Storage limit): drag or tap the bar (saved on release), − / + for one
// stop. Plain views, like the timing slider; the value shows above it while dragging.
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, type GestureResponderEvent } from 'react-native';

import { IconButton } from '@/components/IconButton';
import { Text } from '@/components/Text';
import { minTouch, radii, spacing, useColors } from '@/theme';

const BAR = 4;
const THUMB = 20;

/** Stop under `x` on a track `width` wide with `count` stops. */
export function stopAt(x: number, width: number, count: number): number {
  if (count < 2 || width <= 0) return 0;
  return Math.min(count - 1, Math.max(0, Math.round((x / width) * (count - 1))));
}

type StepSliderProps = {
  /** Number of stops (≥ 1). */
  count: number;
  /** Current stop. */
  value: number;
  onChange: (stop: number) => void;
  /** Text for a stop: shown above the bar and read by VoiceOver. */
  format: (stop: number) => string;
  /** What the slider sets (VoiceOver). */
  label: string;
  /** Captions under the bar's ends. */
  ends: [string, string];
};

export function StepSlider({ count, value, onChange, format, label, ends }: StepSliderProps) {
  const c = useColors();
  const width = useRef(0);
  const [dragging, setDragging] = useState<number | null>(null);
  const shown = dragging ?? value;
  const at = count > 1 ? (shown / (count - 1)) * 100 : 0;
  const touch = (e: GestureResponderEvent) => stopAt(e.nativeEvent.locationX, width.current, count);
  // The last stop sent: two quick − / + presses step from each other, not both from the prop before it re-renders.
  const sent = useRef(value);
  useEffect(() => {
    sent.current = value;
  }, [value]);
  // A tap or drag always saves: the thumb can sit on the nearest stop of a value that isn't one (a limit saved on a
  // bigger phone), and picking that stop must set it. Only − / + at an end send nothing.
  const commit = (next: number) => {
    sent.current = next;
    onChange(next);
  };
  const step = (by: number) => {
    const next = Math.min(count - 1, Math.max(0, sent.current + by));
    if (next !== sent.current) commit(next);
  };

  return (
    <View style={styles.root}>
      <Text variant="sectionHeader" style={styles.value}>
        {format(shown)}
      </Text>
      <View style={styles.row}>
        <IconButton icon={{ ios: 'minus', android: 'remove' }} label="Less" variant="plain" onPress={() => step(-1)} />
        <View
          testID="step-slider"
          style={styles.track}
          onLayout={(e) => {
            width.current = e.nativeEvent.layout.width;
          }}
          onStartShouldSetResponder={() => true}
          onResponderTerminationRequest={() => false}
          onResponderGrant={(e) => setDragging(touch(e))}
          onResponderMove={(e) => setDragging(touch(e))}
          onResponderRelease={(e) => {
            setDragging(null);
            commit(touch(e));
          }}
          onResponderTerminate={() => setDragging(null)}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={label}
          accessibilityValue={{ text: format(shown) }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(e) => step(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
        >
          {/* Children ignore touches, so locationX is always relative to the track. */}
          <View style={[styles.bar, { backgroundColor: c.elevated2 }]} pointerEvents="none">
            <View style={[styles.fill, { backgroundColor: c.text, width: `${at}%` }]} />
          </View>
          <View style={[styles.thumb, { backgroundColor: c.text, left: `${at}%` }]} pointerEvents="none" />
        </View>
        <IconButton icon={{ ios: 'plus', android: 'add' }} label="More" variant="plain" onPress={() => step(1)} />
      </View>
      <View style={styles.ends} pointerEvents="none">
        <Text variant="caption" secondary>
          {ends[0]}
        </Text>
        <Text variant="caption" secondary>
          {ends[1]}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.xs },
  value: { textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  // Half a thumb of room each side, so the thumb at an end overhangs the bar, never the − / + buttons.
  track: { flex: 1, height: minTouch, justifyContent: 'center', marginHorizontal: THUMB / 2 },
  bar: { height: BAR, borderRadius: radii.pill, overflow: 'hidden' },
  fill: { position: 'absolute', top: 0, bottom: 0, left: 0 },
  thumb: { position: 'absolute', width: THUMB, height: THUMB, marginLeft: -THUMB / 2, borderRadius: radii.pill },
  ends: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: minTouch + spacing.xs + THUMB / 2 },
});
