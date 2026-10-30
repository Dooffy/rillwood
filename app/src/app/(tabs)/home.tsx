// SPDX-License-Identifier: GPL-3.0-or-later
// Home: Up Next hero, Continue Watching, Next Up, Recently Added per library (docs/context/api.md, Home data).
import { router } from 'expo-router';
import { memo, useCallback, useEffect, useState, type ReactNode } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { ApiError, isConnectionError, type BaseItemDto, type ItemsResult } from '@/api';
import { Avatar } from '@/components/Avatar';
import {
  CardPlaceholder,
  LANDSCAPE_WIDTH,
  LandscapeCard,
  POSTER_WIDTH,
  PosterCard,
  WIDE_LANDSCAPE_WIDTH,
  WIDE_POSTER_WIDTH,
} from '@/components/Card';
import { Hero, HERO_SIDE_ART, HERO_SIDE_SHARE, useHeroAspect } from '@/components/Hero';
import { useItemMenu } from '@/components/ItemMenu';
import { LoadError, loadErrorMessage, Message, Offline, useHeldOffline } from '@/components/Message';
import { fitCards, Row } from '@/components/Row';
import { Screen } from '@/components/Screen';
import { CardRowPlaceholder } from '@/components/Skeleton';
import { useTabContentWidth } from '@/components/TabsSidebar';
import {
  backdropImage,
  cardTitles,
  continueWatching,
  homeLayout,
  homePaths,
  landscapeImage,
  latest,
  nextUp,
  playback,
  posterImage,
  recentlyAdded,
  userViews,
} from '@/items';
import { openItem } from '@/navigation';
import { useSession } from '@/session';
import { invalidate, useFetch } from '@/useFetch';
import { useImage } from '@/useImage';
import { usePullToRefresh } from '@/usePullToRefresh';
import { minTouch, pressedOpacity, spacing, tabList, useColors, useWide, useWideLandscape } from '@/theme';

/** Cards in a row: their width, and how many placeholders fill the row while it loads. */
type CardSize = { count: number; width: number };

/** Phones: the default sizes, the next card peeking in. */
const PHONE_POSTERS: CardSize = { count: 3, width: POSTER_WIDTH };
const PHONE_LANDSCAPE: CardSize = { count: 3, width: LANDSCAPE_WIDTH };

/** Pull to refresh / Retry: refetch every Home row, failed ones too. */
function refreshHome() {
  homePaths.forEach((path) => invalidate(path));
}

export default function Home() {
  const { active } = useSession();
  const c = useColors();
  const image = useImage();
  const menu = useItemMenu();
  const rowWidth = useTabContentWidth() - 2 * spacing.md;
  // Tablet landscape: the hero (and its placeholder) shares the row with its text.
  const beside = useWideLandscape();
  const heroAspect = useHeroAspect();
  // The hero image at the width it's drawn: the row, or its share beside the text.
  const heroWidth = Math.round(beside ? rowWidth * HERO_SIDE_SHARE : rowWidth);
  // Tablets: whole cards across the row, so it never ends in a gap.
  const wide = useWide();
  const posters = wide ? fitCards(rowWidth, WIDE_POSTER_WIDTH) : PHONE_POSTERS;
  const cards = wide ? fitCards(rowWidth, WIDE_LANDSCAPE_WIDTH) : PHONE_LANDSCAPE;
  const views = useFetch<ItemsResult>(userViews.path, { query: userViews.query });
  const resume = useFetch<ItemsResult>(continueWatching.path, { query: continueWatching.query });
  const next = useFetch<ItemsResult>(nextUp.path, { query: nextUp.query });

  // Items per library once its Recently Added row loaded (for the empty message), per account.
  const [latestCounts, setLatestCounts] = useState<Record<string, number>>({});
  const countKey = (libraryId: string) => `${active?.id}|${libraryId}`;
  const onLatestCount = useCallback(
    (key: string, count: number) =>
      setLatestCounts((counts) => (counts[key] === count ? counts : { ...counts, [key]: count })),
    [],
  );

  // Pull to refresh: the spinner stays until the top rows answered.
  const loading = views.loading || resume.loading || next.loading;
  const { refreshing, onRefresh } = usePullToRefresh(loading, refreshHome);

  const layout = homeLayout(
    views,
    resume,
    next,
    Object.fromEntries((views.data?.Items ?? []).map((v) => [v.Id, latestCounts[countKey(v.Id)]])),
  );
  const { hero } = layout;
  // Out of reach: Continue Watching and Next Up both failed for lack of a connection. Nothing else loaded (no library
  // list) → the card alone; else the card on top of what did load (a cached Recently Added row).
  const offline = useHeldOffline(
    [resume, next].every((r) => !r.data && isConnectionError(r.error)),
    loading,
  );
  const alone = offline.offline && !views.data;

  const landscape = (item: BaseItemDto) => (
    <LandscapeCard
      key={item.Id}
      {...cardTitles(item)}
      {...playback(item)}
      width={cards.width}
      image={image(landscapeImage(item), cards.width)}
      item={item}
      onOpen={openItem}
      onMenu={menu}
    />
  );

  return (
    <Screen
      title="Home"
      padded={false}
      right={
        // Active user's avatar opens Settings (accounts live there), like the system apps' profile button.
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Settings"
          onPress={() => router.push('/settings')}
          style={({ pressed }) => [styles.profile, pressed && styles.pressed]}
        >
          {/* Same size as the round header buttons on other tabs (Library's filters). */}
          <Avatar name={active?.userName} size={minTouch} />
        </Pressable>
      }
    >
      {alone ? (
        // Nothing to scroll (Retry reloads).
        <Offline fill busy={offline.busy} retry={refreshHome} />
      ) : (
        <ScrollView
          {...tabList}
          testID="home-scroll"
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.text} />}
        >
          {layout.allFailed ? (
            <View style={styles.padded}>
              <Message text={loadErrorMessage(views.error!)} retry={refreshHome} />
            </View>
          ) : (
            <>
              {offline.offline && <Offline busy={offline.busy} retry={refreshHome} />}
              {layout.empty && (
                <View style={styles.padded}>
                  <Message text="Nothing to watch yet. Add movies and shows to your Jellyfin server, then pull down to refresh." />
                </View>
              )}
              {hero ? (
                <View style={styles.padded}>
                  <Hero
                    eyebrow={layout.heroFromResume ? 'Continue Watching' : 'Up Next'}
                    {...cardTitles(hero)}
                    {...playback(hero)}
                    image={image(backdropImage(hero), heroWidth)}
                    onPress={() => openItem(hero)}
                    onLongPress={() => menu(hero)}
                  />
                </View>
              ) : (
                layout.heroPending &&
                !offline.offline && (
                  <View testID="hero-placeholder" style={styles.padded}>
                    <CardPlaceholder
                      shape="landscape"
                      width={beside ? HERO_SIDE_ART : '100%'}
                      aspectRatio={heroAspect}
                    />
                  </View>
                )
              )}
              {!offline.offline && (
                <ItemRow
                  title="Continue Watching"
                  shape="landscape"
                  size={cards}
                  items={layout.resume}
                  error={resume.error}
                  retry={resume.refresh}
                  card={landscape}
                />
              )}
              {!offline.offline && (
                <ItemRow
                  title="Next Up"
                  shape="landscape"
                  size={cards}
                  items={layout.nextUp}
                  error={next.error}
                  retry={next.refresh}
                  card={landscape}
                />
              )}
              {layout.libraries === undefined ? (
                <ItemRow
                  title="Recently Added"
                  shape="poster"
                  size={posters}
                  error={views.error}
                  retry={views.refresh}
                  card={() => null}
                />
              ) : (
                layout.libraries.map((library) => (
                  <LatestRow
                    key={library.Id}
                    library={library}
                    countKey={countKey(library.Id)}
                    posterCount={posters.count}
                    posterWidth={posters.width}
                    onCount={onLatestCount}
                  />
                ))
              )}
            </>
          )}
        </ScrollView>
      )}
    </Screen>
  );
}

