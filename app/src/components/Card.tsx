// SPDX-License-Identifier: GPL-3.0-or-later
import { Pressable, StyleSheet, View } from 'react-native';

import { spokenRemaining } from '@/format';
import { pressedOpacity, spacing } from '@/theme';

import { Artwork } from './Artwork';
import { isInProgress } from './ProgressBar';
import { Text } from './Text';

export type CardProps = {
  title: string;
  /** Second line: year, episode, time left. */
  subtitle?: string;
  image?: string;
  /** 0-1 watched progress. */
  progress?: number;
  /** Seconds left; shown after the bar ("32m") while in progress. */
  remainingSeconds?: number;
  played?: boolean;
  width?: number;
  onPress: () => void;
};

/** "Dune, 2021, 40% watched, 32 minutes left" - what VoiceOver reads for a card. */
export function cardLabel({ title, subtitle, progress, remainingSeconds, played }: CardProps): string {
  const inProgress = isInProgress(progress, played);
  const left = inProgress && remainingSeconds !== undefined ? spokenRemaining(remainingSeconds) : undefined;
  // 1-99 while in progress: "0%" / "100% watched" would contradict the bar.
  const state = played
    ? 'watched'
    : isInProgress(progress)
      ? `${Math.min(99, Math.max(1, Math.round(progress * 100)))}% watched`
      : undefined;
  return [title, subtitle, state, left && `${left} left`].filter(Boolean).join(', ');
}

function MediaCard({ aspectRatio, width, ...props }: CardProps & { aspectRatio: number; width: number }) {
  const { title, subtitle, image, progress, remainingSeconds, played, onPress } = props;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={cardLabel(props)}
      onPress={onPress}
      style={({ pressed }) => [styles.card, { width }, pressed && styles.pressed]}
    >
      <Artwork
        image={image}
        aspectRatio={aspectRatio}
        progress={progress}
        remainingSeconds={remainingSeconds}
        played={played}
      />
      <View>
        <Text variant="label" numberOfLines={1}>
          {title}
        </Text>
        {subtitle !== undefined && (
          <Text variant="caption" secondary numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

/** 2:3 poster with title + subtitle under it (library grid, Recently Added). */
export function PosterCard({ width = 120, ...props }: CardProps) {
  return <MediaCard {...props} width={width} aspectRatio={2 / 3} />;
}

/** 16:9 card with the progress bar over the image (Continue Watching, Next Up, episodes). */
export function LandscapeCard({ width = 260, ...props }: CardProps) {
  return <MediaCard {...props} width={width} aspectRatio={16 / 9} />;
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  pressed: { opacity: pressedOpacity },
});
