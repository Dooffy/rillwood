// SPDX-License-Identifier: GPL-3.0-or-later
// Movie / episode detail on phones and tablets: hero, Play + watched / favourite, overview, chips, media rows, cast &
// crew, More Like This, Details. Header ↓ downloads it (docs/context/downloads.md).
import { useRef } from 'react';
import { ScrollView, StyleSheet, View, type ScrollViewInstance } from 'react-native';

import { CastRow } from '@/components/CastRow';
import { Chips } from '@/components/Chips';
import { Credits } from '@/components/Credits';
import { DetailActions } from '@/components/DetailActions';
import { DetailHeader } from '@/components/DetailHeader';
import { DetailHero, LOGO_WIDTH, useHeroLayout } from '@/components/DetailHero';
import { DetailsSection } from '@/components/DetailsSection';
import { MoreLikeThis } from '@/components/MoreLikeThis';
import { Overview } from '@/components/Overview';
import { Text } from '@/components/Text';
import { scrollList, spacing } from '@/theme';
import { useImage } from '@/useImage';
import { useItemDetail, type ItemDetailProps } from '@/useItemDetail';

export function PhoneItemDetail({ item, saved }: ItemDetailProps) {
  const image = useImage();
  const hero = useHeroLayout();
  const detail = useItemDetail(item);
  const { view } = detail;
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
          parent={detail.parent && { name: detail.parent.name, onPress: detail.parent.open }}
          side={<Credits credits={view.credits} />}
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
              play={{ progress: detail.progress, remainingSeconds: detail.remainingSeconds }}
              onPlay={detail.play}
              onStartOver={detail.startOver}
              played={detail.played}
              favourite={detail.favourite}
              onMark={detail.mark}
            />
          </View>
        </DetailHero>

        <View style={styles.body}>
          {saved && <Text secondary>Showing the details saved with the download.</Text>}
          {!hero.wide && (
            <>
              {view.overview && <Overview text={view.overview} onMore={toDetails} />}
              <Chips items={view.badges} />
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
