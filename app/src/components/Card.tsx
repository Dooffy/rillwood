// SPDX-License-Identifier: GPL-3.0-or-later
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { spokenRemaining } from '@/format';
import { pressedOpacity, radii, spacing, type, useColors } from '@/theme';

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

// Memo: grids and rows re-render on refresh / paging; a card only changes with its own props.
const MediaCard = memo(function MediaCard({
  aspectRatio,
  width,
  ...props
}: CardProps & { aspectRatio: number; width: number }) {
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
});

/** Default card widths in points (image URLs are sized from them). */
export const POSTER_WIDTH = 120;
export const LANDSCAPE_WIDTH = 260;

/** 2:3 poster with title + subtitle under it (library grid, Recently Added). */
export function PosterCard({ width = POSTER_WIDTH, ...props }: CardProps) {
  return <MediaCard {...props} width={width} aspectRatio={2 / 3} />;
}

/** 16:9 card with the progress bar over the image (Continue Watching, Next Up, episodes). */
export function LandscapeCard({ width = LANDSCAPE_WIDTH, ...props }: CardProps) {
  return <MediaCard {...props} width={width} aspectRatio={16 / 9} />;
}

/**
 * Grey card while a row loads: artwork box + two text lines. `width="100%"` for the Home hero. Hidden from VoiceOver
 * (the row says "Loading").
 */
export function CardPlaceholder({ shape, width }: { shape: 'poster' | 'landscape'; width?: number | '100%' }) {
  const c = useColors();
  const poster = shape === 'poster';
  return (
    <View
      testID="card-placeholder"
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[styles.card, { width: width ?? (poster ? POSTER_WIDTH : LANDSCAPE_WIDTH) }]}
    >
      <View style={[styles.placeholderArt, { aspectRatio: poster ? 2 / 3 : 16 / 9, backgroundColor: c.surface }]} />
      <View style={[styles.placeholderLine, { width: '70%', backgroundColor: c.surface }]} />
      <View style={[styles.placeholderLine, { width: '40%', backgroundColor: c.surface }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  pressed: { opacity: pressedOpacity },
  placeholderArt: { width: '100%', borderRadius: radii.card },
  placeholderLine: { height: type.caption.fontSize, borderRadius: radii.pill },
});
