// SPDX-License-Identifier: GPL-3.0-or-later
// Movie / episode detail: hero, Play + watched / favourite, overview, chips, Directed by, media rows, cast & crew,
// More Like This. Data rules: docs/context/api.md (Detail). Header ↓ downloads it (docs/context/downloads.md).
// Offline (or the server failing) with a download of it: the item saved with the download instead of an error.
import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { useOffline, type BaseItemDto } from '@/api';
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
import { DetailPlaceholder } from '@/components/Skeleton';
import { Text } from '@/components/Text';
import { detailView } from '@/detail';
import { savedItem, type SavedItem } from '@/downloads';
import { formatRemaining } from '@/format';
import { isItemId, itemDetail, type TrackRow } from '@/items';
import { openItem, openPlayer } from '@/navigation';
import { useSession } from '@/session';
import { useFetch } from '@/useFetch';
import { useImage } from '@/useImage';
import { useUserFlag } from '@/useUserFlag';
import { scrollList, spacing } from '@/theme';

export default function ItemDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const valid = isItemId(id);
  const { data, error, refresh } = useFetch<BaseItemDto>(valid ? itemDetail(id).path : null);
  const accountId = useSession().active?.id;
  // Known offline: shown at once, not after the 8 s timeout; the server's answer replaces it if one lands.
  const offline = useOffline();
  const saved = useMemo(() => (valid && accountId ? savedItem(accountId, id) : null), [valid, accountId, id]);

  if (!valid) return <Message fill text="This item isn't available." />;
  if (data) return <Detail item={data} />;
  // Any failure, a 404 too: the file on the phone still plays.
  if (saved && (error || offline)) return <Detail item={saved.item} saved={saved} />;
  if (error?.status === 404) return <Message fill text="This item isn't available." />;
  if (error) return <Message fill text={loadErrorMessage(error)} retry={refresh} />;
  return <DetailPlaceholder />;
}

/** `saved`: the copy saved with a download - its own art, nothing more from the server (no logo, More Like This). */
function Detail({ item, saved }: { item: BaseItemDto; saved?: SavedItem }) {
  const image = useImage();
  const mark = useUserFlag();
  const { width } = useWindowDimensions();
  const view = detailView(item);
  const { progress, resumeSeconds = 0, remainingSeconds = 0, played } = view.playback;
  const inProgress = progress !== undefined;
  // undefined at 0 (position at or past the runtime): no bare "left".
  const left = formatRemaining(remainingSeconds);
  const { SeriesId: seriesId, SeriesName: seriesName } = item;

  return (
    <>
      <DetailHeader download={item} />
      {/* The hero runs under the transparent header (back + download over the art). */}
      <ScrollView {...scrollList} contentInsetAdjustmentBehavior="never" contentContainerStyle={styles.scroll}>
        <DetailHero
          art={saved ? saved.art : image(view.art, width * HERO_ART_SCALE)}
          logo={saved ? undefined : image(view.logo, LOGO_WIDTH)}
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
          {saved && <Text secondary>Showing the details saved with the download.</Text>}
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
            favourite={item.UserData?.IsFavorite === true}
            onMark={(flag, value) => mark(item, flag, value)}
          />

          {item.Overview?.trim() ? <Overview text={item.Overview.trim()} /> : null}

          <Chips items={view.chips} />
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
        {!saved && <MoreLikeThis id={item.Id} />}
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
