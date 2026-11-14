// SPDX-License-Identifier: GPL-3.0-or-later
// Apple TV series seasons (screen draft 09): season pills, then a shelf of the season's episode cards. Moving across
// the pills switches the shelf (no click needed); the shelf starts at the next episode, and the first swipe down lands
// on it. An episode card: the still with progress / ✓ Watched, "E5 · Title", runtime, a two-line summary. Click plays
// it (resumes if started, a watched one from the start) - the card already shows what you'd decide on; hold opens its
// menu: Play from Start, Mark Watched, Favourite, Episode Details (the episode's own screen).
import { memo, useState, type ComponentRef } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import type { BaseItemDto, ItemsResult } from '@/api';
import { formatRemaining } from '@/format';
import { episodeLine, episodes, landscapeImage, playback, ticksToSeconds } from '@/items';
import { openPlayer } from '@/navigation';
import { tv } from '@/theme';
import { useFetch } from '@/useFetch';
import { useImage } from '@/useImage';

import { Artwork } from '../Artwork';
import { longPressProps } from '../Card';
import { useItemMenu } from '../ItemMenu';
import { loadErrorMessage, Message } from '../Message';
import { useShelfCards } from '../shelfCards';
import { Bone } from '../Skeleton';
import { Text } from '../Text';
import { focusStyles, rememberFocus, TvFocusRow } from './focus';
import { TvPill } from './TvPill';
import { TvShelf, tvShelfListContent } from './TvShelf';

type CardHandle = ComponentRef<typeof Pressable>;

const Gap = () => <View style={styles.gap} />;

type EpisodeCardProps = { ep: BaseItemDto; width: number; ref?: (view: CardHandle | null) => void };

const TvEpisodeCard = memo(function TvEpisodeCard({ ep, width, ref }: EpisodeCardProps) {
  const image = useImage();
  const menu = useItemMenu();
  const state = playback(ep);
  const runtime = ep.RunTimeTicks ? formatRemaining(ticksToSeconds(ep.RunTimeTicks)) : undefined;
  const title = ep.IndexNumber === undefined ? ep.Name : `E${ep.IndexNumber} · ${ep.Name}`;
  return (
    <Pressable
      ref={ref}
      onFocus={rememberFocus}
      accessibilityRole="button"
      accessibilityLabel={[title, runtime, state.played ? 'Watched' : undefined].filter(Boolean).join(', ')}
      accessibilityHint="Plays the episode. Hold for more."
      // Watched: from the start (resuming at the credits helps no one).
      onPress={() => openPlayer(ep, state.played ? 0 : (state.resumeSeconds ?? 0))}
      {...longPressProps(() => menu(ep, episodeLine(ep), { details: true }))}
      style={({ focused }) => [styles.card, { width }, focused && focusStyles.card]}
    >
      <Artwork
        image={image(landscapeImage(ep), width)}
        aspectRatio={16 / 9}
        progress={state.progress}
        remainingSeconds={state.remainingSeconds}
        played={state.played}
      />
      <Text numberOfLines={1} style={tv.type.cardTitle}>
        {title}
      </Text>
      {runtime !== undefined && (
        <Text secondary numberOfLines={1} style={tv.type.small}>
          {runtime}
        </Text>
      )}
      {!!ep.Overview?.trim() && (
        <Text secondary numberOfLines={2} style={tv.type.small}>
          {ep.Overview}
        </Text>
      )}
    </Pressable>
  );
});

/** A season's episodes, starting at `startAt` (the next episode) when it's in this season. */
function EpisodeShelf({ seriesId, seasonId, startAt }: { seriesId: string; seasonId: string; startAt?: string }) {
  const { landscape } = useShelfCards();
  const request = episodes(seriesId, seasonId);
  const { data, error, refresh } = useFetch<ItemsResult>(request.path, { query: request.query });
  // The next episode's card, where the first swipe down lands (state: the row gets it once it mounts).
  const [startCard, setStartCard] = useState<CardHandle | null>(null);

  if (!data) {
    return error ? (
      <View style={styles.padded}>
        <Message text={loadErrorMessage(error)} retry={refresh} />
      </View>
    ) : (
      <View testID="tv-episodes-placeholder" style={[styles.placeholder, tvShelfListContent]}>
        {Array.from({ length: landscape.count }, (_, i) => (
          <View key={i} style={{ width: landscape.width }}>
            <Bone aspectRatio={16 / 9} />
          </View>
        ))}
      </View>
    );
  }
  if (data.Items.length === 0) {
    return (
      <View style={styles.padded}>
        <Message text="No episodes in this season yet." />
      </View>
    );
  }
  const start = Math.max(
    0,
    data.Items.findIndex((ep) => ep.Id === startAt),
  );
  const item = landscape.width + tv.shelf.gap;
  return (
    <TvShelf
      list={
        <FlatList
          horizontal
          testID="tv-episodes"
          showsHorizontalScrollIndicator={false}
          data={data.Items}
          keyExtractor={(ep) => ep.Id}
          initialScrollIndex={start}
          initialNumToRender={landscape.count + 2}
          getItemLayout={(_, index) => ({ length: item, offset: tv.margin + item * index, index })}
          ItemSeparatorComponent={Gap}
          contentContainerStyle={tvShelfListContent}
          renderItem={({ item: ep, index }) => (
            <TvEpisodeCard ep={ep} width={landscape.width} ref={index === start ? setStartCard : undefined} />
          )}
        />
      }
      start={startCard}
    />
  );
}

export type TvSeasonsProps = {
  seriesId: string;
  /** The seasons; undefined while they load. */
  seasons?: BaseItemDto[];
  error?: Parameters<typeof loadErrorMessage>[0];
  retry: () => void;
  /** The season shown. */
  seasonId?: string;
  onPick: (seasonId: string) => void;
  /** The next episode: its card is where the shelf starts. */
  startAt?: string;
};

export function TvSeasons({ seriesId, seasons, error, retry, seasonId, onPick, startAt }: TvSeasonsProps) {
  if (!seasons) {
    return error ? (
      <View style={styles.padded}>
        <Message text={loadErrorMessage(error)} retry={retry} />
      </View>
    ) : null;
  }
  if (seasons.length === 0) {
    return (
      <View style={styles.padded}>
        <Message text="No episodes on the server yet. Add them in Jellyfin, then come back." />
      </View>
    );
  }
  return (
    <View testID="tv-seasons">
      {/* One season: no pills, the shelf alone. */}
      {seasons.length > 1 && (
        <TvFocusRow style={styles.pills}>
          {seasons.map((s) => (
            <TvPill
              key={s.Id}
              label={s.Name}
              selected={s.Id === seasonId}
              onPress={() => onPick(s.Id)}
              onFocus={() => onPick(s.Id)}
            />
          ))}
        </TvFocusRow>
      )}
      {seasonId && (
        // key: a new season starts a new list (its own start, not the last season's scroll).
        <EpisodeShelf key={seasonId} seriesId={seriesId} seasonId={seasonId} startAt={startAt} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: tv.gap.sm / 2, paddingHorizontal: tv.margin },
  card: { gap: tv.gap.sm / 2 },
  gap: { width: tv.shelf.gap },
  padded: { paddingHorizontal: tv.margin },
  placeholder: { flexDirection: 'row', gap: tv.shelf.gap },
});
