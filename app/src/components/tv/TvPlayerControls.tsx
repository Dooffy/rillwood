// SPDX-License-Identifier: GPL-3.0-or-later
// Apple TV player controls (screen draft 10). Top: the title over a dark fade - no close or zoom buttons (Back closes,
// TV always fits). Bottom (`TvPlayerBar`): the scrubber with elapsed, -remaining and "Ends at", a swipe's preview time
// over the playhead, and the track buttons above it (Subtitles, Audio, Speed - the same menus as the phone's).
// The remote does the rest (`useTvRemote`): click = play / pause, Left / Right = 10 s, swipe = scrub.
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { formatClock, formatEndsAt } from '@/format';
import { useProgress, type ProgressStore } from '@/player/progress';
import { onArtwork, tv, useColors } from '@/theme';

import type { PlayerControlsProps } from '../PlayerControls';
import type { TracksPage } from '../TracksMenu';
import { Text } from '../Text';
import { restoreFocus } from './focus';
import { TvButton, type TvButtonHandle } from './TvButton';

/** Top of the screen: the title (and episode line) over a fade. Same props as the phone's controls. */
export function TvPlayerControls({ title, subtitle, paused, started }: PlayerControlsProps) {
  const c = useColors();
  return (
    <View testID="tv-player-top" style={styles.top} pointerEvents="none">
      <View style={[StyleSheet.absoluteFill, styles.fadeTop]} />
      <View style={styles.titleRow}>
        {started && paused && <SymbolView name="pause.fill" tintColor={c.text} size={tv.icon.round} />}
        <View style={styles.titles}>
          {title !== undefined && (
            <Text numberOfLines={1} style={tv.type.shelf}>
              {title}
            </Text>
          )}
          {subtitle !== undefined && (
            <Text numberOfLines={1} secondary style={tv.type.body}>
              {subtitle}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

export type TvPlayerBarProps = {
  progress: ProgressStore;
  /** A swipe in progress: where it would land. */
  preview?: number;
  /** Playback speed: "Ends at" follows it; the Speed button shows it. */
  speed: number;
  /** A subtitle track is on: the CC button is filled. */
  subtitlesOn: boolean;
  paused: boolean;
  onTogglePause: () => void;
  /** A track button: its menu page. */
  onPage: (page: TracksPage) => void;
  /**
   * The menu's page while it's open: the bar can't take focus then (focus stays in the menu - a small menu above the
   * buttons doesn't hold it on its own), and gets it back on the button that opened it when it closes.
   */
  menu: TracksPage | null;
  /** Focus moved: true on the scrubber, false on a button (Left / Right seek only on the scrubber). */
  onScrubberFocus: (on: boolean) => void;
  /** The bar's height (buttons + scrubber): the tracks menu opens above it. */
  onHeight?: (height: number) => void;
};

/** Bottom of the screen: track buttons, then the scrubber. */
export function TvPlayerBar({
  progress,
  preview,
  speed,
  subtitlesOn,
  paused,
  onTogglePause,
  onPage,
  menu,
  onScrubberFocus,
  onHeight,
}: TvPlayerBarProps) {
  const c = useColors();
  const { position, duration } = useProgress(progress);
  const at = preview ?? position;
  const fraction = duration > 0 ? Math.min(Math.max(at / duration, 0), 1) : 0;
  const left = Math.max(duration - at, 0);
  const endsAt = formatEndsAt(left / (speed || 1));
  const free = menu === null;
  // The button the open menu came from (Subtitle Timing is a Subtitles page); focus goes back to it once the menu closes
  // and the bar is focusable again - the menu's own hand-back runs before that.
  const refs = useRef<Partial<Record<TracksPage, TvButtonHandle | null>>>({});
  const opener = useRef<TracksPage | null>(null);
  useEffect(() => {
    if (menu !== null) {
      opener.current ??= menu === 'timing' ? 'subtitles' : menu;
      return;
    }
    if (opener.current) restoreFocus(refs.current[opener.current] ?? null);
    opener.current = null;
  }, [menu]);
  // Round, like the detail screen's: CC (filled while subtitles are on), audio track (a waveform - a speaker reads as
  // volume), the speed as text in its circle.
  const button = (
    page: TracksPage,
    props: { title: string; icon?: SymbolViewProps['name']; label?: string; on?: boolean },
  ) => (
    <TvButton
      ref={(view) => {
        refs.current[page] = view;
      }}
      round
      focusable={free}
      title={props.title}
      icon={props.icon}
      accessibilityLabel={props.label ?? props.title}
      selected={props.on}
      onPress={() => onPage(page)}
      onFocus={() => onScrubberFocus(false)}
    />
  );
  return (
    <View testID="tv-player-bar" style={styles.bottom} onLayout={(e) => onHeight?.(e.nativeEvent.layout.height)}>
      <View style={[StyleSheet.absoluteFill, styles.fadeBottom]} pointerEvents="none" />
      <View style={styles.buttons}>
        {button('subtitles', {
          title: 'Subtitles',
          icon: 'captions.bubble',
          label: `Subtitles, ${subtitlesOn ? 'on' : 'off'}`,
          on: subtitlesOn,
        })}
        {button('audio', { title: 'Audio', icon: 'waveform' })}
        {button('speed', { title: `${speed}×`, label: `Speed, ${speed}×` })}
      </View>
      {/* The scrubber: focus starts here; a click plays / pauses, Left / Right and swipes move the playhead. */}
      <Pressable
        testID="tv-scrubber"
        hasTVPreferredFocus
        focusable={free}
        accessibilityRole="adjustable"
        accessibilityLabel={paused ? 'Paused' : 'Playing'}
        accessibilityValue={{ text: `${formatClock(at)} of ${formatClock(duration)}` }}
        onFocus={() => onScrubberFocus(true)}
        onPress={onTogglePause}
        style={styles.scrubber}
      >
        {({ focused }) => (
          <>
            <View style={styles.trackArea}>
              {preview !== undefined && (
                <Text style={[tv.type.button, styles.preview, { left: `${fraction * 100}%` }]}>
                  {formatClock(preview)}
                </Text>
              )}
              <View
                style={[
                  styles.track,
                  { height: focused ? tv.player.trackFocused : tv.player.track, backgroundColor: onArtwork.track },
                ]}
              >
                <View style={[styles.fill, { width: `${fraction * 100}%`, backgroundColor: onArtwork.fill }]} />
              </View>
              <View
                style={[
                  styles.playhead,
                  { left: `${fraction * 100}%`, backgroundColor: c.text },
                  !focused && styles.dim,
                ]}
              />
            </View>
            <View style={styles.times}>
              <Text style={[tv.type.caption, styles.tabular, styles.onVideo]}>{formatClock(at)}</Text>
              <Text style={[tv.type.caption, styles.tabular, styles.onVideo]}>
                {[`-${formatClock(left)}`, endsAt].filter(Boolean).join(' · ')}
              </Text>
            </View>
          </>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { position: 'absolute', top: 0, left: 0, right: 0, height: tv.player.controlsHeight },
  fadeTop: { backgroundImage: 'linear-gradient(to bottom, rgba(0, 0, 0, 0.7) 0%, rgba(0, 0, 0, 0) 100%)' },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tv.gap.sm,
    paddingHorizontal: tv.margin,
    paddingTop: tv.marginTop,
  },
  titles: { flexShrink: 1, gap: tv.gap.sm / 4 },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: tv.margin,
    paddingBottom: tv.marginTop,
    gap: tv.gap.sm,
  },
  // Dark behind the buttons and times, reaching above the buttons: readable over a bright picture.
  fadeBottom: {
    top: -tv.player.fadeAbove,
    backgroundImage: 'linear-gradient(to top, rgba(0, 0, 0, 0.85) 0%, rgba(0, 0, 0, 0.6) 60%, rgba(0, 0, 0, 0) 100%)',
  },
  buttons: { flexDirection: 'row', justifyContent: 'flex-end', gap: tv.gap.sm },
  scrubber: { gap: tv.gap.sm / 2, paddingTop: tv.gap.lg },
  trackArea: { justifyContent: 'center', height: tv.player.playhead },
  track: { borderRadius: tv.player.trackFocused, overflow: 'hidden' },
  fill: { height: '100%' },
  playhead: {
    position: 'absolute',
    width: tv.player.playhead,
    height: tv.player.playhead,
    borderRadius: tv.player.playhead,
    marginLeft: -tv.player.playhead / 2,
  },
  dim: { opacity: 0 },
  preview: {
    position: 'absolute',
    bottom: tv.player.playhead + tv.gap.sm / 2,
    width: tv.player.previewWidth,
    marginLeft: -tv.player.previewWidth / 2,
    textAlign: 'center',
  },
  times: { flexDirection: 'row', justifyContent: 'space-between' },
  tabular: { fontVariant: ['tabular-nums'] },
  // White over the video whatever the theme (the screen's palette is already dark; this keeps it explicit).
  onVideo: { color: onArtwork.fill },
});
