// SPDX-License-Identifier: GPL-3.0-or-later
// Movie / episode detail: hero, Play + watched / favourite, overview, chips, Directed by, media rows, cast & crew,
// More Like This. Data rules: docs/context/api.md (Detail). Header ↓ downloads it (docs/context/downloads.md).
// Offline (or the server failing) with a download of it: the item saved with the download instead of an error.
import { useLocalSearchParams } from 'expo-router';
import { useRef } from 'react';
import { ScrollView, StyleSheet, View, type ScrollViewInstance } from 'react-native';

import type { BaseItemDto } from '@/api';
import { CastRow } from '@/components/CastRow';
import { Chips } from '@/components/Chips';
import { Credits } from '@/components/Credits';
import { DetailActions } from '@/components/DetailActions';
import { DetailHeader } from '@/components/DetailHeader';
import { DetailHero, LOGO_WIDTH, useHeroLayout } from '@/components/DetailHero';
import { DetailsSection } from '@/components/DetailsSection';
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
  // More (hero summary) scrolls to Details, which has the whole text.
  const scroll = useRef<ScrollViewInstance>(null);
  const detailsY = useRef(0);
  const toDetails = () => scroll.current?.scrollTo({ y: detailsY.current - spacing.md, animated: true });

  return (
    <>
      <DetailHeader download={item} />
      {/* The hero runs under the transparent header (back + download over the art). */}
      <ScrollView
        ref={scroll}
        {...scrollList}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={styles.scroll}
      >
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
          side={<Credits credits={view.credits} layout="column" />}
        >
          {/* Wide screens: the summary and badges on the art too; phones show them under it. */}
          {hero.wide && view.overview && <Overview text={view.overview} lines={2} onMore={toDetails} />}
          {view.facts.length > 0 && (
            <Text variant="caption" secondary style={!hero.wide && styles.center}>
              {view.facts.join(' · ')}
            </Text>
          )}
          {hero.wide && <Chips items={view.badges} />}
          <View style={styles.actions}>
            <DetailActions
              play={{ progress, remainingSeconds }}
              onPlay={() => openPlayer(item, resumeSeconds)}
              onStartOver={inProgress ? () => openPlayer(item, 0) : undefined}
              played={played}
              favourite={item.UserData?.IsFavorite === true}
              onMark={(flag, value) => mark(item, flag, value)}
            />
          </View>
        </DetailHero>

        <View style={styles.body}>
          {saved && <Text secondary>Showing the details saved with the download.</Text>}
          {!hero.wide && (
            <>
              {view.overview && <Overview text={view.overview} onMore={toDetails} />}
              <Chips items={view.badges} />
              <Credits credits={view.credits} layout="inline" />
            </>
          )}
        </View>

        <CastRow people={view.people} />
        {!saved && <MoreLikeThis id={item.Id} />}
        <DetailsSection item={item} view={view} onLayout={(e) => (detailsY.current = e.nativeEvent.layout.y)} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.lg, gap: spacing.lg },
  body: { paddingHorizontal: spacing.md, gap: spacing.md },
  center: { textAlign: 'center' },
  // The play row runs the hero's width on phones (centred text above it), as wide as its buttons on wide screens.
  actions: { alignSelf: 'stretch', paddingTop: spacing.xs },
});
