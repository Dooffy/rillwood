// SPDX-License-Identifier: GPL-3.0-or-later
// Series detail (Apple TV style): hero, Play / Resume the next episode + watched / favourite, next-episode line,
// overview, chips, "Season n ⌃⌄" menu, horizontal episode cards (▶ + ⋯ / long press), cast & crew, More Like This.
// The header ↓ downloads the selected season. ✓ / ♥ mark the whole show; the season menu marks a season. Data rules:
// docs/context/api.md (Series data), downloads: docs/context/downloads.md.
import { router, useLocalSearchParams } from 'expo-router';
import { memo, useMemo, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import type { BaseItemDto, ItemsResult } from '@/api';
import { Button } from '@/components/Button';
import { CastRow } from '@/components/CastRow';
import { Chips } from '@/components/Chips';
import { Credits } from '@/components/Credits';
import { DetailActions } from '@/components/DetailActions';
import { DetailHeader } from '@/components/DetailHeader';
import { DetailsSection } from '@/components/DetailsSection';
import { DetailHero, LOGO_WIDTH, useHeroLayout } from '@/components/DetailHero';
import { EpisodeCard, useEpisodeCardWidth, WIDE_EPISODE_CARD_WIDTH } from '@/components/EpisodeCard';
import { useItemMenu } from '@/components/ItemMenu';
import { LoadError, loadErrorMessage, Message } from '@/components/Message';
import { MoreLikeThis } from '@/components/MoreLikeThis';
import { Overview } from '@/components/Overview';
import { SeasonPills } from '@/components/SeasonPills';
import { CARD_GAP } from '@/components/Row';
import { DetailPlaceholder, EpisodeCardsPlaceholder } from '@/components/Skeleton';
import { Text } from '@/components/Text';
import { detailView } from '@/detail';
import type { SavedItem } from '@/downloads';
import {
  defaultSeasonId,
  episodeLine,
  episodes,
  isItemId,
  landscapeImage,
  playback,
  realSeasons,
  seasons,
  seriesNextUp,
  seriesPlayTarget,
  ticksToSeconds,
} from '@/items';
import { openItem, openPlayer } from '@/navigation';
import { useFetch } from '@/useFetch';
import { useImage } from '@/useImage';
import { useItem } from '@/useItem';
import { useUserFlag } from '@/useUserFlag';
import { scrollList, spacing } from '@/theme';

export default function SeriesDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  // Offline or failed with episodes of it downloaded: the show's name + poster, and its downloaded episodes.
  const { item, saved, fromSaved, error, refresh } = useItem(id);

  if (fromSaved && saved) return <SavedSeries saved={saved} />;
  if (item) return <Series series={item} />;
  if (!isItemId(id) || error?.status === 404) return <Message fill text="This series isn't available." />;
  if (error) return <LoadError fill header error={error} retry={refresh} />;
  return <DetailPlaceholder />;
}

/** A show from its downloads (no seasons, cast or Next Up without the server): opens its downloaded episodes. */
function SavedSeries({ saved: { item, art } }: { saved: SavedItem }) {
  const openEpisodes = () =>
    router.push({ pathname: '/show-downloads/[id]', params: { id: item.Id, name: item.Name } });
  return (
    <ScrollView {...scrollList} contentInsetAdjustmentBehavior="never" contentContainerStyle={styles.scroll}>
      <DetailHero art={art} title={item.Name} subtitle="" />
      <View style={styles.body}>
        <Text secondary>Showing the details saved with the download.</Text>
        <Button title="Downloaded Episodes" onPress={openEpisodes} />
      </View>
    </ScrollView>
  );
}

