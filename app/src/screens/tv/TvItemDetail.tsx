// SPDX-License-Identifier: GPL-3.0-or-later
// Apple TV movie / episode detail (screen draft 07): the backdrop fills the screen with everything to decide on the art -
// series name (episodes), title, genres, summary, facts, badges, play row - and the credits bottom right. Focus starts
// on Play / Resume; Play from Start (when started), Watched and Favourite beside it. A long summary is focusable and
// opens the whole text in a centred panel. Below it (draft 08): Cast & Crew, More Like This, Details + the Media card;
// the art stays behind, dimmed. Back from down there returns to the hero with focus on Play; Back on the hero leaves.
import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import {
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
} from 'react-native';

import { ActionSheet } from '@/components/ActionSheet';
import { Text } from '@/components/Text';
import { MoreLikeThis } from '@/components/MoreLikeThis';
import { holdMenuKey, rememberFocus, restoreFocus, TvFocusRow } from '@/components/tv/focus';
import { TvButton, type TvButtonHandle } from '@/components/tv/TvButton';
import { TvCast } from '@/components/tv/TvCast';
import { TvDetails } from '@/components/tv/TvDetails';
import { TvShelf } from '@/components/tv/TvShelf';
import { formatRemaining } from '@/format';
import { ColorsContext, palettes, radii, scrollList, tv, useColors } from '@/theme';
import { useImage } from '@/useImage';
import { useItemDetail, type ItemDetailProps } from '@/useItemDetail';

/** A summary longer than this doesn't fit its three lines: focusable, More opens the whole text. */
const SUMMARY_CLAMP_CHARS = 240;

