// SPDX-License-Identifier: GPL-3.0-or-later
import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { formatRemaining, spokenRemaining } from '@/format';
import { minTouch, pressedOpacity, radii, spacing, type, useColors, useWide } from '@/theme';

import { ProgressRing } from './ProgressRing';
import { MORE_ACTION } from './Card';
import { Text } from './Text';

/** Card width (points); image URLs and the list's scroll offsets are sized from it. */
export const EPISODE_CARD_WIDTH = 300;
/** Wide screens (iPad): bigger cards, about three across a 13" portrait screen. */
export const WIDE_EPISODE_CARD_WIDTH = 340;

/** Card width for this window: phone size, bigger on wide screens. */
export function useEpisodeCardWidth(): number {
  return useWide() ? WIDE_EPISODE_CARD_WIDTH : EPISODE_CARD_WIDTH;
}
const RING_SIZE = 24;
/** Overview lines every card keeps (cards in a row line up); longer ones end with "…". */
export const OVERVIEW_LINES = 2;
export const OVERVIEW_LINE_HEIGHT = Math.round(type.caption.fontSize * 1.4);

export type EpisodeCardProps = {
  /** Episode number: "EPISODE 3" on the card, "Episode 3" for VoiceOver. */
  episode?: number;
  title: string;
  overview?: string;
  image?: string;
  /** 0-1 while in progress (never set once played). */
  progress?: number;
  remainingSeconds?: number;
  runtimeSeconds?: number;
  played?: boolean;
  favourite?: boolean;
  /** Reserve 3 overview lines (some episode in the season has an overview), so the cards in a row line up. */
  overviewLines?: boolean;
  /** Card tap: the episode's detail. */
  onPress: () => void;
  /** ▶ in the footer: play / resume. */
  onPlay: () => void;
  /** ⋯ and long press: more actions. */
  onMore: () => void;
};

/** "32m left" while in progress, "Watched" once played, else the runtime. */
function timeLabel({ played, progress, remainingSeconds, runtimeSeconds }: EpisodeCardProps): string | undefined {
  if (played) return 'Watched';
  if (progress !== undefined) {
    const left = formatRemaining(remainingSeconds ?? 0);
    return left && `${left} left`;
  }
  return runtimeSeconds === undefined ? undefined : formatRemaining(runtimeSeconds);
}

/**
 * Apple TV style episode card: still fading into the card, EPISODE n, title, 3 lines of overview (none reserved when
 * the season has no overviews); footer with ▶ (progress ring + time left / runtime), ♥ when a favourite, and ⋯.
 * VoiceOver reads the card as one element with Play and More actions.
 */
export const EpisodeCard = memo(function EpisodeCard(props: EpisodeCardProps) {
  const {
    episode,
    title,
    overview,
    image,
    progress,
    remainingSeconds,
    played = false,
    favourite = false,
    overviewLines = true,
    onPress,
    onPlay,
    onMore,
  } = props;
  const c = useColors();
  const width = useEpisodeCardWidth();
  const inProgress = progress !== undefined;
  const time = timeLabel(props);
  const name = episode === undefined ? title : `Episode ${episode}, ${title}`;
  const spokenLeft = inProgress ? spokenRemaining(remainingSeconds ?? 0) : undefined;
  const playLabel = [inProgress ? `Resume ${name}` : `Play ${name}`, spokenLeft && `${spokenLeft} left`]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[name, played ? 'watched' : undefined, favourite ? 'favourite' : undefined]
        .filter(Boolean)
        .join(', ')}
      accessibilityHint="Opens the episode"
      // The ▶ and ⋯ buttons sit inside the card, which VoiceOver reads as one element: offer them as actions.
      accessibilityActions={[{ name: 'play', label: inProgress ? 'Resume' : 'Play' }, MORE_ACTION]}
      onAccessibilityAction={({ nativeEvent }) => (nativeEvent.actionName === 'play' ? onPlay() : onMore())}
      onPress={onPress}
      onLongPress={onMore}
      style={({ pressed }) => [styles.card, { width, backgroundColor: c.surface }, pressed && styles.pressed]}
    >
      <View style={styles.still}>
        {image && (
          <Image
            source={image}
            cachePolicy="memory-disk"
            contentFit="cover"
            transition={150}
            style={StyleSheet.absoluteFill}
            accessible={false}
          />
        )}
        <View
          style={[styles.fade, { backgroundImage: `linear-gradient(to bottom, ${c.surface}00 0%, ${c.surface} 100%)` }]}
        />
      </View>
      <View style={styles.text}>
        {episode !== undefined && (
          <Text variant="caption" secondary style={styles.label}>
            EPISODE {episode}
          </Text>
        )}
        <Text variant="label" numberOfLines={1}>
          {title}
        </Text>
        {overviewLines && (
          <Text variant="caption" secondary numberOfLines={OVERVIEW_LINES} style={styles.overview}>
            {overview ?? ''}
          </Text>
        )}
      </View>
      <View style={styles.footer}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={playLabel}
          onPress={onPlay}
          style={({ pressed }) => [styles.play, pressed && styles.pressed]}
        >
          <ProgressRing progress={played ? 1 : (progress ?? 0)} size={RING_SIZE}>
            <SymbolView name={{ ios: 'play.fill', android: 'play_arrow' }} tintColor={c.text} size={RING_SIZE / 2.4} />
          </ProgressRing>
          {time ? (
            <Text variant="caption" style={styles.time}>
              {time}
            </Text>
          ) : null}
          {favourite && <SymbolView name={{ ios: 'heart.fill', android: 'favorite' }} tintColor={c.text} size={13} />}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`More for ${name}`}
          onPress={onMore}
          style={({ pressed }) => [styles.more, pressed && styles.pressed]}
        >
          <SymbolView name={{ ios: 'ellipsis', android: 'more_horiz' }} tintColor={c.textSecondary} size={20} />
        </Pressable>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, overflow: 'hidden' },
  pressed: { opacity: pressedOpacity },
  still: { width: '100%', aspectRatio: 16 / 9 },
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '35%' },
  text: { paddingHorizontal: spacing.md, gap: spacing.xs },
  label: { fontWeight: type.label.fontWeight },
  // Lines reserved even for short overviews, so cards in a row line up.
  overview: { lineHeight: OVERVIEW_LINE_HEIGHT, minHeight: OVERVIEW_LINE_HEIGHT * OVERVIEW_LINES },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xs,
  },
  play: {
    minHeight: minTouch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  time: { fontWeight: type.label.fontWeight },
  more: { width: minTouch, height: minTouch, alignItems: 'center', justifyContent: 'center' },
});
