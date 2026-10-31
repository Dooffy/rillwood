// SPDX-License-Identifier: GPL-3.0-or-later
import { Pressable, StyleSheet, View, type AccessibilityActionEvent } from 'react-native';

import { ColorsContext, palettes, pressedOpacity, radii, spacing, useWide } from '@/theme';

import { Artwork } from './Artwork';
import { WIDE_PLAY_MIN_WIDTH } from './DetailActions';
import { cardLabel, MORE_ACTION, type CardProps } from './Card';
import { PlayButton } from './PlayButton';
import { Text } from './Text';

/** Wide screens: the hero's art is cropped wide (a full-width 16:9 hero takes ~40% of a 13" iPad). */
export const WIDE_HERO_RATIO = 2.4;

/** The hero art's aspect ratio: 16:9 on phones, cropped wider on wide screens (both orientations). */
export function useHeroAspect() {
  return useWide() ? WIDE_HERO_RATIO : 16 / 9;
}

export type HeroProps = Omit<CardProps, 'width'> & {
  /** Small line above the title: "Continue Watching", "Up Next". */
  eyebrow: string;
  /** Wide screens: the play button on the art (with the progress); phones open the item and play from there. */
  onPlay?: () => void;
};

const PLAY_ACTION = { name: 'play', label: 'Play' } as const;

/**
 * Top of Home (Up Next). Phones: a 16:9 card, then eyebrow, title, subtitle under it. Wide screens: the art cropped wide
 * with the eyebrow, title, subtitle and the play button (carrying the progress) on it, over a dark fade on its left -
 * white whatever the theme, like the player. A tap opens the item; VoiceOver offers Play and More as actions.
 */
export function Hero({ eyebrow, onPlay, ...props }: HeroProps) {
  const { title, subtitle, image, progress, remainingSeconds, played, onPress, onLongPress } = props;
  const wide = useWide();
  const aspectRatio = useHeroAspect();
  const actions = [...(wide && onPlay ? [PLAY_ACTION] : []), ...(onLongPress ? [MORE_ACTION] : [])];
  const onAction = ({ nativeEvent }: AccessibilityActionEvent) => {
    if (nativeEvent.actionName === PLAY_ACTION.name) onPlay?.();
    if (nativeEvent.actionName === MORE_ACTION.name) onLongPress?.();
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${eyebrow}, ${cardLabel(props)}`}
      accessibilityActions={actions.length > 0 ? actions : undefined}
      onAccessibilityAction={onAction}
      onLongPress={onLongPress}
      onPress={onPress}
      style={({ pressed }) => [styles.hero, pressed && styles.pressed]}
    >
      {wide ? (
        <View testID="hero-art" style={styles.wideArt}>
          {/* The play button carries the progress: no bar on the art. */}
          <Artwork image={image} aspectRatio={aspectRatio} played={played} />
          <View style={[StyleSheet.absoluteFill, styles.fade]} />
          <ColorsContext.Provider value={palettes.dark}>
            <View style={styles.onArt}>
              <Text variant="label" secondary numberOfLines={1} style={styles.eyebrow}>
                {eyebrow.toUpperCase()}
              </Text>
              <Text variant="largeTitle" numberOfLines={2}>
                {title}
              </Text>
              {subtitle !== undefined && (
                <Text secondary numberOfLines={1}>
                  {subtitle}
                </Text>
              )}
              {onPlay && (
                <View style={styles.play}>
                  <PlayButton progress={progress} remainingSeconds={remainingSeconds} onPress={onPlay} />
                </View>
              )}
            </View>
          </ColorsContext.Provider>
        </View>
      ) : (
        <>
          <View testID="hero-art">
            <Artwork
              image={image}
              aspectRatio={aspectRatio}
              progress={progress}
              remainingSeconds={remainingSeconds}
              played={played}
            />
          </View>
          <View>
            <Text variant="caption" secondary numberOfLines={1}>
              {eyebrow}
            </Text>
            <Text variant="sectionHeader" numberOfLines={1}>
              {title}
            </Text>
            {subtitle !== undefined && (
              <Text secondary numberOfLines={1}>
                {subtitle}
              </Text>
            )}
          </View>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: { gap: spacing.sm },
  pressed: { opacity: pressedOpacity },
  wideArt: { borderRadius: radii.card, overflow: 'hidden' },
  // Dark on the left under the text, clear on the right so the art shows.
  fade: {
    backgroundImage: 'linear-gradient(to right, rgba(0, 0, 0, 0.8) 0%, rgba(0, 0, 0, 0.35) 50%, rgba(0, 0, 0, 0) 75%)',
  },
  onArt: {
    position: 'absolute',
    left: spacing.lg,
    bottom: spacing.lg,
    maxWidth: '55%',
    gap: spacing.xs,
  },
  eyebrow: { letterSpacing: 0.6 },
  play: { alignSelf: 'flex-start', minWidth: WIDE_PLAY_MIN_WIDTH, marginTop: spacing.sm },
});
