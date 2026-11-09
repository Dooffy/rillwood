// SPDX-License-Identifier: GPL-3.0-or-later
// Phone / tablet Home: large title with the profile avatar (opens Settings), the Up Next hero, the shelves, pull to
// refresh.
import { router } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { CardPlaceholder } from '@/components/Card';
import { Hero, useHeroAspect } from '@/components/Hero';
import { HomeRows } from '@/components/HomeRows';
import { useItemMenu } from '@/components/ItemMenu';
import { loadErrorMessage, Message, Offline } from '@/components/Message';
import { Row } from '@/components/Row';
import { useShelfCards } from '@/components/shelfCards';
import { Screen } from '@/components/Screen';
import { backdropImage, cardTitles, playback } from '@/items';
import { openItem, openPlayer } from '@/navigation';
import { minTouch, pressedOpacity, spacing, tabList, useColors } from '@/theme';
import { refreshHome, useHome } from '@/useHome';
import { useImage } from '@/useImage';
import { usePullToRefresh } from '@/usePullToRefresh';

export function PhoneHome() {
  const home = useHome();
  const { layout, offline } = home;
  const { hero } = layout;
  const c = useColors();
  const image = useImage();
  const menu = useItemMenu();
  // The hero (and its placeholder): the row's width, 16:9 on phones, cropped wide on tablets.
  const { rowWidth } = useShelfCards();
  const heroAspect = useHeroAspect();
  const heroWidth = Math.round(rowWidth);
  const { refreshing, onRefresh } = usePullToRefresh(home.loading, refreshHome);

  // Active user's avatar opens Settings (accounts live there), like the system apps' profile button.
  const profile = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Settings"
      onPress={() => router.push('/settings')}
      style={({ pressed }) => [styles.profile, pressed && styles.pressed]}
    >
      {/* Same size as the round header buttons on other tabs (Library's filters). */}
      <Avatar name={home.active?.userName} size={minTouch} />
    </Pressable>
  );

  const heroView = hero ? (
    <View style={styles.padded}>
      <Hero
        eyebrow={home.heroEyebrow}
        {...cardTitles(hero)}
        {...playback(hero)}
        image={image(backdropImage(hero), heroWidth)}
        onPress={() => openItem(hero)}
        onPlay={() => openPlayer(hero, playback(hero).resumeSeconds ?? 0)}
        onLongPress={() => menu(hero)}
      />
    </View>
  ) : (
    layout.heroPending &&
    !offline.offline && (
      <View testID="hero-placeholder" style={styles.padded}>
        <CardPlaceholder shape="landscape" width="100%" aspectRatio={heroAspect} />
      </View>
    )
  );

  return (
    <Screen title="Home" padded={false} right={profile}>
      {home.alone ? (
        // Nothing to scroll (Retry reloads).
        <View style={styles.fill}>
          <Offline fill busy={offline.busy} retry={refreshHome} />
        </View>
      ) : (
        <ScrollView
          {...tabList}
          testID="home-scroll"
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.text} />}
        >
          {layout.allFailed ? (
            <View style={styles.padded}>
              <Message text={loadErrorMessage(home.views.error!)} retry={refreshHome} />
            </View>
          ) : (
            <>
              {offline.offline && <Offline busy={offline.busy} retry={refreshHome} />}
              {layout.empty && (
                <View style={styles.padded}>
                  <Message text="Nothing to watch yet. Add movies and shows to your Jellyfin server, then pull down to refresh." />
                </View>
              )}
              {heroView}
              <HomeRows home={home} Shelf={Row} />
            </>
          )}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg, paddingBottom: spacing.lg },
  padded: { paddingHorizontal: spacing.md },
  fill: { flex: 1 },
  profile: { width: minTouch, height: minTouch, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: pressedOpacity },
});
