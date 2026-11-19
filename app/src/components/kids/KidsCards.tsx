// SPDX-License-Identifier: GPL-3.0-or-later
// Kids mode cards (docs/context/kids.md): a 2:3 poster per show or movie (Home) and a 16:9 episode picture (the show
// page). No text on them - VoiceOver reads the names; no long press, no menus. Both take the item + one stable handler
// per list (CLAUDE.md §10), so they skip re-renders.
import { SymbolView } from 'expo-symbols';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { BaseItemDto } from '@/api';
import { Artwork } from '@/components/Artwork';
import { isInProgress, ProgressBar } from '@/components/ProgressBar';
import { Text } from '@/components/Text';
import { cardLabel } from '@/components/Card';
import { landscapeImage, playback, posterImage } from '@/items';
import { kids, onArtwork, pressedOpacity, spacing, useColors } from '@/theme';
import { useImage } from '@/useImage';

/** Fast double taps open one screen: a second tap within this window does nothing. */
const TAP_GUARD_MS = 800;
let lastTap = -Infinity;

/** Runs `action` unless another kids card ran one a moment ago (kids tap fast; two screens must not stack). */
export function once(action: () => void, now = Date.now()) {
  if (now - lastTap < TAP_GUARD_MS) return;
  lastTap = now;
  action();
}

/** VoiceOver name of an episode picture: "Episode 3, The Giant Muffin" (its season first when there are several). */
export function episodeName(item: BaseItemDto, withSeason: boolean): string {
  const season = withSeason && item.ParentIndexNumber !== undefined ? `Season ${item.ParentIndexNumber}, ` : '';
  const number = item.IndexNumber !== undefined ? `Episode ${item.IndexNumber}, ` : '';
  return `${season}${number}${item.Name}`;
}

/** One stack step: across, and down (1.5x, so poster + cards stay 2:3 - the movie tile's shape). */
const STACK_X = kids.stack.step;
const STACK_Y = kids.stack.step * 1.5;

type PosterProps = { item: BaseItemDto; width: number; onOpen: (item: BaseItemDto) => void };

/**
 * Home: a show or movie poster. A show sits on a stack of two cards peeking out at its bottom right - there's more
 * inside - and opens its page; a movie plays (the handler decides). The whole stack fills the tile a movie poster
 * fills: the show's poster shrinks to make room, and the cards step 1.5x as far down as right so the stack keeps 2:3.
 */
export const KidsPoster = memo(function KidsPoster({ item, width, onOpen }: PosterProps) {
  const c = useColors();
  const image = useImage();
  const series = item.Type === 'Series';
  const status = playback(item);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={cardLabel({ title: item.Name, ...status })}
      onPress={() => once(() => onOpen(item))}
      style={({ pressed }) => [{ width }, series && styles.stackRoom, pressed && styles.pressed]}
    >
      {series && (
        <View testID="kids-stack" style={StyleSheet.absoluteFill}>
          <View style={[styles.stackCard, styles.stackBack, { backgroundColor: c.elevated2 }]} />
          <View style={[styles.stackCard, styles.stackMiddle, { backgroundColor: c.elevated }]} />
        </View>
      )}
      <View style={styles.clip}>
        <Artwork
          image={image(posterImage(item), series ? width - STACK_X * 2 : width)}
          aspectRatio={2 / 3}
          {...status}
        />
      </View>
    </Pressable>
  );
});

type EpisodeProps = {
  item: BaseItemDto;
  width: number;
  /** The show's next episode: a ▶ chip on it. */
  next: boolean;
  withSeason: boolean;
  onPlay: (item: BaseItemDto) => void;
};

/**
 * The show page: an episode's own 16:9 still with its name on it (white over a fade, like the app's status line), a ✓
 * when watched, the progress bar under the name when started. Tap plays (resumes a started one).
 */
export const KidsEpisode = memo(function KidsEpisode({ item, width, next, withSeason, onPlay }: EpisodeProps) {
  const c = useColors();
  const image = useImage();
  const status = playback(item);
  const title = episodeName(item, withSeason);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={cardLabel({ title: next ? `Next: ${title}` : title, ...status })}
      onPress={() => once(() => onPlay(item))}
      style={({ pressed }) => [{ width }, pressed && styles.pressed]}
    >
      <View testID={next ? 'kids-next' : undefined} style={styles.clip}>
        <Artwork image={image(landscapeImage(item), width)} aspectRatio={16 / 9} />
        <View style={styles.fade} />
        <View style={styles.status}>
          <View style={styles.nameRow}>
            <Text style={[kids.type.episode, styles.onArt]} numberOfLines={1}>
              {item.Name}
            </Text>
            {status.played && (
              <View testID="kids-watched">
                <SymbolView
                  name={{ ios: 'checkmark.circle.fill', android: 'check_circle' }}
                  tintColor={onArtwork.fill}
                  size={kids.show.watched}
                />
              </View>
            )}
          </View>
          {isInProgress(status.progress, status.played) && <ProgressBar progress={status.progress ?? 0} overArtwork />}
        </View>
        {next && (
          <View style={[styles.nextChip, { backgroundColor: c.text }]}>
            <SymbolView
              name={{ ios: 'play.fill', android: 'play_arrow' }}
              tintColor={c.background}
              size={kids.show.chipIcon}
            />
          </View>
        )}
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  pressed: { opacity: pressedOpacity },
  // Rounder than app cards: the clip wins over the artwork's own corners.
  clip: { borderRadius: kids.radius, overflow: 'hidden' },
  // Room for two cards inside the tile; each card is the poster's size, one / two steps down and right.
  stackRoom: { paddingRight: STACK_X * 2, paddingBottom: STACK_Y * 2 },
  stackCard: { position: 'absolute', borderRadius: kids.radius },
  stackBack: { top: STACK_Y * 2, left: STACK_X * 2, right: 0, bottom: 0 },
  stackMiddle: { top: STACK_Y, left: STACK_X, right: STACK_X, bottom: STACK_Y },
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '50%', backgroundImage: onArtwork.fade },
  status: {
    position: 'absolute',
    left: kids.show.chipInset,
    right: kids.show.chipInset,
    bottom: kids.show.chipInset,
    gap: spacing.sm,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  onArt: { flex: 1, color: onArtwork.fill },
  nextChip: {
    position: 'absolute',
    left: kids.show.chipInset,
    top: kids.show.chipInset,
    width: kids.show.chip,
    height: kids.show.chip,
    borderRadius: kids.show.chip / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
