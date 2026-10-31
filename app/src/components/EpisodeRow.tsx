// SPDX-License-Identifier: GPL-3.0-or-later
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { formatRemaining, spokenRemaining } from '@/format';
import { pressedOpacity, spacing, useWide } from '@/theme';

import { Artwork } from './Artwork';
import { cardLabel, itemPress, longPressProps, type ItemHandlers } from './Card';
import { Text } from './Text';

/** Still width in an episode list (points); image URLs are sized from it. */
export const EPISODE_ROW_STILL = 128;
/** Wide screens (iPad): a bigger still, in step with the bigger cards there. */
export const WIDE_EPISODE_ROW_STILL = 192;

/** An episode row's still width for this window. */
export function useEpisodeRowStill(): number {
  return useWide() ? WIDE_EPISODE_ROW_STILL : EPISODE_ROW_STILL;
}

export type EpisodeRowProps = {
  /** Show name. */
  title: string;
  /** "S1:E2 · Pilot". */
  subtitle?: string;
  /** Runtime: shown "45m", spoken "45 minutes". */
  runtimeSeconds?: number;
  image?: string;
  progress?: number;
  remainingSeconds?: number;
  played?: boolean;
  onPress?: () => void;
  /** Long press (VoiceOver: "More"): the item's menu. */
  onLongPress?: () => void;
} & ItemHandlers;

/** Episode in a vertical list (Library, Episodes type): 16:9 still with progress, show, episode line, runtime. */
// Memoised: rows of a long paged list (`PagedList`) skip re-rendering when the list renders.
export const EpisodeRow = memo(function EpisodeRow(props: EpisodeRowProps) {
  const stillWidth = useEpisodeRowStill();
  const { title, subtitle, runtimeSeconds, image, progress, remainingSeconds, played } = props;
  const { press, longPress } = itemPress(props);
  const runtime = runtimeSeconds !== undefined ? formatRemaining(runtimeSeconds) : undefined;
  const spokenRuntime = runtimeSeconds !== undefined ? spokenRemaining(runtimeSeconds) : undefined;
  return (
    <Pressable
      accessibilityRole="button"
      // The runtime too, as on screen ("45m" may be read as metres).
      accessibilityLabel={[cardLabel({ title, subtitle, progress, remainingSeconds, played }), spokenRuntime]
        .filter(Boolean)
        .join(', ')}
      {...longPressProps(longPress)}
      onPress={press}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View testID="episode-row-still" style={{ width: stillWidth }}>
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
        {runtime !== undefined && (
          <Text variant="caption" secondary>
            {runtime}
          </Text>
        )}
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + spacing.xs },
  text: { flex: 1, gap: spacing.xs / 2 },
  pressed: { opacity: pressedOpacity },
});
