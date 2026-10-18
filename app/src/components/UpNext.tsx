// SPDX-License-Identifier: GPL-3.0-or-later
// Up Next tile over the player in the last 30 s of an episode with a next one, Apple TV style: the next still with a
// ring that fills as the countdown runs, "Up Next · 12s", "S1, E2 · Title". Tap = play now; ✕ on the corner hides it.
// The screen plays the next episode at the end unless the card was hidden or autoplay is off (Settings): then the card
// has no countdown and waits for a tap.
import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';
import { Easing, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import type { BaseItemDto } from '@/api';
import { Artwork } from '@/components/Artwork';
import { Glass } from '@/components/Glass';
import { AnimatedProgressRing } from '@/components/ProgressRing';
import { Text } from '@/components/Text';
import { episodeLine, landscapeImage } from '@/items';
import { UP_NEXT_SECONDS, upNextCountdown } from '@/player/controls';
import type { ProgressStore } from '@/player/progress';
import { backdrop, minTouch, pressedOpacity, radii, spacing, useColors } from '@/theme';
import { useImage } from '@/useImage';

const TILE_WIDTH = 204;

export type UpNextProps = {
  next: BaseItemDto;
  progress: ProgressStore;
  /** Playback speed while playing, 0 while paused or waiting for data: how fast the ring runs on its own. */
  rate: number;
  /** Plays at the end on its own (the countdown); false: waits for a tap. */
  autoplay: boolean;
  /** Out of the way for now (pull to close); the countdown and the announcement carry on. */
  hidden?: boolean;
  onPlay: () => void;
  onHide: () => void;
};

/** The countdown as a string snapshot ("left|fill", "" outside the window): equal strings don't re-render. */
function useCountdown(store: ProgressStore) {
  const snapshot = useSyncExternalStore(store.subscribe, () => {
    const { position, duration } = store.get();
    const c = upNextCountdown(position, duration);
    return c ? `${c.left}|${c.fill}` : '';
  });
  if (!snapshot) return undefined;
  const [left, fill] = snapshot.split('|').map(Number);
  return { left, fill };
}

/**
 * Nothing until the last `UP_NEXT_SECONDS`, and no re-render before then; then with each position update (the ring
 * re-syncs to it), not the screen. Mounted for the whole episode, so VoiceOver hears "Up next" once per next episode,
 * not each time a seek crosses into the window.
 */
export function UpNext(props: UpNextProps) {
  const countdown = useCountdown(props.progress);
  const line = episodeLine(props.next);
  const showing = countdown !== undefined;
  const announced = useRef<string>(undefined);
  useEffect(() => {
    if (!showing || announced.current === line) return;
    announced.current = line;
    AccessibilityInfo.announceForAccessibility(`Up next: ${line}`);
  }, [showing, line]);
  return countdown && !props.hidden && <UpNextCard {...props} {...countdown} />;
}

function UpNextCard({
  next,
  left,
  fill,
  rate,
  autoplay,
  onPlay,
  onHide,
}: UpNextProps & { left: number; fill: number }) {
  const c = useColors();
  // The ring runs smoothly between position updates (about one a second): each update puts it at the exact position,
  // then, while playing, it runs on to full over the real time left. Reduce Motion: it steps with the updates.
  const reduceMotion = useReducedMotion();
  // No countdown without autoplay: the ring stays empty.
  const ring = useSharedValue(autoplay ? fill : 0);
  useEffect(() => {
    ring.value = autoplay ? fill : 0;
    if (autoplay && rate > 0 && !reduceMotion && fill < 1) {
      const ms = ((1 - fill) * UP_NEXT_SECONDS * 1000) / rate;
      ring.value = withTiming(1, { duration: ms, easing: Easing.linear });
    }
  }, [autoplay, fill, rate, reduceMotion, ring]);
  const image = useImage();
  const line = episodeLine(next);

  return (
    <View style={styles.tile}>
      {/* The tile is the Play Now button; Hide sits over its corner, not inside it (one control each for VoiceOver). */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Play next episode, ${line}`}
        accessibilityHint={autoplay ? `Plays in ${left} seconds` : undefined}
        onPress={onPlay}
      >
        <Glass interactive style={styles.card}>
          <View>
            <Artwork image={image(landscapeImage(next), TILE_WIDTH)} aspectRatio={16 / 9} />
            <View style={[StyleSheet.absoluteFill, styles.center]}>
              {/* Fills as the countdown runs. */}
              <View style={styles.ringBack}>
                <AnimatedProgressRing progress={ring} size={RING}>
                  <SymbolView name={{ ios: 'play.fill', android: 'play_arrow' }} tintColor={c.text} size={18} />
                </AnimatedProgressRing>
              </View>
            </View>
          </View>
          <View style={styles.meta}>
            <Text variant="caption" secondary>
              {autoplay ? `Up Next · ${left}s` : 'Up Next'}
            </Text>
            <Text variant="label" numberOfLines={2}>
              {line}
            </Text>
          </View>
        </Glass>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Hide Up Next"
        hitSlop={(minTouch - HIDE) / 2}
        onPress={onHide}
        style={({ pressed }) => [styles.hide, { backgroundColor: c.elevated2 }, pressed && styles.pressed]}
      >
        <SymbolView name={{ ios: 'xmark', android: 'close' }} tintColor={c.text} size={12} />
      </Pressable>
    </View>
  );
}

const PAD = spacing.sm;
const RING = minTouch;
const HIDE = 28;

const styles = StyleSheet.create({
  tile: { alignSelf: 'flex-end', width: TILE_WIDTH + PAD * 2 },
  card: { padding: PAD, gap: spacing.xs + 2, borderRadius: radii.cardLarge },
  center: { alignItems: 'center', justifyContent: 'center' },
  ringBack: { borderRadius: radii.pill, backgroundColor: backdrop },
  meta: { paddingHorizontal: spacing.xs, paddingBottom: 2, gap: 2 },
  // Over the still's top-right corner.
  hide: {
    position: 'absolute',
    top: PAD + 6,
    right: PAD + 6,
    width: HIDE,
    height: HIDE,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: pressedOpacity },
});
