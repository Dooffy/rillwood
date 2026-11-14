// SPDX-License-Identifier: GPL-3.0-or-later
// Apple TV series detail (screen draft 09): the shared detail frame (`TvDetailScreen`) - the show's hero, Play / Resume
// the next episode ("S2, E5" with its progress), Watched / Favourite for the whole show - then the season pills and
// the season's episode shelf, Cast & Crew, More Like This and Details.
import { useWindowDimensions } from 'react-native';

import type { BaseItemDto } from '@/api';
import { MoreLikeThis } from '@/components/MoreLikeThis';
import { TvCast } from '@/components/tv/TvCast';
import { TvDetailScreen } from '@/components/tv/TvDetailScreen';
import { TvDetails } from '@/components/tv/TvDetails';
import { TvSeasons } from '@/components/tv/TvSeasons';
import { TvShelf } from '@/components/tv/TvShelf';
import { formatRemaining } from '@/format';
import { useImage } from '@/useImage';
import { episodePlay, useSeriesDetail } from '@/useSeriesDetail';

export function TvSeriesDetail({ series }: { series: BaseItemDto }) {
  const image = useImage();
  const screenWidth = useWindowDimensions().width;
  const detail = useSeriesDetail(series);
  const { view, target } = detail;
  const episode = target && episodePlay(target.episode);
  const left =
    episode?.progress !== undefined && episode.remainingSeconds !== undefined
      ? `${formatRemaining(episode.remainingSeconds)} left`
      : undefined;
  const verb = target?.resume ? 'Resume' : 'Play';

  return (
    <TvDetailScreen
      art={view.art && image(view.art, screenWidth)}
      title={series.Name}
      subtitle={view.subtitle}
      overview={view.overview}
      facts={view.facts}
      badges={view.badges}
      credits={view.credits}
      play={{
        // "S2, E5" once the episode is known; Play until then.
        label: episode?.label ?? 'Play',
        accessibilityLabel: [episode ? `${verb} ${episode.spokenLabel}` : 'Play', left].filter(Boolean).join(', '),
        progress: episode?.progress,
        trailing: left,
        onPress: detail.play,
      }}
      onStartOver={detail.startOver}
      played={detail.played}
      favourite={detail.favourite}
      onMark={detail.mark}
    >
      <TvSeasons
        seriesId={series.Id}
        seasons={detail.list}
        error={detail.seasonList.error}
        retry={detail.seasonList.refresh}
        seasonId={detail.seasonId}
        onPick={detail.pickSeason}
        startAt={detail.nextEpisode?.Id}
      />
      <TvCast people={view.people} />
      <MoreLikeThis id={series.Id} Shelf={TvShelf} />
      <TvDetails item={series} view={view} />
    </TvDetailScreen>
  );
}
