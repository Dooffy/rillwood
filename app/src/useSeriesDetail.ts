// SPDX-License-Identifier: GPL-3.0-or-later
// Series detail for both views (`PhoneSeriesDetail`, `TvSeriesDetail`): the seasons, Next Up, the season shown (picked,
// else Next Up's, else the first), what Play plays, and the show's watched / favourite. Data rules: docs/context/api.md
// (Series data).
import { useMemo, useState } from 'react';

import type { BaseItemDto, ItemsResult } from '@/api';
import { detailView } from '@/detail';
import {
  defaultSeasonId,
  episodes,
  playback,
  realSeasons,
  seasons,
  seriesNextUp,
  seriesPlayTarget,
  type UserFlag,
} from '@/items';
import { openPlayer } from '@/navigation';
import { useFetch } from '@/useFetch';
import { useUserFlag } from '@/useUserFlag';

/** The play capsule for an episode: "S1, E4" (read as "Season 1, Episode 4") with its progress when started. */
export function episodePlay(episode: BaseItemDto) {
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

/**
 * What Play plays for the series: the Next Up episode, else the first of the season shown - once Next Up settled. Reads
 * the same episode list as the season's cards (one shared request).
 */
export function useSeriesPlayTarget(
  seriesId: string,
  seasonId: string | undefined,
  next: BaseItemDto | undefined,
  nextSettled: boolean,
) {
  const request = seasonId ? episodes(seriesId, seasonId) : undefined;
  const { data } = useFetch<ItemsResult>(request?.path ?? null, { query: request?.query });
  return nextSettled ? seriesPlayTarget(next, data?.Items) : undefined;
}

export type SeriesDetailState = ReturnType<typeof useSeriesDetail>;

export function useSeriesDetail(series: BaseItemDto) {
  const mark = useUserFlag();
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
  const target = useSeriesPlayTarget(series.Id, seasonId, nextEpisode, nextSettled);

  return {
    view,
    seasonList,
    list,
    nextEpisode,
    nextSettled,
    seasonId,
    season,
    pickSeason: setPicked,
    download,
    /** The episode Play plays, where it starts, and whether it's started. */
    target,
    play: target ? () => openPlayer(target.episode, target.start) : undefined,
    startOver: target?.resume ? () => openPlayer(target.episode, 0) : undefined,
    played: series.UserData?.Played === true,
    favourite: series.UserData?.IsFavorite === true,
    /** ✓ / ♥ for the whole show. */
    mark: (flag: UserFlag, value: boolean) => mark(series, flag, value),
    /** A season's ⋯ / long press: mark that season. */
    markItem: mark,
  };
}
