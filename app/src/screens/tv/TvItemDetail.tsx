// SPDX-License-Identifier: GPL-3.0-or-later
// Apple TV movie / episode detail (screen drafts 07-08): the shared detail frame (`TvDetailScreen`) with the item's
// hero, then Cast & Crew, More Like This, Details + the Media card.
import { useWindowDimensions } from 'react-native';

import { MoreLikeThis } from '@/components/MoreLikeThis';
import { TvCast } from '@/components/tv/TvCast';
import { TvDetailScreen } from '@/components/tv/TvDetailScreen';
import { TvDetails } from '@/components/tv/TvDetails';
import { TvShelf } from '@/components/tv/TvShelf';
import { formatRemaining } from '@/format';
import { useImage } from '@/useImage';
import { useItemDetail, type ItemDetailProps } from '@/useItemDetail';

export function TvItemDetail({ item }: ItemDetailProps) {
  const image = useImage();
  const screenWidth = useWindowDimensions().width;
  const detail = useItemDetail(item);
  const { view, progress, remainingSeconds } = detail;
  const started = progress !== undefined;
  const left = started ? `${formatRemaining(remainingSeconds)} left` : undefined;
  const label = started ? 'Resume' : 'Play';
  return (
    <TvDetailScreen
      art={view.art && image(view.art, screenWidth)}
      eyebrow={detail.parent?.name}
      title={item.Name}
      subtitle={view.subtitle}
      overview={view.overview}
      facts={view.facts}
      badges={view.badges}
      credits={view.credits}
      play={{
        label,
        accessibilityLabel: [label, left].filter(Boolean).join(', '),
        progress,
        trailing: left,
        onPress: detail.play,
      }}
      onStartOver={detail.startOver}
      played={detail.played}
      favourite={detail.favourite}
      onMark={detail.mark}
    >
      <TvCast people={view.people} />
      <MoreLikeThis id={item.Id} Shelf={TvShelf} />
      <TvDetails item={item} view={view} />
    </TvDetailScreen>
  );
}
