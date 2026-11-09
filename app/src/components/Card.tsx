// SPDX-License-Identifier: GPL-3.0-or-later
import { memo } from 'react';

import type { BaseItemDto } from '@/api';
import { Pressable, StyleSheet, View, type AccessibilityActionEvent } from 'react-native';

import { spokenRemaining } from '@/format';
import { deviceSizes, pressedOpacity, radii, spacing, tv, type, useColors } from '@/theme';

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
  onPress?: () => void;
  /** Long press (VoiceOver: the "More" action): the item's menu. */
  onLongPress?: () => void;
} & ItemHandlers;

/**
 * The item a card stands for and handlers that take it, instead of `onPress` / `onLongPress` closures: one stable
 * handler for every card of a list, so the memoised card skips re-rendering when its list renders.
 */
export type ItemHandlers = {
  item?: BaseItemDto;
  onOpen?: (item: BaseItemDto) => void;
  onMenu?: (item: BaseItemDto) => void;
};

/** `onPress` / `onLongPress`, else the item handlers bound to the item. */
export function itemPress({
  item,
  onOpen,
  onMenu,
  onPress,
  onLongPress,
}: ItemHandlers & Pick<CardProps, 'onPress' | 'onLongPress'>) {
  return {
    press: onPress ?? (item && onOpen ? () => onOpen(item) : undefined),
    longPress: onLongPress ?? (item && onMenu ? () => onMenu(item) : undefined),
  };
}

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

/** The VoiceOver / TalkBack action that opens a card's menu - same name and label on every card. */
export const MORE_ACTION = { name: 'more', label: 'More' } as const;
const MORE_ACTIONS = [MORE_ACTION];

/** Long press, also as a VoiceOver / TalkBack action ("More"), for any card or row. */
export function longPressProps(onLongPress: (() => void) | undefined) {
  if (!onLongPress) return {};
  return {
    onLongPress,
    accessibilityActions: MORE_ACTIONS,
    onAccessibilityAction: ({ nativeEvent }: AccessibilityActionEvent) => {
      if (nativeEvent.actionName === MORE_ACTION.name) onLongPress();
    },
  };
}

// Memo: grids and rows re-render on refresh / paging; a card only changes with its own props.
const MediaCard = memo(function MediaCard({
  aspectRatio,
  width,
  ...props
}: CardProps & { aspectRatio: number; width: number }) {
  const { title, subtitle, image, progress, remainingSeconds, played } = props;
  const { press, longPress } = itemPress(props);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={cardLabel(props)}
      {...longPressProps(longPress)}
      onPress={press}
      // Apple TV: focus grows the card and lifts it (the shelf leaves room for it).
      style={({ pressed, focused }) => [styles.card, { width }, pressed && styles.pressed, focused && styles.focused]}
    >
      <Artwork
        image={image}
        aspectRatio={aspectRatio}
        progress={progress}
        remainingSeconds={remainingSeconds}
        played={played}
      />
      <View>
        <Text variant="label" numberOfLines={1} style={deviceSizes.cardTitle}>
          {title}
        </Text>
        {subtitle !== undefined && (
          <Text variant="caption" secondary numberOfLines={1} style={deviceSizes.cardSubtitle}>
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

/**
 * Tablets: cards about this wide, as many whole ones as fit the row (`fitCards`), so they come out a bit wider. Posters
 * (the Library grid too): five of ~190 pt across a 13" iPad in portrait, four on an 11". Landscape cards: three of
 * ~325 pt on a 13", two on an 11" - artwork sized like the store apps, not phone cards in more columns.
 */
export const WIDE_POSTER_WIDTH = 170;
export const WIDE_LANDSCAPE_WIDTH = 300;
/** Tablets: posters in a detail screen's More Like This (a shelf with the next one peeking in, not fitted). */
export const WIDE_SHELF_POSTER_WIDTH = 190;

/** 2:3 poster with title + subtitle under it (library grid, Recently Added). */
export function PosterCard({ width = POSTER_WIDTH, ...props }: CardProps) {
  return <MediaCard {...props} width={width} aspectRatio={2 / 3} />;
}

/** 16:9 card with the progress bar over the image (Continue Watching, Next Up, episodes). */
export function LandscapeCard({ width = LANDSCAPE_WIDTH, ...props }: CardProps) {
  return <MediaCard {...props} width={width} aspectRatio={16 / 9} />;
}

/**
 * Grey card while a row loads: artwork box + two text lines. A percentage width for the Home hero (`'100%'`, or its
 * share of the row in tablet landscape). Hidden from VoiceOver (the row says "Loading").
 */
export function CardPlaceholder({
  shape,
  width,
  aspectRatio,
}: {
  shape: 'poster' | 'landscape';
  width?: number | `${number}%`;
  /** The art's shape when it isn't the usual one (the Home hero on wide screens). */
  aspectRatio?: number;
}) {
  const c = useColors();
  const poster = shape === 'poster';
  return (
    <View
      testID="card-placeholder"
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[styles.card, { width: width ?? (poster ? POSTER_WIDTH : LANDSCAPE_WIDTH) }]}
    >
      <View
        style={[
          styles.placeholderArt,
          { aspectRatio: aspectRatio ?? (poster ? 2 / 3 : 16 / 9), backgroundColor: c.surface },
        ]}
      />
      <View style={[styles.placeholderLine, { width: '70%', backgroundColor: c.surface }]} />
      <View style={[styles.placeholderLine, { width: '40%', backgroundColor: c.surface }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  pressed: { opacity: pressedOpacity },
  focused: { transform: [{ scale: tv.focus.cardScale }], ...tv.focus.shadow, zIndex: 1 },
  placeholderArt: { width: '100%', borderRadius: radii.card },
  placeholderLine: { height: type.caption.fontSize, borderRadius: radii.pill },
});