export function TvItemDetail({ item }: ItemDetailProps) {
  const c = useColors();
  const image = useImage();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const detail = useItemDetail(item);
  const { view, progress, remainingSeconds, played, favourite } = detail;
  const [aboutOpen, setAboutOpen] = useState(false);
  const started = progress !== undefined;
  const left = started ? formatRemaining(remainingSeconds) : undefined;
  const longSummary = (view.overview?.length ?? 0) > SUMMARY_CLAMP_CHARS;
  const scroll = useRef<ScrollViewInstance>(null);
  const play = useRef<TvButtonHandle>(null);
  // Scrolled past the hero: the art dims, and Back comes back up instead of leaving.
  const [below, setBelow] = useState(false);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) =>
    setBelow(e.nativeEvent.contentOffset.y > screenHeight * tv.detail.belowAt);
  useEffect(() => {
    if (!below) return;
    const release = holdMenuKey();
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      scroll.current?.scrollTo({ y: 0, animated: true });
      restoreFocus(play.current);
      return true;
    });
    return () => {
      sub.remove();
      release();
    };
  }, [below]);

  return (
    <View style={[styles.fill, { backgroundColor: c.background }]}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {view.art !== undefined && (
          <Image
            testID="tv-detail-image"
            source={image(view.art, screenWidth)}
            cachePolicy="memory-disk"
            contentFit="cover"
            transition={300}
            style={StyleSheet.absoluteFill}
            accessible={false}
          />
        )}
        <View style={[StyleSheet.absoluteFill, styles.fadeLeft]} />
        <View style={[StyleSheet.absoluteFill, styles.fadeBottom]} />
        {below && <View testID="tv-detail-dim" style={[StyleSheet.absoluteFill, styles.dim]} />}
      </View>
      {/* White over the dark fades whatever the theme. */}
      <ColorsContext.Provider value={palettes.dark}>
        <ScrollView
          ref={scroll}
          {...scrollList}
          testID="tv-detail-scroll"
          contentInsetAdjustmentBehavior="never"
          onScroll={onScroll}
          scrollEventThrottle={100}
          contentContainerStyle={styles.content}
        >
          {/* The hero: the first screen, its content at the bottom. */}
          <View style={{ height: screenHeight }}>
            <View style={styles.onArt}>
              <View style={styles.text}>
                {detail.parent && (
                  <Text numberOfLines={1} secondary style={[tv.type.label, styles.eyebrow]}>
                    {detail.parent.name.toUpperCase()}
                  </Text>
                )}
                <Text accessibilityRole="header" numberOfLines={2} style={tv.type.title}>
                  {item.Name}
                </Text>
                {view.subtitle !== undefined && (
                  <Text numberOfLines={1} style={tv.type.body}>
                    {view.subtitle}
                  </Text>
                )}
                {view.overview !== undefined &&
                  (longSummary ? (
                    <Pressable
                      onFocus={rememberFocus}
                      accessibilityRole="button"
                      accessibilityLabel={view.overview}
                      accessibilityHint="Shows the whole summary"
                      onPress={() => setAboutOpen(true)}
                      style={({ focused }) => [styles.summary, focused && { backgroundColor: tv.unfocused }]}
                    >
                      <Text numberOfLines={3} style={tv.type.body}>
                        {view.overview}
                      </Text>
                      <Text secondary style={tv.type.label}>
                        More
                      </Text>
                    </Pressable>
                  ) : (
                    <Text style={[tv.type.body, styles.summaryText]}>{view.overview}</Text>
                  ))}
                {view.facts.length > 0 && (
                  <Text numberOfLines={1} secondary style={tv.type.caption}>
                    {view.facts.join(' · ')}
                  </Text>
                )}
                {view.badges.length > 0 && (
                  <View accessible accessibilityLabel={view.badges.join(', ')} style={styles.badges}>
                    {view.badges.map((b) => (
                      <View key={b} style={[styles.badge, { borderColor: c.textSecondary }]}>
                        <Text secondary style={tv.type.label}>
                          {b}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
              <TvFocusRow style={styles.buttons}>
                <TvButton
                  title={started ? 'Resume' : 'Play'}
                  accessibilityLabel={[started ? 'Resume' : 'Play', left && `${left} left`].filter(Boolean).join(', ')}
                  variant="primary"
                  icon="play.fill"
                  progress={progress}
                  trailing={left && `${left} left`}
                  onPress={detail.play}
                  ref={play}
                  preferredFocus
                />
                {detail.startOver && (
                  <TvButton round title="Play from Start" icon="arrow.counterclockwise" onPress={detail.startOver} />
                )}
                <TvButton
                  round
                  // The label says what a click does; filled like Play (and a filled heart) when it's on.
                  title={played ? 'Mark Unwatched' : 'Mark Watched'}
                  icon="checkmark"
                  selected={played}
                  onPress={() => detail.mark('played', !played)}
                />
                <TvButton
                  round
                  title={favourite ? 'Remove from Favourites' : 'Add to Favourites'}
                  icon={favourite ? 'heart.fill' : 'heart'}
                  selected={favourite}
                  onPress={() => detail.mark('favourite', !favourite)}
                />
              </TvFocusRow>
            </View>
            {view.credits.length > 0 && (
              <View testID="tv-credits" style={styles.credits}>
                {view.credits.map(({ label, names }) => (
                  <View key={label} accessible accessibilityLabel={`${label}: ${names.join(', ')}`}>
                    <Text secondary style={tv.type.label}>
                      {label}
                    </Text>
                    <Text numberOfLines={2} style={tv.type.caption}>
                      {names.join(', ')}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
          <TvCast people={view.people} />
          <MoreLikeThis id={item.Id} Shelf={TvShelf} />
          <TvDetails item={item} view={view} />
        </ScrollView>
      </ColorsContext.Provider>
      <ActionSheet visible={aboutOpen} title={item.Name} closeLabel="Done" onClose={() => setAboutOpen(false)}>
        <Text style={tv.type.body}>{view.overview}</Text>
      </ActionSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // Dark under the text on the left and at the bottom (credits), the art clear top right.
  fadeLeft: {
    backgroundImage: 'linear-gradient(to right, rgba(0, 0, 0, 0.8) 0%, rgba(0, 0, 0, 0.4) 50%, rgba(0, 0, 0, 0) 75%)',
  },
  fadeBottom: { backgroundImage: 'linear-gradient(to bottom, rgba(0, 0, 0, 0) 40%, rgba(0, 0, 0, 0.75) 100%)' },
  // Below the hero: the art stays, dimmed, behind the shelves and Details.
  dim: { backgroundColor: tv.detail.dim },
  content: { gap: tv.gap.lg, paddingBottom: tv.margin },
  onArt: { position: 'absolute', left: 0, right: 0, bottom: tv.marginTop, gap: tv.gap.lg },
  text: { marginLeft: tv.margin, maxWidth: tv.hero.textWidth, gap: tv.gap.sm / 2 },
  eyebrow: { letterSpacing: 1 },
  // Focusable summary: a soft fill when focused, the text where it would be without it.
  summary: {
    marginHorizontal: -tv.gap.sm,
    paddingHorizontal: tv.gap.sm,
    paddingVertical: tv.gap.sm / 2,
    borderRadius: radii.card,
  },
  summaryText: { paddingVertical: tv.gap.sm / 2 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: tv.gap.sm / 2, paddingTop: tv.gap.sm / 2 },
  badge: {
    borderWidth: tv.detail.badge.border,
    borderRadius: tv.detail.badge.radius,
    paddingHorizontal: tv.detail.badge.paddingHorizontal,
    paddingVertical: tv.detail.badge.paddingVertical,
  },
  buttons: { flexDirection: 'row', alignItems: 'center', gap: tv.gap.sm, paddingHorizontal: tv.margin },
  // Bottom right, level with the play row's bottom.
  credits: {
    position: 'absolute',
    right: tv.margin,
    bottom: tv.marginTop,
    width: tv.detail.creditsWidth,
    gap: tv.gap.sm,
  },
});
