// SPDX-License-Identifier: GPL-3.0-or-later
import { Image } from 'expo-image';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { minTouch, pressedOpacity, spacing, useColors, useWide } from '@/theme';

import { Chevron } from './List';
import { Text } from './Text';

/** Hero art height / width (4:5, Apple TV style): backdrops are cover-cropped, posters fit almost whole. */
const HERO_RATIO = 1.25;
/** Image width / screen width for the hero: 16:9 art cover-cropped into 4:5 is about 2.2x as wide as the screen. */
const HERO_ART_SCALE = HERO_RATIO * (16 / 9);
export const LOGO_WIDTH = 240;
/** Wide screens: the hero is a landscape strip, 16:9 of the width but at most this share of the window's height. */
const WIDE_HERO_HEIGHT = 0.6;

/**
 * The hero's size for this window and the width to request its art at (cover-cropped). Phones: 4:5 of the width.
 * Wide screens: a landscape strip - 4:5 of an iPad's width would be taller than the screen.
 */
export function useHeroLayout() {
  const { width, height } = useWindowDimensions();
  const wide = useWide();
  return wide
    ? { wide, width, height: Math.round(Math.min((width * 9) / 16, height * WIDE_HERO_HEIGHT)), artWidth: width }
    : { wide, width, height: width * HERO_RATIO, artWidth: width * HERO_ART_SCALE };
}

export type DetailHeroProps = {
  /** Image URLs (sized by the caller): art for the background, logo instead of the text title. */
  art?: string;
  logo?: string;
  title: string;
  /** "Movie · Animation", "S1:E2 · Season 1"; hidden when empty. */
  subtitle: string;
  /** Link above the title (episode → its series). */
  parent?: { name: string; onPress: () => void };
};

/** Top of a detail screen, under the transparent header: art with scrim, logo or title, subtitle. */
export function DetailHero({ art, logo, title, subtitle, parent }: DetailHeroProps) {
  const c = useColors();
  const { wide, width, height } = useHeroLayout();
  return (
    <View testID="detail-hero" style={[styles.hero, { width, height, backgroundColor: c.surface }]}>
      {art && (
        <Image
          testID="detail-backdrop"
          source={art}
          cachePolicy="memory-disk"
          contentFit="cover"
          transition={150}
          style={StyleSheet.absoluteFill}
          accessible={false}
        />
      )}
      {/* Darkens the top under the header buttons, fades the bottom into the page under the title. */}
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundImage: `linear-gradient(to bottom, ${c.background}66 0%, ${c.background}00 20%, ${c.background}00 45%, ${c.background} 100%)`,
          },
        ]}
      />
      {/* Wide screens: left-aligned over the strip, in line with the body under it. */}
      <View style={[styles.text, wide && styles.start]}>
        {parent && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={parent.name}
            accessibilityHint="Opens the series"
            onPress={parent.onPress}
            style={({ pressed }) => [styles.parent, pressed && styles.pressed]}
          >
            <Text variant="label" secondary numberOfLines={1}>
              {parent.name}
            </Text>
            <Chevron />
          </Pressable>
        )}
        {logo ? (
          <Image
            testID="detail-logo"
            source={logo}
            cachePolicy="memory-disk"
            contentFit="contain"
            style={styles.logo}
            accessible
            accessibilityRole="header"
            accessibilityLabel={title}
          />
        ) : (
          <Text variant="largeTitle" accessibilityRole="header" numberOfLines={3} style={!wide && styles.center}>
            {title}
          </Text>
        )}
        {subtitle !== '' && (
          <Text secondary numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { justifyContent: 'flex-end' },
  text: { alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.md, paddingBottom: spacing.md },
  logo: { width: LOGO_WIDTH, height: LOGO_WIDTH / 3 },
  center: { textAlign: 'center' },
  start: { alignItems: 'flex-start' },
  parent: { minHeight: minTouch, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  pressed: { opacity: pressedOpacity },
});