function Series({ series }: { series: BaseItemDto }) {
  const image = useImage();
  const mark = useUserFlag();
  const hero = useHeroLayout();
  const nextRequest = seriesNextUp(series.Id);
  const seasonList = useFetch<ItemsResult>(seasons(series.Id).path);
  const next = useFetch<ItemsResult>(nextRequest.path, { query: nextRequest.query });
  const [picked, setPicked] = useState<string>();

  const list = seasonList.data?.Items;
  const nextEpisode = next.data?.Items[0];
  // Wait for Next Up (or its failure) before opening a season, so the list doesn't jump to another one.
  // Not loading counts too: a request that never starts (no account) mustn't keep the episode placeholders up.
  const nextSettled = next.data !== undefined || next.error !== undefined || !next.loading;
  const seasonId = picked ?? (list && nextSettled ? defaultSeasonId(list, nextEpisode) : undefined);
  const season = list?.find((s) => s.Id === seasonId);
  // Its episodes are looked up by series + season: the screen's series id when the season lacks one.
  const download = useMemo(() => season && { ...season, SeriesId: season.SeriesId ?? series.Id }, [season, series.Id]);
  const view = detailView(series, new Date(), list ? realSeasons(list).length : undefined);

  return (
    <>
      <DetailHeader download={download} label={season && `Download ${season.Name}`} />
      {/* The hero runs under the transparent header (back + download over the art). */}
      <ScrollView {...scrollList} contentInsetAdjustmentBehavior="never" contentContainerStyle={styles.scroll}>
        <DetailHero
          art={image(view.art, hero.artWidth)}
          logo={image(view.logo, LOGO_WIDTH)}
          title={series.Name}
          subtitle={view.subtitle}
          side={<Credits credits={view.credits} />}
        >
          {/* As the movie hero: wide screens show the summary and badges on the art, phones under it. */}
          {hero.wide && view.overview && <Overview text={view.overview} lines={2} />}
          {view.facts.length > 0 && (
            <Text variant="caption" secondary style={!hero.wide && styles.center}>
              {view.facts.join(' · ')}
            </Text>
          )}
          {hero.wide && <Chips items={view.badges} />}
          <View style={styles.actions}>
            <SeriesPlay
              series={series}
              seasonId={seasonId}
              next={nextEpisode}
              nextSettled={nextSettled}
              center={!hero.wide}
            />
          </View>
        </DetailHero>
        {!hero.wide && (
          <View style={styles.body}>
            {view.overview && <Overview text={view.overview} />}
            <Chips items={view.badges} />
          </View>
        )}

        <View style={styles.section}>
          {list === undefined ? (
            seasonList.error ? (
              <View style={styles.body}>
                <Message text={loadErrorMessage(seasonList.error)} retry={seasonList.refresh} />
              </View>
            ) : (
              <EpisodeCardsPlaceholder />
            )
          ) : list.length === 0 ? (
            <View style={styles.body}>
              <Message text="No episodes on the server yet. Add them in Jellyfin, then come back." />
            </View>
          ) : (
            <>
              <View style={styles.body}>
                <SeasonPills seasons={list} value={seasonId} download={download} onChange={setPicked} onMark={mark} />
              </View>
              {seasonId ? (
                // key: a new season starts a new list (its own start position, not the last season's scroll).
                <EpisodeCards key={seasonId} seriesId={series.Id} seasonId={seasonId} startAt={nextEpisode?.Id} />
              ) : (
                // Waiting for Next Up to pick the season to open.
                <EpisodeCardsPlaceholder />
              )}
            </>
          )}
        </View>

        <CastRow people={view.people} />
        <MoreLikeThis id={series.Id} />
        <DetailsSection item={series} view={view} />
      </ScrollView>
    </>
  );
}

/**
 * Play / Resume for the series (the next-up episode, else the first of the season shown) and the line naming it:
 * "S2, E3 · Title: overview". Reads the same episode list as the cards (one shared request).
 */
function SeriesPlay({
  series,
  seasonId,
  next,
  nextSettled,
  center = false,
}: {
  series: BaseItemDto;
  seasonId?: string;
  next?: BaseItemDto;
  nextSettled: boolean;
  /** Phones: the line under the buttons centred, as the hero text above it. */
  center?: boolean;
}) {
  const mark = useUserFlag();
  const request = seasonId ? episodes(series.Id, seasonId) : undefined;
  const { data } = useFetch<ItemsResult>(request?.path ?? null, { query: request?.query });
  const target = nextSettled ? seriesPlayTarget(next, data?.Items) : undefined;
  return (
    <>
      <DetailActions
        play={target ? episodePlay(target.episode) : { label: 'Episode' }}
        onPlay={target ? () => openPlayer(target.episode, target.start) : undefined}
        onStartOver={target?.resume ? () => openPlayer(target.episode, 0) : undefined}
        played={series.UserData?.Played === true}
        favourite={series.UserData?.IsFavorite === true}
        onMark={(flag, value) => mark(series, flag, value)}
      />
      {target && (
        // The capsule names the episode ("S2, E3"): the line has its title and overview.
        <Text numberOfLines={2} style={center && styles.center}>
          <Text variant="label">{target.episode.Name}</Text>
          {target.episode.Overview ? <Text secondary>{`: ${target.episode.Overview}`}</Text> : null}
        </Text>
      )}
    </>
  );
}