type LatestRowProps = {
  library: BaseItemDto;
  countKey: string;
  /** Card size as numbers (an object would be new on every Home render and defeat the memo). */
  posterCount: number;
  posterWidth: number;
  /** Reports the row's item count once loaded, so Home can tell when everything is empty. */
  onCount: (key: string, count: number) => void;
};

// Memo: Home re-renders on every top-row update; a library's row only changes with its own data.
const LatestRow = memo(function LatestRow({ library, countKey, posterCount, posterWidth, onCount }: LatestRowProps) {
  const image = useImage();
  const menu = useItemMenu();
  const endpoint = latest(library.Id);
  const { data, error, refresh } = useFetch<BaseItemDto[]>(endpoint.path, { query: endpoint.query });
  const items = data && recentlyAdded(data);
  const count = items?.length;
  useEffect(() => {
    if (count !== undefined) onCount(countKey, count);
  }, [count, countKey, onCount]);
  return (
    <ItemRow
      title={`Recently Added in ${library.Name}`}
      shape="poster"
      size={{ count: posterCount, width: posterWidth }}
      items={items}
      error={error}
      retry={refresh}
      card={(item) => (
        <PosterCard
          key={item.Id}
          {...cardTitles(item)}
          played={item.UserData?.Played}
          width={posterWidth}
          image={image(posterImage(item), posterWidth)}
          item={item}
          onOpen={openItem}
          onMenu={menu}
        />
      )}
    />
  );
});

type ItemRowProps = {
  title: string;
  shape: 'poster' | 'landscape';
  size: CardSize;
  /** undefined while loading (placeholders) or after an error; empty → row hidden. */
  items?: BaseItemDto[];
  error?: ApiError;
  retry: () => void;
  card: (item: BaseItemDto) => ReactNode;
};

/**
 * One shelf: placeholders while loading, error + Retry, hidden when empty, else cards. Out of reach with nothing
 * loaded: hidden too (the rest of Home stays; all out of reach → the offline state), back by itself on reconnect.
 */
function ItemRow({ title, shape, size, items, error, retry, card }: ItemRowProps) {
  if (items?.length === 0 || (!items && isConnectionError(error))) return null;
  return (
    <Row title={title}>
      {items ? (
        items.map(card)
      ) : error ? (
        <LoadError error={error} retry={retry} />
      ) : (
        <CardRowPlaceholder shape={shape} width={size.width} count={size.count} label={`Loading ${title}`} />
      )}
    </Row>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg, paddingBottom: spacing.lg },
  padded: { paddingHorizontal: spacing.md },
  profile: { width: minTouch, height: minTouch, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: pressedOpacity },
});
