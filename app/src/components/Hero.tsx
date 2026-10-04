// SPDX-License-Identifier: GPL-3.0-or-later
import { Pressable, StyleSheet, View } from 'react-native';

import { pressedOpacity, spacing } from '@/theme';

import { Artwork } from './Artwork';
import { cardLabel, type CardProps } from './Card';
import { Text } from './Text';

export type HeroProps = Omit<CardProps, 'width'> & {
  /** Small line above the title: "Continue Watching", "Up Next". */
  eyebrow: string;
};

/** Full-width 16:9 card at the top of Home (Up Next): backdrop with progress, then eyebrow, title, subtitle. */
export function Hero({ eyebrow, ...props }: HeroProps) {
  const { title, subtitle, image, progress, remainingSeconds, played, onPress } = props;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${eyebrow}, ${cardLabel(props)}`}
      onPress={onPress}
      style={({ pressed }) => [styles.hero, pressed && styles.pressed]}
    >
      <Artwork
        image={image}
        aspectRatio={16 / 9}
        progress={progress}
        remainingSeconds={remainingSeconds}
        played={played}
      />
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
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: { gap: spacing.sm },
  pressed: { opacity: pressedOpacity },
});
