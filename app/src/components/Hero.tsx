// SPDX-License-Identifier: GPL-3.0-or-later
import { Pressable, StyleSheet, View } from 'react-native';

import { pressedOpacity, spacing, useWide, useWideLandscape } from '@/theme';

import { Artwork } from './Artwork';
import { cardLabel, type CardProps, longPressProps } from './Card';
import { Text } from './Text';

/**
 * Share of the row the artwork takes when the text sits beside it: a tablet in landscape, where a full-width 16:9
 * hero would fill the screen.
 */
export const HERO_SIDE_SHARE = 0.6;
export const HERO_SIDE_ART = `${HERO_SIDE_SHARE * 100}%` as const;

/** Wide screens in portrait (iPad): a full-width 16:9 hero takes ~40% of a 13" screen, so it's cropped wider. */
export const WIDE_HERO_RATIO = 2.4;

/** The hero art's aspect ratio: 16:9, cropped wider on a wide screen when the art runs full width. */
export function useHeroAspect() {
  const wide = useWide();
  const beside = useWideLandscape();
  return wide && !beside ? WIDE_HERO_RATIO : 16 / 9;
}

export type HeroProps = Omit<CardProps, 'width'> & {
  /** Small line above the title: "Continue Watching", "Up Next". */
  eyebrow: string;
};

/**
 * 16:9 card at the top of Home (Up Next): backdrop with progress, then eyebrow, title, subtitle. Full width with the
 * text under it; a tablet in landscape puts the text beside it.
 */
export function Hero({ eyebrow, ...props }: HeroProps) {
  const { title, subtitle, image, progress, remainingSeconds, played, onPress, onLongPress } = props;
  const beside = useWideLandscape();
  const aspectRatio = useHeroAspect();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${eyebrow}, ${cardLabel(props)}`}
      {...longPressProps(onLongPress)}
      onPress={onPress}
      style={({ pressed }) => [styles.hero, beside && styles.row, pressed && styles.pressed]}
    >
      <View testID="hero-art" style={beside ? styles.sideArt : styles.fullArt}>
        <Artwork
          image={image}
          aspectRatio={aspectRatio}
          progress={progress}
          remainingSeconds={remainingSeconds}
          played={played}
        />
      </View>
      <View style={beside && styles.sideText}>
        <Text variant="caption" secondary numberOfLines={1}>
          {eyebrow}
        </Text>
        <Text variant="sectionHeader" numberOfLines={beside ? 2 : 1}>
          {title}
        </Text>
        {subtitle !== undefined && (
          <Text secondary numberOfLines={beside ? 2 : 1}>
            {subtitle}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  fullArt: { width: '100%' },
  sideArt: { width: HERO_SIDE_ART },
  sideText: { flex: 1, gap: spacing.xs },
  pressed: { opacity: pressedOpacity },
});