/** The play capsule for an episode: "S1, E4" (read as "Season 1, Episode 4") with its progress when started. */
function episodePlay(episode: BaseItemDto) {
  const { ParentIndexNumber: season, IndexNumber: number } = episode;
  const { progress, remainingSeconds } = playback(episode);
  const label = number === undefined ? 'Episode' : season === undefined ? `E${number}` : `S${season}, E${number}`;
  const spokenLabel =
    number === undefined
      ? 'Episode'
      : season === undefined
        ? `Episode ${number}`
        : `Season ${season}, Episode ${number}`;
  return { label, spokenLabel, progress, remainingSeconds };
}

/** One season's episodes as horizontal cards, scrolled to the next episode; ⋯ / long press open its actions. */
function EpisodeCards({ seriesId, seasonId, startAt }: { seriesId: string; seasonId: string; startAt?: string }) {
  const { width } = useWindowDimensions();
  const cardWidth = useEpisodeCardWidth();
  const request = episodes(seriesId, seasonId);
  const { data, error, refresh } = useFetch<ItemsResult>(request.path, { query: request.query });

  if (!data) {
    return error ? (
      <View style={styles.body}>
        <Message text={loadErrorMessage(error)} retry={refresh} />
      </View>
    ) : (
      <EpisodeCardsPlaceholder />
    );
  }
  if (data.Items.length === 0) {
    return (
      <View style={styles.body}>
        <Message text="No episodes in this season yet." />
      </View>
    );
  }

  // Start at the next episode, but never past the last screenful of cards (no blank space after the last one).
  const visible = Math.max(1, Math.floor(width / (cardWidth + CARD_GAP)));
  const start = Math.min(
    Math.max(
      0,
      data.Items.findIndex((ep) => ep.Id === startAt),
    ),
    Math.max(0, data.Items.length - visible),
  );
  // No episode has an overview (common on sparse metadata): compact cards, no empty reserved lines.
  const withOverviews = data.Items.some((ep) => !!ep.Overview?.trim());
  return (
    <FlatList
      horizontal
      data={data.Items}
      keyExtractor={(ep) => ep.Id}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.cards}
      ItemSeparatorComponent={CardGap}
      initialScrollIndex={start}
      // About two cards fit on a phone: render a few, not the default 10.
      initialNumToRender={3}
      windowSize={5}
      getItemLayout={(_, index) => ({
        length: cardWidth + CARD_GAP,
        offset: (cardWidth + CARD_GAP) * index,
        index,
      })}
      renderItem={({ item: ep }) => <SeasonEpisode ep={ep} withOverviews={withOverviews} />}
    />
  );
}

/** One episode card, memoised on the episode: the season list re-rendering doesn't redraw every card. */
const SeasonEpisode = memo(function SeasonEpisode({ ep, withOverviews }: { ep: BaseItemDto; withOverviews: boolean }) {
  const image = useImage();
  const menu = useItemMenu();
  const state = playback(ep);
  return (
    <EpisodeCard
      episode={ep.IndexNumber}
      title={ep.Name}
      overview={ep.Overview}
      image={image(landscapeImage(ep), WIDE_EPISODE_CARD_WIDTH)}
      progress={state.progress}
      remainingSeconds={state.remainingSeconds}
      runtimeSeconds={ep.RunTimeTicks ? ticksToSeconds(ep.RunTimeTicks) : undefined}
      played={state.played}
      favourite={ep.UserData?.IsFavorite === true}
      overviewLines={withOverviews}
      onPress={() => openItem(ep)}
      onPlay={() => openPlayer(ep, state.resumeSeconds ?? 0)}
      onMore={() => menu(ep, episodeLine(ep))}
    />
  );
});

function CardGap() {
  return <View style={styles.gap} />;
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.lg, gap: spacing.lg },
  body: { paddingHorizontal: spacing.md, gap: spacing.md },
  center: { textAlign: 'center' },
  // The play row runs the hero's width on phones, as wide as its buttons on wide screens.
  actions: { alignSelf: 'stretch', paddingTop: spacing.xs, gap: spacing.sm },
  section: { gap: spacing.xs },
  cards: { paddingHorizontal: spacing.md },
  gap: { width: CARD_GAP },
});
