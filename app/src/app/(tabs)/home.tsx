// SPDX-License-Identifier: GPL-3.0-or-later
// Home: Up Next hero, Continue Watching, Next Up, Recently Added per library (docs/context/api.md, Home data).
import { router } from 'expo-router';
import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type ScrollViewInstance,
} from 'react-native';

import { ApiError, isConnectionError, type BaseItemDto, type ItemsResult } from '@/api';
import { Avatar } from '@/components/Avatar';
import { CardPlaceholder, LandscapeCard, PosterCard } from '@/components/Card';
import { Hero, useHeroAspect } from '@/components/Hero';
import { useItemMenu } from '@/components/ItemMenu';
import { LoadError, loadErrorMessage, Message, Offline, useHeldOffline } from '@/components/Message';
import { Row } from '@/components/Row';
import { useShelfCards, type CardSize } from '@/components/shelfCards';
import { Screen } from '@/components/Screen';
import { CardRowPlaceholder } from '@/components/Skeleton';
import { TvHero, useTvHeroHeight } from '@/components/tv/TvHero';
import { TvShelf } from '@/components/tv/TvShelf';
import { heroFacts } from '@/detail';
import {
  backdropImage,
  cardTitles,
  continueWatching,
  episodeLabel,
  episodeLine,
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
import { openItem, openPlayer } from '@/navigation';
import { useSession } from '@/session';
import { invalidate, useFetch } from '@/useFetch';
import { useImage } from '@/useImage';
import { usePullToRefresh } from '@/usePullToRefresh';
import { minTouch, pressedOpacity, radii, spacing, tabList, tv, useColors } from '@/theme';

/** Pull to refresh / Retry: refetch every Home row, failed ones too. */
function refreshHome() {
  homePaths.forEach((path) => invalidate(path));
}

export default function Home() {
  const { active } = useSession();
  const c = useColors();
  const image = useImage();
  const menu = useItemMenu();
  // Tablets: whole cards across the row, so it never ends in a gap.
  const { rowWidth, posters, landscape: cards } = useShelfCards();
  // The hero (and its placeholder): the row's width, 16:9 on phones, cropped wide on tablets.
  const heroAspect = useHeroAspect();
  const heroWidth = Math.round(rowWidth);
  // TV: the hero art is the screen's width; its own area is the screen less the shelf peeking in.
  const tvScreenWidth = useWindowDimensions().width;
  const tvHeroHeight = useTvHeroHeight();
  // TV: back on the hero → the top of Home (the full hero, the tab bar reachable above it).
  const scroll = useRef<ScrollViewInstance>(null);
  const scrollToTop = useCallback(() => scroll.current?.scrollTo({ y: 0, animated: true }), []);
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

  // Active user's avatar opens Settings (accounts live there), like the system apps' profile button. TV: bigger,
  // beside the system's tab bar, and focus grows it with a ring.
  const profile = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Settings"
      onPress={() => router.push('/settings')}
      style={({ pressed, focused }) => [
        Platform.isTV ? styles.profileTv : styles.profile,
        pressed && styles.pressed,
        focused && [styles.profileFocused, { borderColor: c.text }],
      ]}
    >
      {/* Same size as the round header buttons on other tabs (Library's filters). */}
      <Avatar name={active?.userName} size={Platform.isTV ? tv.avatar : minTouch} />
    </Pressable>
  );
  const padded = Platform.isTV ? styles.tvPadded : styles.padded;

  const heroView = hero ? (
    Platform.isTV ? (
      <TvHero
        eyebrow={layout.heroFromResume ? 'Continue Watching' : 'Up Next'}
        title={cardTitles(hero).title}
        episode={hero.Type === 'Episode' ? episodeLine(hero) : undefined}
        facts={heroFacts(hero)}
        image={image(backdropImage(hero), tvScreenWidth)}
        playLabel={hero.Type === 'Episode' ? episodeLabel(hero) : undefined}
        {...playback(hero)}
        onPlay={() => openPlayer(hero, playback(hero).resumeSeconds ?? 0)}
        onRestart={playback(hero).progress !== undefined ? () => openPlayer(hero, 0) : undefined}
        onMore={() => menu(hero)}
        onFocus={scrollToTop}
      />
    ) : (
      <View style={styles.padded}>
        <Hero
          eyebrow={layout.heroFromResume ? 'Continue Watching' : 'Up Next'}
          {...cardTitles(hero)}
          {...playback(hero)}
          image={image(backdropImage(hero), heroWidth)}
          onPress={() => openItem(hero)}
          onPlay={() => openPlayer(hero, playback(hero).resumeSeconds ?? 0)}
          onLongPress={() => menu(hero)}
        />
      </View>
    )
  ) : (
    layout.heroPending &&
    !offline.offline &&
    (Platform.isTV ? (
      // TV: the hero's space stays (dark) until it loads, so the shelves don't jump.
      <View testID="hero-placeholder" style={{ height: tvHeroHeight }} />
    ) : (
      <View testID="hero-placeholder" style={styles.padded}>
        <CardPlaceholder shape="landscape" width="100%" aspectRatio={heroAspect} />
      </View>
    ))
  );
  // TV with no hero: the content starts under the system's tab bar, so it moves down by the bar's height.
  const underTabBar = Platform.isTV && !hero && !layout.heroPending;

  const content = alone ? (
    // Nothing to scroll (Retry reloads).
    <View style={[styles.fill, Platform.isTV && styles.tvInset]}>
      <Offline fill busy={offline.busy} retry={refreshHome} />
    </View>
  ) : (
    <ScrollView
      ref={scroll}
      {...tabList}
      // TV: the hero art runs under the system's tab bar.
      {...(Platform.isTV && { contentInsetAdjustmentBehavior: 'never' as const })}
      testID="home-scroll"
      contentContainerStyle={[
        Platform.isTV ? styles.tvContent : styles.content,
        (underTabBar || offline.offline) && Platform.isTV && styles.tvInset,
      ]}
      refreshControl={
        // No pull to refresh on TV (no touch); the rows refetch on their own (foreground, reconnect).
        Platform.isTV ? undefined : <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.text} />
      }
    >
      {layout.allFailed ? (
        <View style={padded}>
          <Message text={loadErrorMessage(views.error!)} retry={refreshHome} />
        </View>
      ) : (
        <>
          {offline.offline && <Offline busy={offline.busy} retry={refreshHome} />}
          {layout.empty && (
            <View style={padded}>
              <Message
                text={
                  Platform.isTV
                    ? 'Nothing to watch yet. Add movies and shows to your Jellyfin server.'
                    : 'Nothing to watch yet. Add movies and shows to your Jellyfin server, then pull down to refresh.'
                }
              />
            </View>
          )}
          {heroView}
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
      {/* TV: top right beside the tab bar, scrolling away with the hero. */}
      {Platform.isTV && !alone && <View style={styles.tvProfile}>{profile}</View>}
    </ScrollView>
  );

  // Apple TV: no title (the system's tab bar names the screen), the hero full screen.
  if (Platform.isTV)
    return (
      <View style={[styles.fill, { backgroundColor: c.background }]}>
        {content}
        {alone && <View style={styles.tvProfile}>{profile}</View>}
      </View>
    );
  return (
    <Screen title="Home" padded={false} right={profile}>
      {content}
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
  const Shelf = Platform.isTV ? TvShelf : Row;
  return (
    <Shelf title={title}>
      {items ? (
        items.map(card)
      ) : error ? (
        <LoadError error={error} retry={retry} />
      ) : (
        <CardRowPlaceholder shape={shape} width={size.width} count={size.count} label={`Loading ${title}`} />
      )}
    </Shelf>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg, paddingBottom: spacing.lg },
  padded: { paddingHorizontal: spacing.md },
  fill: { flex: 1 },
  tvContent: { paddingBottom: tv.gap.lg },
  tvPadded: { paddingHorizontal: tv.margin },
  tvInset: { paddingTop: tv.tabBarInset },
  // Level with the system's tab bar, at the right margin.
  tvProfile: { position: 'absolute', top: tv.marginTop - tv.gap.sm, right: tv.margin },
  profile: { width: minTouch, height: minTouch, alignItems: 'center', justifyContent: 'center' },
  // TV: a clear ring around the avatar while focused (border kept transparent otherwise, so it doesn't shift).
  profileTv: { borderRadius: radii.pill, borderWidth: 4, borderColor: 'transparent' },
  profileFocused: { transform: [{ scale: tv.focus.buttonScale }], ...tv.focus.shadow },
  pressed: { opacity: pressedOpacity },
});
