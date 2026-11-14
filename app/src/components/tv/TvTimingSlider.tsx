// SPDX-License-Identifier: GPL-3.0-or-later
// Apple TV subtitle timing (screen draft 11) in the tracks panel: the offset large ("0.4 s later", "In sync"), a bar with the
// in-sync mark in the middle (earlier left, later right), round − / + for 0.1 s steps and Reset - the remote has no
// drag, so no slider to drag. Same props as the phone's `TimingSlider`; applied as it changes.
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { formatDelay } from '@/format';
import { clampDelay, delayFraction, SUBTITLE_DELAY_STEP } from '@/player/controls';
import { onArtwork, radii, tv, useColors } from '@/theme';

import { Text } from '../Text';
import { TvButton } from './TvButton';

export function TvTimingSlider({ value, onChange }: { value: number; onChange: (seconds: number) => void }) {
  const c = useColors();
  // The last value sent: quick presses step from each other, not both from the prop before it re-renders.
  const sent = useRef(value);
  useEffect(() => {
    sent.current = value;
  }, [value]);
  const commit = (next: number) => {
    if (next === sent.current) return;
    sent.current = next;
    onChange(next);
  };
  const step = (by: number) => commit(clampDelay(sent.current + by));
  const at = delayFraction(value) * 100;

  return (
    <View testID="tv-timing" style={styles.root}>
      <Text style={[tv.type.title, styles.value]} accessibilityLiveRegion="polite">
        {formatDelay(value)}
      </Text>
      <View style={styles.bar}>
        <View style={[styles.track, { backgroundColor: onArtwork.track }]} />
        {/* From the middle (in sync) to where it is. */}
        <View
          style={[
            styles.fill,
            { backgroundColor: c.text, left: `${Math.min(at, 50)}%`, width: `${Math.abs(at - 50)}%` },
          ]}
        />
        <View style={[styles.mid, { backgroundColor: c.text }]} />
      </View>
      <View style={styles.buttons}>
        <TvButton
          round
          title="Earlier"
          accessibilityLabel={`Earlier by ${SUBTITLE_DELAY_STEP} seconds`}
          icon="minus"
          preferredFocus
          rememberFocus={false}
          onPress={() => step(-SUBTITLE_DELAY_STEP)}
        />
        <TvButton
          round
          title="Later"
          accessibilityLabel={`Later by ${SUBTITLE_DELAY_STEP} seconds`}
          icon="plus"
          rememberFocus={false}
          onPress={() => step(SUBTITLE_DELAY_STEP)}
        />
        <TvButton variant="quiet" title="Reset" rememberFocus={false} onPress={() => commit(0)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: tv.gap.sm, alignItems: 'stretch', paddingVertical: tv.gap.sm },
  value: { textAlign: 'center', fontVariant: ['tabular-nums'] },
  bar: { height: tv.player.trackFocused, justifyContent: 'center', marginVertical: tv.gap.sm },
  track: { height: tv.player.track, borderRadius: radii.pill },
  fill: { position: 'absolute', height: tv.player.track, borderRadius: radii.pill },
  mid: {
    position: 'absolute',
    left: '50%',
    width: tv.timing.mark,
    marginLeft: -tv.timing.mark / 2,
    height: tv.player.trackFocused * 2,
    borderRadius: radii.pill,
  },
  buttons: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: tv.gap.sm },
});
