// SPDX-License-Identifier: GPL-3.0-or-later
// Home: Up Next hero, Continue Watching, Next Up, Recently Added per library (docs/context/api.md, Home data).
import { router } from 'expo-router';
import { memo, useCallback, useEffect, useState, type ReactNode } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { ApiError, type BaseItemDto, type ItemsResult } from '@/api';
import { Avatar } from '@/components/Avatar';
import { CardPlaceholder, LANDSCAPE_WIDTH, LandscapeCard, POSTER_WIDTH, PosterCard } from '@/components/Card';
import { Hero } from '@/components/Hero';
import { useItemMenu } from '@/components/ItemMenu';
import { loadErrorMessage, Message } from '@/components/Message';
import { Row } from '@/components/Row';
import { Screen } from '@/components/Screen';
import { CardRowPlaceholder } from '@/components/Skeleton';
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
import { minTouch, pressedOpacity, spacing, tabList, useColors } from '@/theme';

/** Pull to refresh / Retry: refetch every Home row, failed ones too. */
function refreshHome() {
  homePaths.forEach((path) => invalidate(path));
}

export default function Home() {
  const { active } = useSession();
  const c = useColors();
  const image = useImage();
  const menu = useItemMenu();
  const { width } = useWindowDimensions();
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

  const landscape = (item: BaseItemDto) => (
    <LandscapeCard
      key={item.Id}
      {...cardTitles(item)}
      {...playback(item)}
      image={image(landscapeImage(item), LANDSCAPE_WIDTH)}
      onPress={() => openItem(item)}
      onLongPress={() => menu(item)}
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
                  image={image(backdropImage(hero), width - 2 * spacing.md)}
                  onPress={() => openItem(hero)}
                  onLongPress={() => menu(hero)}
                />
              </View>
            ) : (
              layout.heroPending && (
                <View testID="hero-placeholder" style={styles.padded}>
                  <CardPlaceholder shape="landscape" width="100%" />
                </View>
              )
            )}
            <ItemRow
              title="Continue Watching"
              shape="landscape"
              items={layout.resume}
              error={resume.error}
              retry={resume.refresh}
              card={landscape}
            />
            <ItemRow
              title="Next Up"
              shape="landscape"
              items={layout.nextUp}
              error={next.error}
              retry={next.refresh}
              card={landscape}
            />
            {layout.libraries === undefined ? (
              <ItemRow
                title="Recently Added"
                shape="poster"
                error={views.error}
                retry={views.refresh}
                card={() => null}
              />
            ) : (
              layout.libraries.map((library) => (
                <LatestRow key={library.Id} library={library} countKey={countKey(library.Id)} onCount={onLatestCount} />
              ))
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

type LatestRowProps = {
  library: BaseItemDto;
  countKey: string;
  /** Reports the row's item count once loaded, so Home can tell when everything is empty. */
  onCount: (key: string, count: number) => void;
};

// Memo: Home re-renders on every top-row update; a library's row only changes with its own data.
const LatestRow = memo(function LatestRow({ library, countKey, onCount }: LatestRowProps) {
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
      items={items}
      error={error}
      retry={refresh}
      card={(item) => (
        <PosterCard
          key={item.Id}
          {...cardTitles(item)}
          played={item.UserData?.Played}
          image={image(posterImage(item), POSTER_WIDTH)}
          onPress={() => openItem(item)}
          onLongPress={() => menu(item)}
        />
      )}
    />
  );
});

type ItemRowProps = {
  title: string;
  shape: 'poster' | 'landscape';
  /** undefined while loading (placeholders) or after an error; empty → row hidden. */
  items?: BaseItemDto[];
  error?: ApiError;
  retry: () => void;
  card: (item: BaseItemDto) => ReactNode;
};

/** One shelf: placeholders while loading, error + Retry, hidden when empty, else cards. */
function ItemRow({ title, shape, items, error, retry, card }: ItemRowProps) {
  if (items?.length === 0) return null;
  return (
    <Row title={title}>
      {items ? (
        items.map(card)
      ) : error ? (
        <Message text={loadErrorMessage(error)} retry={retry} />
      ) : (
        <CardRowPlaceholder shape={shape} label={`Loading ${title}`} />
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
