// SPDX-License-Identifier: GPL-3.0-or-later
// Apple TV Up Next: in an episode's last `UP_NEXT_SECONDS` a card at the bottom-right over the video (which stays full
// screen - the episode may still be telling its story): the next still, "NEXT EPISODE IN 12" (text, no ring - it reads
// better from the sofa), "S2, E6 · Title", then Play Now (focus) and Cancel - the card goes, no autoplay for this
// episode (as TV apps do: a button, not only Back); Back cancels too. Same props as the phone's `UpNext` tile; autoplay
// off: "UP NEXT", no countdown, waits for Play Now. On the same darkened glass as the player's tracks menu.
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { Artwork } from '@/components/Artwork';
import { episodeLine, landscapeImage } from '@/items';
import { radii, tv } from '@/theme';
import { useImage } from '@/useImage';

import { Glass } from '../Glass';
import { Text } from '../Text';
import { useAnnounceUpNext, useCountdown, type UpNextProps } from '../UpNext';
import { holdBack, restoreFocus, TvFocusRow, useBackScope } from './focus';
import { TvButton, type TvButtonHandle } from './TvButton';

/** Mounted for the whole episode (announced once); shows in the window unless hidden. */
export function TvUpNext(props: UpNextProps) {
  const countdown = useCountdown(props.progress);
  const line = episodeLine(props.next);
  useAnnounceUpNext(countdown !== undefined, line);
  return countdown && !props.hidden && <TvUpNextCard {...props} line={line} left={countdown.left} />;
}

function TvUpNextCard({ next, autoplay, onPlay, onHide, line, left }: UpNextProps & { line: string; left: number }) {
  const image = useImage();
  // Focus on Play Now, asked for outright: the controls are down, so nothing else in the player has focus.
  const play = useRef<TvButtonHandle>(null);
  useEffect(() => {
    restoreFocus(play.current);
  }, []);
  // Back cancels (and no more): the player's own Back would close it.
  const hide = useRef(onHide);
  useEffect(() => {
    hide.current = onHide;
  });
  const scope = useBackScope();
  useEffect(() => holdBack(() => hide.current(), scope), [scope]);

  return (
    <View testID="tv-up-next" style={styles.card}>
      <Glass
        tint={tv.menu.glassTint}
        fallback={tv.menu.glassFallback}
        style={[StyleSheet.absoluteFill, styles.glass]}
      />
      <View style={styles.still}>
        <Artwork image={image(landscapeImage(next), tv.upNext.width)} aspectRatio={16 / 9} />
      </View>
      <Text style={[tv.type.label, styles.eyebrow]} accessibilityLiveRegion="polite">
        {autoplay ? `NEXT EPISODE IN ${left}` : 'UP NEXT'}
      </Text>
      <Text numberOfLines={2} style={tv.type.button}>
        {line}
      </Text>
      <TvFocusRow style={styles.buttons}>
        <TvButton
          ref={play}
          variant="primary"
          title="Play Now"
          icon="play.fill"
          accessibilityLabel={`Play next episode, ${line}`}
          preferredFocus
          onPress={onPlay}
        />
        <TvButton title="Cancel" accessibilityLabel="Cancel Up Next" onPress={onHide} />
      </TvFocusRow>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    right: tv.margin,
    bottom: tv.marginTop,
    width: tv.upNext.width,
    padding: tv.gap.sm,
    gap: tv.gap.sm / 2,
  },
  glass: { borderRadius: tv.panel.radius },
  still: { borderRadius: radii.cardLarge, overflow: 'hidden', marginBottom: tv.gap.sm / 2 },
  eyebrow: { letterSpacing: 2 },
  buttons: { flexDirection: 'row', gap: tv.gap.sm, marginTop: tv.gap.sm / 2 },
});
