// SPDX-License-Identifier: GPL-3.0-or-later
// Apple TV Home hero (screen draft 04): the Up Next art fills the screen, under the system's tab bar, with the
// eyebrow, title, episode line, facts and a button row on it - white over dark fades whatever the theme. The first
// shelf peeks in at the bottom. Focus starts on Play (one click plays); Play from Start (when started) and More beside.
import { Image } from 'expo-image';
import { StyleSheet, TVFocusGuideView, useWindowDimensions, View } from 'react-native';

import { formatRemaining } from '@/format';
import { ColorsContext, palettes, tv, useColors } from '@/theme';

import { Text } from '../Text';
import { TvButton, type TvButtonHandle } from './TvButton';

export type TvHeroProps = {
  /** "Up Next", "Continue Watching". */
  eyebrow: string;
  title: string;
  /** Episodes: "S2, E5 · The Signal Box". */
  episode?: string;
  /** "2025 · TV-14 · 52m". */
  facts?: string;
  /** Backdrop URL. */
  image?: string;
  /** What Play names: "S2, E5" for an episode; "Play" / "Resume" without one. */
  playLabel?: string;
  /** 0-1 watched, with the time left: the play button carries both. */
  progress?: number;
  remainingSeconds?: number;
  onPlay: () => void;
  /** Started items only: plays from the beginning. */
  onRestart?: () => void;
  /** The item's menu (Mark Watched, Go to Series). */
  onMore?: () => void;
  /**
   * A hero button got focus. Focus moves the screen only as far as the focused item, and the buttons are the hero's
   * highest focusable spot - Home scrolls back to the top here, so the whole hero and the tab bar above come back.
   */
  onFocus?: () => void;
  /**
   * Where Right from the last button goes: the profile button at the top right (Home). Nothing sits to the right of
   * the buttons and the system's tab bar doesn't hand focus on to it, so without this it can't be reached.
   */
  rightDestination?: TvButtonHandle | null;
};

/** Height of the hero's own area: the screen less the shelf peeking in. */
export function useTvHeroHeight(): number {
  return useWindowDimensions().height - tv.hero.peek;
}

export function TvHero({
  eyebrow,
  title,
  episode,
  facts,
  image,
  playLabel,
  progress,
  remainingSeconds,
  onPlay,
  onRestart,
  onMore,
  onFocus,
  rightDestination,
}: TvHeroProps) {
  const c = useColors();
  const { width, height } = useWindowDimensions();
  const heroHeight = useTvHeroHeight();
  const started = progress !== undefined;
  const left = started && remainingSeconds !== undefined ? formatRemaining(remainingSeconds) : undefined;
  const label = playLabel ?? (started ? 'Resume' : 'Play');
  return (
    <View testID="tv-hero" style={{ height: heroHeight }}>
      {/* The art runs the whole screen: under the tab bar and behind the first shelf, fading into the background. */}
      <View style={[styles.art, { width, height }]} pointerEvents="none">
        {image !== undefined && (
          <Image
            testID="tv-hero-image"
            source={image}
            cachePolicy="memory-disk"
            contentFit="cover"
            transition={300}
            style={StyleSheet.absoluteFill}
            accessible={false}
          />
        )}
        <View style={[StyleSheet.absoluteFill, styles.fadeLeft]} />
        <View style={[StyleSheet.absoluteFill, styles.fadeTop]} />
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundImage: `linear-gradient(to bottom, transparent 45%, ${c.background} 100%)` },
          ]}
        />
      </View>
      <ColorsContext.Provider value={palettes.dark}>
        <View style={styles.onArt}>
          <View style={styles.text}>
            <Text numberOfLines={1} style={[tv.type.label, styles.eyebrow]} secondary>
              {eyebrow.toUpperCase()}
            </Text>
            <Text accessibilityRole="header" numberOfLines={2} style={tv.type.title}>
              {title}
            </Text>
            {episode !== undefined && (
              <Text numberOfLines={1} style={tv.type.body}>
                {episode}
              </Text>
            )}
            {facts !== undefined && (
              <Text numberOfLines={1} secondary style={tv.type.caption}>
                {facts}
              </Text>
            )}
          </View>
          {/* Full width: a swipe up from a card anywhere in the shelf below lands here (on the last-focused button). */}
          <TVFocusGuideView autoFocus style={styles.buttons}>
            <TvButton
              title={label}
              accessibilityLabel={[
                `${started ? 'Resume' : 'Play'}${playLabel ? ` ${playLabel}` : ''}`,
                left && `${left} left`,
              ]
                .filter(Boolean)
                .join(', ')}
              variant="primary"
              icon="play.fill"
              progress={progress}
              trailing={left && `${left} left`}
              onPress={onPlay}
              onFocus={onFocus}
              preferredFocus
            />
            {onRestart && (
              <TvButton
                round
                title="Play from Start"
                icon="arrow.counterclockwise"
                onPress={onRestart}
                onFocus={onFocus}
              />
            )}
            {onMore && <TvButton round title="More" icon="ellipsis" onPress={onMore} onFocus={onFocus} />}
            {rightDestination && (
              <TVFocusGuideView testID="tv-hero-right" style={styles.toRight} destinations={[rightDestination]} />
            )}
          </TVFocusGuideView>
        </View>
      </ColorsContext.Provider>
    </View>
  );
}

const styles = StyleSheet.create({
  art: { position: 'absolute', top: 0, left: 0 },
  // Dark under the text on the left, clear on the right so the art shows; a light shade at the top for the tab bar.
  fadeLeft: {
    backgroundImage: 'linear-gradient(to right, rgba(0, 0, 0, 0.75) 0%, rgba(0, 0, 0, 0.35) 45%, rgba(0, 0, 0, 0) 70%)',
  },
  fadeTop: { backgroundImage: 'linear-gradient(to bottom, rgba(0, 0, 0, 0.45) 0%, rgba(0, 0, 0, 0) 25%)' },
  onArt: { position: 'absolute', left: 0, right: 0, bottom: tv.gap.lg, gap: tv.gap.sm },
  text: { marginLeft: tv.margin, maxWidth: tv.hero.textWidth, gap: tv.gap.sm / 2 },
  eyebrow: { letterSpacing: 1 },
  // The rest of the row, right of the buttons.
  toRight: { flex: 1, alignSelf: 'stretch' },
  buttons: { flexDirection: 'row', alignItems: 'center', gap: tv.gap.sm, paddingHorizontal: tv.margin },
});
