// SPDX-License-Identifier: GPL-3.0-or-later
import { Pressable, StyleSheet, View } from 'react-native';

import { pressedOpacity, spacing } from '@/theme';

import { Artwork } from './Artwork';
import { cardLabel, longPressProps } from './Card';
import { Text } from './Text';

/** Still width in an episode list (points); image URLs are sized from it. */
export const EPISODE_ROW_STILL = 128;

export type EpisodeRowProps = {
  /** Show name. */
  title: string;
  /** "S1:E2 · Pilot". */
  subtitle?: string;
  /** Runtime or time left: "45m". */
  meta?: string;
  image?: string;
  progress?: number;
  remainingSeconds?: number;
  played?: boolean;
  onPress: () => void;
  /** Long press (VoiceOver: "More"): the item's menu. */
  onLongPress?: () => void;
};

/** Episode in a vertical list (Library, Episodes type): 16:9 still with progress, show, episode line, runtime. */
export function EpisodeRow(props: EpisodeRowProps) {
  const { title, subtitle, meta, image, progress, remainingSeconds, played, onPress, onLongPress } = props;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={cardLabel({ title, subtitle, progress, remainingSeconds, played, onPress })}
      {...longPressProps(onLongPress)}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.still}>
        <Artwork
          image={image}
          aspectRatio={16 / 9}
          progress={progress}
          remainingSeconds={remainingSeconds}
          played={played}
        />
      </View>
      <View style={styles.text}>
        <Text variant="label" numberOfLines={1}>
          {title}
        </Text>
        {subtitle !== undefined && (
          <Text variant="caption" secondary numberOfLines={2}>
            {subtitle}
          </Text>
        )}
        {meta !== undefined && (
          <Text variant="caption" secondary>
            {meta}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + spacing.xs },
  still: { width: EPISODE_ROW_STILL },
  text: { flex: 1, gap: spacing.xs / 2 },
  pressed: { opacity: pressedOpacity },
});
