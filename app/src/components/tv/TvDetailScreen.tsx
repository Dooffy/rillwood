// SPDX-License-Identifier: GPL-3.0-or-later
// Apple TV detail screen frame (screen drafts 07-09), shared by movie / episode and series: the backdrop fills the
// screen with everything to decide on the art - eyebrow (an episode's series), title, genres, summary, facts, badges,
// play row - and the credits bottom right. Focus starts on Play; Play from Start (when started), Watched and Favourite
// beside it. A long summary is focusable and opens the whole text in a centred panel. Below the hero, the screen's own
// content (`children`: seasons, shelves, Details); the art stays behind, dimmed. Back from down there returns to the
// hero with focus on Play; Back on the hero leaves.
import { Image } from 'expo-image';
import { useEffect, useRef, useState, type ReactNode } from 'react';
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

import type { Credit } from '@/detail';
import type { UserFlag } from '@/items';
import { ColorsContext, palettes, radii, scrollList, tv, useColors } from '@/theme';

import { ActionSheet } from '../ActionSheet';
import { Text } from '../Text';
import { holdMenuKey, rememberFocus, restoreFocus, TvFocusRow } from './focus';
import { TvButton, type TvButtonHandle } from './TvButton';

/** Play before there is something to play (a series still finding its episode): stays focusable, does nothing. */
const waiting = () => {};

/** A summary longer than this doesn't fit its three lines: focusable, More opens the whole text. */
const SUMMARY_CLAMP_CHARS = 240;

export type TvDetailPlay = {
  /** "Play", "Resume", "S2, E5". */
  label: string;
  /** What VoiceOver reads: "Resume Season 2, Episode 5, 34m left". */
  accessibilityLabel: string;
  /** 0-1 watched, and "34m left" after the bar. */
  progress?: number;
  trailing?: string;
  /** undefined: nothing to play yet (series loading) - the button stays, a click does nothing. */
  onPress?: () => void;
};

export type TvDetailScreenProps = {
  /** Backdrop URL. */
  art?: string;
  /** Small caps over the title: an episode's series. */
  eyebrow?: string;
  title: string;
  subtitle?: string;
  overview?: string;
  facts: string[];
  badges: string[];
  credits: Credit[];
  play: TvDetailPlay;
  /** Started only: plays from the beginning. */
  onStartOver?: () => void;
  played: boolean;
  favourite: boolean;
  onMark: (flag: UserFlag, value: boolean) => void;
  /** Below the hero. */
  children?: ReactNode;
};

export function TvDetailScreen({
  art,
  eyebrow,
  title,
  subtitle,
  overview,
  facts,
  badges,
  credits,
  play: playButton,
  onStartOver,
  played,
  favourite,
  onMark,
  children,
}: TvDetailScreenProps) {
  const c = useColors();
  const { height: screenHeight } = useWindowDimensions();
  const [aboutOpen, setAboutOpen] = useState(false);
  const longSummary = (overview?.length ?? 0) > SUMMARY_CLAMP_CHARS;
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
        {art !== undefined && (
          <Image
            testID="tv-detail-image"
            source={art}
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
                {eyebrow !== undefined && (
                  <Text numberOfLines={1} secondary style={[tv.type.label, styles.eyebrow]}>
                    {eyebrow.toUpperCase()}
                  </Text>
                )}
                <Text accessibilityRole="header" numberOfLines={2} style={tv.type.title}>
                  {title}
                </Text>
                {subtitle !== undefined && (
                  <Text numberOfLines={1} style={tv.type.body}>
                    {subtitle}
                  </Text>
                )}
                {overview !== undefined &&
                  (longSummary ? (
                    <Pressable
                      onFocus={rememberFocus}
                      accessibilityRole="button"
                      accessibilityLabel={overview}
                      accessibilityHint="Shows the whole summary"
                      onPress={() => setAboutOpen(true)}
                      style={({ focused }) => [styles.summary, focused && { backgroundColor: tv.unfocused }]}
                    >
                      <Text numberOfLines={3} style={tv.type.body}>
                        {overview}
                      </Text>
                      <Text secondary style={tv.type.label}>
                        More
                      </Text>
                    </Pressable>
                  ) : (
                    <Text style={[tv.type.body, styles.summaryText]}>{overview}</Text>
                  ))}
                {facts.length > 0 && (
                  <Text numberOfLines={1} secondary style={tv.type.caption}>
                    {facts.join(' · ')}
                  </Text>
                )}
                {badges.length > 0 && (
                  <View accessible accessibilityLabel={badges.join(', ')} style={styles.badges}>
                    {badges.map((b) => (
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
                  title={playButton.label}
                  accessibilityLabel={playButton.accessibilityLabel}
                  variant="primary"
                  icon="play.fill"
                  progress={playButton.progress}
                  trailing={playButton.trailing}
                  onPress={playButton.onPress ?? waiting}
                  ref={play}
                  preferredFocus
                />
                {onStartOver && (
                  <TvButton round title="Play from Start" icon="arrow.counterclockwise" onPress={onStartOver} />
                )}
                <TvButton
                  round
                  // The label says what a click does; filled like Play (and a filled heart) when it's on.
                  title={played ? 'Mark Unwatched' : 'Mark Watched'}
                  icon="checkmark"
                  selected={played}
                  onPress={() => onMark('played', !played)}
                />
                <TvButton
                  round
                  title={favourite ? 'Remove from Favourites' : 'Add to Favourites'}
                  icon={favourite ? 'heart.fill' : 'heart'}
                  selected={favourite}
                  onPress={() => onMark('favourite', !favourite)}
                />
              </TvFocusRow>
            </View>
            {credits.length > 0 && (
              <View testID="tv-credits" style={styles.credits}>
                {credits.map(({ label, names }) => (
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
          {children}
        </ScrollView>
      </ColorsContext.Provider>
      <ActionSheet visible={aboutOpen} title={title} closeLabel="Done" onClose={() => setAboutOpen(false)}>
        <Text style={tv.type.body}>{overview}</Text>
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
