// SPDX-License-Identifier: GPL-3.0-or-later
import { Image } from 'expo-image';
import type { ReactNode } from 'react';
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
/** Wide screens: the text column's widest, and the credits column beside it. */
const WIDE_TEXT_WIDTH = 560;
const SIDE_WIDTH = 280;

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
  /** On the art under the subtitle: facts, actions (and on wide screens the summary and badges). */
  children?: ReactNode;
  /** Wide screens: a column on the right of the art, bottom-aligned with the text (credits). */
  side?: ReactNode;
};

/**
 * Top of a detail screen, under the transparent header: art fading into the page, then on it the logo or title, the
 * subtitle and `children`; `side` on the right on wide screens. Grows past its art height when the text needs it.
 */
export function DetailHero({ art, logo, title, subtitle, parent, children, side }: DetailHeroProps) {
  const c = useColors();
  const { wide, width, height } = useHeroLayout();
  return (
    <View testID="detail-hero" style={[styles.hero, { width, minHeight: height, backgroundColor: c.surface }]}>
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
            // The bottom half holds text and buttons: it reaches the page colour well before the edge.
            backgroundImage: `linear-gradient(to bottom, ${c.background}66 0%, ${c.background}00 20%, ${c.background}00 35%, ${c.background}D9 70%, ${c.background} 92%)`,
          },
        ]}
      />
      {/* Wide screens: left-aligned over the strip, in line with the body under it; `side` on the right. */}
      <View style={[styles.content, wide && styles.wideContent]}>
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
          {children}
        </View>
        {wide && side ? <View style={styles.side}>{side}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { justifyContent: 'flex-end' },
  content: { paddingHorizontal: spacing.md, paddingBottom: spacing.md },
  wideContent: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.lg * 2 },
  text: { alignItems: 'center', gap: spacing.sm },
  side: { width: SIDE_WIDTH },
  logo: { width: LOGO_WIDTH, height: LOGO_WIDTH / 3 },
  center: { textAlign: 'center' },
  // The text column keeps a readable width beside the credits.
  start: { flex: 1, maxWidth: WIDE_TEXT_WIDTH, alignItems: 'flex-start' },
  parent: { minHeight: minTouch, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  pressed: { opacity: pressedOpacity },
});
