// SPDX-License-Identifier: GPL-3.0-or-later
// Apple TV Home: no title (the system's tab bar names the screen), the hero full screen under the tab bar, the
// shelves (the profile is its own tab, `TvProfile`). No pull to refresh (no touch); the rows refetch on
// their own (foreground, reconnect).
import { useCallback, useRef } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View, type ScrollViewInstance } from 'react-native';

import { HomeRows } from '@/components/HomeRows';
import { useItemMenu } from '@/components/ItemMenu';
import { loadErrorMessage, Message, Offline } from '@/components/Message';
import { TvEmptyState } from '@/components/tv/TvEmptyState';
import { TvHero, useTvHeroHeight } from '@/components/tv/TvHero';
import { TvShelf } from '@/components/tv/TvShelf';
import { heroFacts } from '@/detail';
import { backdropImage, cardTitles, episodeLabel, episodeLine, playback } from '@/items';
import { openPlayer } from '@/navigation';
import { tabList, tv, useColors } from '@/theme';
import { refreshHome, useHome } from '@/useHome';
import { useImage } from '@/useImage';

export function TvHome() {
  const home = useHome();
  const { layout, offline, alone } = home;
  const { hero } = layout;
  const c = useColors();
  const image = useImage();
  const menu = useItemMenu();
  // The hero art is the screen's width; its own area is the screen less the shelf peeking in.
  const screenWidth = useWindowDimensions().width;
  const heroHeight = useTvHeroHeight();
  // Back on the hero → the top of Home (the full hero, the tab bar reachable above it).
  const scroll = useRef<ScrollViewInstance>(null);
  const scrollToTop = useCallback(() => scroll.current?.scrollTo({ y: 0, animated: true }), []);
  const heroView = hero ? (
    <TvHero
      eyebrow={home.heroEyebrow}
      title={cardTitles(hero).title}
      episode={hero.Type === 'Episode' ? episodeLine(hero) : undefined}
      facts={heroFacts(hero)}
      image={image(backdropImage(hero), screenWidth)}
      playLabel={hero.Type === 'Episode' ? episodeLabel(hero) : undefined}
      {...playback(hero)}
      onPlay={() => openPlayer(hero, playback(hero).resumeSeconds ?? 0)}
      onRestart={playback(hero).progress !== undefined ? () => openPlayer(hero, 0) : undefined}
      onMore={() => menu(hero)}
      onFocus={scrollToTop}
    />
  ) : (
    // The hero's space stays (dark) until it loads, so the shelves don't jump.
    layout.heroPending && !offline.offline && <View testID="hero-placeholder" style={{ height: heroHeight }} />
  );
  // No hero: the content starts under the system's tab bar, so it moves down by the bar's height.
  const underTabBar = !hero && !layout.heroPending;

  return (
    <View style={[styles.fill, { backgroundColor: c.background }]}>
      {alone ? (
        // Nothing to scroll (Retry reloads).
        <View style={[styles.fill, styles.inset]}>
          <Offline fill busy={offline.busy} retry={refreshHome} />
        </View>
      ) : (
        <ScrollView
          ref={scroll}
          {...tabList}
          // The hero art runs under the system's tab bar.
          contentInsetAdjustmentBehavior="never"
          testID="home-scroll"
          contentContainerStyle={[styles.content, (underTabBar || offline.offline) && styles.inset]}
        >
          {layout.allFailed ? (
            <View style={styles.padded}>
              <Message text={loadErrorMessage(home.views.error!)} retry={refreshHome} />
            </View>
          ) : (
            <>
              {offline.offline && <Offline busy={offline.busy} retry={refreshHome} />}
              {layout.empty && (
                <TvEmptyState
                  icon="film.stack"
                  title="Nothing to watch yet"
                  text="Add movies and shows to your Jellyfin server, then come back."
                />
              )}
              {heroView}
              <HomeRows home={home} Shelf={TvShelf} />
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingBottom: tv.gap.lg },
  padded: { paddingHorizontal: tv.margin },
  inset: { paddingTop: tv.tabBarInset },
});
