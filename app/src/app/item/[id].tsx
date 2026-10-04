// SPDX-License-Identifier: GPL-3.0-or-later
// Movie / episode detail: hero, Play + watched / favourite, overview, chips, Directed by, media rows, cast & crew,
// More Like This. Data rules: docs/context/api.md (Detail). Playback lands in M4; watched, favourite and download
// are placeholders for now.
import { useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import type { BaseItemDto } from '@/api';
import { CastRow } from '@/components/CastRow';
import { Chips } from '@/components/Chips';
import { DetailActions } from '@/components/DetailActions';
import { DetailHeader } from '@/components/DetailHeader';
import { DetailHero, HERO_ART_SCALE, LOGO_WIDTH } from '@/components/DetailHero';
import { ListRow, ListSection } from '@/components/List';
import { loadErrorMessage, Message } from '@/components/Message';
import { MoreLikeThis } from '@/components/MoreLikeThis';
import { Overview } from '@/components/Overview';
import { ProgressBar } from '@/components/ProgressBar';
import { Spinner } from '@/components/Spinner';
import { Text } from '@/components/Text';
import { detailView } from '@/detail';
import { formatRemaining } from '@/format';
import { isItemId, itemDetail, type TrackRow } from '@/items';
import { openItem, openPlayer } from '@/navigation';
import { useFetch } from '@/useFetch';
import { useImage } from '@/useImage';
import { spacing } from '@/theme';

export default function ItemDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const valid = isItemId(id);
  const { data, error, refresh } = useFetch<BaseItemDto>(valid ? itemDetail(id).path : null);

  if (!valid || error?.status === 404) return <Message fill text="This item isn't available." />;
  if (data) return <Detail item={data} />;
  if (error) return <Message fill text={loadErrorMessage(error)} retry={refresh} />;
  return <Spinner fill />;
}

function Detail({ item }: { item: BaseItemDto }) {
  const image = useImage();
  const { width } = useWindowDimensions();
  const view = detailView(item);
  const { progress, resumeSeconds = 0, remainingSeconds = 0, played } = view.playback;
  const inProgress = progress !== undefined;
  // undefined at 0 (position at or past the runtime): no bare "left".
  const left = formatRemaining(remainingSeconds);
  const { SeriesId: seriesId, SeriesName: seriesName } = item;

  return (
    <>
      <DetailHeader />
      {/* The hero runs under the transparent header (back + download over the art). */}
      <ScrollView contentInsetAdjustmentBehavior="never" contentContainerStyle={styles.scroll}>
        <DetailHero
          art={image(view.art, width * HERO_ART_SCALE)}
          logo={image(view.logo, LOGO_WIDTH)}
          title={item.Name}
          subtitle={view.subtitle}
          parent={
            item.Type === 'Episode' && seriesId
              ? {
                  name: seriesName ?? 'Series',
                  onPress: () => openItem({ Id: seriesId, Name: seriesName ?? '', Type: 'Series' }),
                }
              : undefined
          }
        />

        <View style={styles.body}>
          {inProgress && (
            <View style={styles.progress}>
              <View style={styles.bar}>
                <ProgressBar progress={progress} />
              </View>
              {left && (
                <Text variant="caption" secondary>
                  {left} left
                </Text>
              )}
            </View>
          )}

          <DetailActions
            playTitle={inProgress ? 'Resume' : 'Play'}
            onPlay={() => openPlayer(item, resumeSeconds)}
            onStartOver={inProgress ? () => openPlayer(item, 0) : undefined}
            played={played}
          />

          {item.Overview?.trim() ? <Overview text={item.Overview.trim()} /> : null}

          <Chips items={view.chips} />
          {played && (
            <Text variant="caption" secondary>
              ✓ Watched
            </Text>
          )}
          {view.directors.length > 0 && (
            <Text secondary>
              Directed by <Text>{view.directors.join(', ')}</Text>
            </Text>
          )}

          {(view.media.video || view.media.audio || view.media.subtitles) && (
            <ListSection title="Media">
              {view.versions && <ListRow label={`Version (${view.versions.count})`} value={view.versions.name} />}
              {view.media.video && <TrackListRow label="Video" row={view.media.video} />}
              {view.media.audio && <TrackListRow label="Audio" row={view.media.audio} />}
              {view.media.subtitles && <TrackListRow label="Subtitles" row={view.media.subtitles} />}
            </ListSection>
          )}
        </View>

        <CastRow people={view.people} />
        <MoreLikeThis id={item.Id} />
      </ScrollView>
    </>
  );
}

/** "Audio (2)  English - Dolby Digital - 5.1" - what plays by default; picking a track comes with the player. */
function TrackListRow({ label, row }: { label: string; row: TrackRow }) {
  return <ListRow label={row.count > 1 ? `${label} (${row.count})` : label} value={row.value} />;
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.lg, gap: spacing.lg },
  body: { paddingHorizontal: spacing.md, gap: spacing.md },
  progress: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  bar: { flex: 1 },
});
