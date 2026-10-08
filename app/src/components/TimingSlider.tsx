// SPDX-License-Identifier: GPL-3.0-or-later
// Subtitle timing slider for the tracks menu: in sync in the middle, earlier to the left, later to the right. Drag or
// tap the bar (applied on release), − / + for 0.1 s steps, Reset back to in sync. Plain views, like the scrubber.
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, type GestureResponderEvent } from 'react-native';

import { Button } from '@/components/Button';
import { IconButton } from '@/components/IconButton';
import { Text } from '@/components/Text';
import { formatDelay } from '@/format';
import { clampDelay, delayAt, delayFraction, SUBTITLE_DELAY_STEP } from '@/player/controls';
import { minTouch, radii, spacing, useColors } from '@/theme';

const BAR = 4;
const THUMB = 20;
const TICK = 12;

export function TimingSlider({ value, onChange }: { value: number; onChange: (seconds: number) => void }) {
  const c = useColors();
  const width = useRef(0);
  const [dragging, setDragging] = useState<number | null>(null);
  const shown = dragging ?? value;
  // 0-100 % along the bar; the fill runs from the middle (in sync) to the thumb.
  const at = delayFraction(shown) * 100;
  const inSync = shown === 0;
  const touch = (e: GestureResponderEvent) => delayAt(e.nativeEvent.locationX, width.current);
  // The last value sent: two quick − / + presses step from each other, not both from the prop before it re-renders.
  const sent = useRef(value);
  useEffect(() => {
    sent.current = value;
  }, [value]);
  // Only real changes: + at the end of the range, or a tap on the current value, would re-render the player for nothing.
  const commit = (next: number) => {
    if (next === sent.current) return;
    sent.current = next;
    onChange(next);
  };
  const step = (by: number) => commit(clampDelay(sent.current + by));

  return (
    <View style={styles.root}>
      <Text variant="sectionHeader" style={styles.value}>
        {formatDelay(shown)}
      </Text>
      <View style={styles.row}>
        <IconButton
          icon={{ ios: 'minus', android: 'remove' }}
          label={`${SUBTITLE_DELAY_STEP} s earlier`}
          variant="plain"
          onPress={() => step(-SUBTITLE_DELAY_STEP)}
        />
        <View
          testID="timing-slider"
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
          accessibilityLabel="Subtitle timing"
          accessibilityValue={{ text: formatDelay(shown) }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(e) =>
            step(e.nativeEvent.actionName === 'increment' ? SUBTITLE_DELAY_STEP : -SUBTITLE_DELAY_STEP)
          }
        >
          {/* Children ignore touches, so locationX is always relative to the track. */}
          <View style={[styles.bar, { backgroundColor: c.elevated2 }]} pointerEvents="none">
            <View
              style={[
                styles.fill,
                { backgroundColor: c.text, left: `${Math.min(at, 50)}%`, width: `${Math.abs(at - 50)}%` },
              ]}
            />
          </View>
          <View style={[styles.tick, { backgroundColor: c.textSecondary }]} pointerEvents="none" />
          <View style={[styles.thumb, { backgroundColor: c.text, left: `${at}%` }]} pointerEvents="none" />
        </View>
        <IconButton
          icon={{ ios: 'plus', android: 'add' }}
          label={`${SUBTITLE_DELAY_STEP} s later`}
          variant="plain"
          onPress={() => step(SUBTITLE_DELAY_STEP)}
        />
      </View>
      <View style={styles.ends} pointerEvents="none">
        <Text variant="caption" secondary>
          Earlier
        </Text>
        <Text variant="caption" secondary>
          Later
        </Text>
      </View>
      {/* Same height either way, so the sheet doesn't jump when the value comes back to in sync. */}
      <View
        style={[styles.reset, inSync && styles.hidden]}
        accessibilityElementsHidden={inSync}
        importantForAccessibility={inSync ? 'no-hide-descendants' : 'auto'}
      >
        <Button title="Reset" variant="secondary" disabled={inSync} onPress={() => commit(0)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, gap: spacing.xs },
  value: { textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  // Half a thumb of room each side: at the range ends the thumb overhangs the bar, never the − / + buttons.
  // Full touch height around a thin bar.
  track: { flex: 1, height: minTouch, justifyContent: 'center', marginHorizontal: THUMB / 2 },
  bar: { height: BAR, borderRadius: radii.pill, overflow: 'hidden' },
  fill: { position: 'absolute', top: 0, bottom: 0 },
  // In sync mark under the thumb's middle position.
  tick: { position: 'absolute', left: '50%', width: 2, height: TICK, marginLeft: -1, borderRadius: radii.pill },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    marginLeft: -THUMB / 2,
    borderRadius: radii.pill,
  },
  // Lined up under the bar's ends (past the − / + buttons).
  ends: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: minTouch + spacing.xs + THUMB / 2 },
  reset: { alignItems: 'center', paddingTop: spacing.sm },
  hidden: { opacity: 0 },
});
