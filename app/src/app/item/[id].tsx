// SPDX-License-Identifier: GPL-3.0-or-later
// Movie / episode detail: hero, Play + watched / favourite, overview, chips, Directed by, media rows, cast & crew,
// More Like This. Data rules: docs/context/api.md (Detail). Header ↓ downloads it (docs/context/downloads.md).
// Offline (or the server failing) with a download of it: the item saved with the download instead of an error.
import { useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import type { BaseItemDto } from '@/api';
import { CastRow } from '@/components/CastRow';
import { Chips } from '@/components/Chips';
import { DetailActions } from '@/components/DetailActions';
import { DetailHeader } from '@/components/DetailHeader';
import { DetailHero, LOGO_WIDTH, useHeroLayout } from '@/components/DetailHero';
import { ListRow, ListSection } from '@/components/List';
import { MediaRow } from '@/components/MediaRow';
import { LoadError, Message } from '@/components/Message';
import { MoreLikeThis } from '@/components/MoreLikeThis';
import { Overview } from '@/components/Overview';
import { DetailPlaceholder } from '@/components/Skeleton';
import { Text } from '@/components/Text';
import { detailView } from '@/detail';
import type { SavedItem } from '@/downloads';
import { isItemId } from '@/items';
import { openItem, openPlayer } from '@/navigation';
import { useImage } from '@/useImage';
import { useItem } from '@/useItem';
import { useUserFlag } from '@/useUserFlag';
import { scrollList, spacing } from '@/theme';

export default function ItemDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  // Offline or failed (a 404 too - the file on the phone still plays): the item saved with its download.
  const { item, saved, fromSaved, error, refresh } = useItem(id);

  if (item) return <Detail item={item} saved={fromSaved ? saved : null} />;
  if (!isItemId(id) || error?.status === 404) return <Message fill text="This item isn't available." />;
  if (error) return <LoadError fill header error={error} retry={refresh} />;
  return <DetailPlaceholder />;
}

/** `saved`: the copy saved with a download - its own art, nothing more from the server (no logo, More Like This). */
function Detail({ item, saved }: { item: BaseItemDto; saved: SavedItem | null }) {
  const image = useImage();
  const mark = useUserFlag();
  const hero = useHeroLayout();
  const view = detailView(item);
  const { progress, resumeSeconds = 0, remainingSeconds = 0, played } = view.playback;
  const inProgress = progress !== undefined;
  const { SeriesId: seriesId, SeriesName: seriesName } = item;

  return (
    <>
      <DetailHeader download={item} />
      {/* The hero runs under the transparent header (back + download over the art). */}
      <ScrollView {...scrollList} contentInsetAdjustmentBehavior="never" contentContainerStyle={styles.scroll}>
        <DetailHero
          art={saved ? saved.art : image(view.art, hero.artWidth)}
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
          <DetailActions
            play={{ progress, remainingSeconds }}
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
              {view.media.video && <MediaRow label="Video" row={view.media.video} />}
              {view.media.audio && <MediaRow label="Audio" row={view.media.audio} />}
              {view.media.subtitles && <MediaRow label="Subtitles" row={view.media.subtitles} />}
            </ListSection>
          )}
        </View>

        <CastRow people={view.people} />
        {!saved && <MoreLikeThis id={item.Id} />}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.lg, gap: spacing.lg },
  body: { paddingHorizontal: spacing.md, gap: spacing.md },
});
