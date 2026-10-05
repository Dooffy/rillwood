// SPDX-License-Identifier: GPL-3.0-or-later
import { router, useLocalSearchParams } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet, useWindowDimensions, View } from 'react-native';
import {
  GestureDetector,
  GestureHandlerRootView,
  useExclusiveGestures,
  usePanGesture,
  useTapGesture,
} from 'react-native-gesture-handler';

import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { ApiError, getPlaybackInfo, type BaseItemDto } from '@/api';
import { Glass } from '@/components/Glass';
import { Message } from '@/components/Message';
import { PlayerControls } from '@/components/PlayerControls';
import { Spinner } from '@/components/Spinner';
import { Text } from '@/components/Text';
import { TracksMenu, type TracksPage, type TracksValue } from '@/components/TracksMenu';
import { cardTitles, isItemId, itemDetail } from '@/items';
import { playbackInfoBody, playErrorMessage, playSource, type PlaySource } from '@/playback';
import {
  HIDE_AFTER_MS,
  PULL_CLOSE_DISTANCE,
  SEEK_STEP,
  seekTarget,
  shouldClose,
  subtitleScaleFor,
} from '@/player/controls';
import { Player, type PlayerRef } from '@/player/Player';
import { createProgress } from '@/player/progress';
import { useReporting } from '@/player/useReporting';
import { connectionFor, getSession, useSession } from '@/session';
import { ColorsContext, palettes, radii, spacing } from '@/theme';
import { useFetch } from '@/useFetch';

type State =
  { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; play: PlaySource; start: number };

const PLAYBACK_FAILED = "Couldn't play this video.";
// mpv sends no error when a file fails to open (docs/test-plans/mpv.md I15): no load in this long = failed.
const LOAD_TIMEOUT_MS = 30_000;

// Always dark, whatever the Appearance setting. Loads the play source (docs/context/player.md), then plays it full
// screen, Apple TV style: no chrome until a tap; tap toggles the controls (auto-hide), double-tap left / right seeks
// ±10s, pull down closes (the video follows the finger and the screen below shows through). Rotates freely (the rest of
// the app is portrait).
export default function PlayerScreen() {
  const { id, start } = useLocalSearchParams<{ id?: string; start?: string }>();
  const accountId = useSession().active?.id;
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [attempt, setAttempt] = useState(0);
  // Answer of the latest request; anything else (new item, account, Retry) shows the spinner until it lands.
  const key = `${accountId}|${id}|${attempt}`;
  const [loaded, setLoaded] = useState<{ key: string; state: State }>();
  // Position + duration outside state; a load starts at the route's start, then (Retry) at the last position seen.
  const [progress] = useState(() => createProgress(Number(start) || 0));
  // Key of the load the player has reported (`onLoad`); the spinner stays over the video until then.
  const [started, setStarted] = useState<string>();
  const player = useRef<PlayerRef>(null);
  const [paused, setPaused] = useState(false);
  const [shown, setShown] = useState(true);
  const [scrubbing, setScrubbing] = useState(false);
  // Tracks menu page (null = closed) and the choices made in it; until a choice, the server's defaults. Choices outlive
  // a Retry (same item); speed and subtitle size apply to whatever plays.
  const [menu, setMenu] = useState<TracksPage | null>(null);
  const [choice, setChoice] = useState<Partial<TracksValue>>({});
  // Bumped on ±10 s: restarts the auto-hide timer (pause and scrubbing are timer deps already).
  const [touched, setTouched] = useState(0);
  const screenReader = useScreenReader();
  // Pull-down distance (UI thread) + whether a release now would close (drives the hint).
  const pull = useSharedValue(0);
  const pastClose = useSharedValue(false);
  const [releaseHint, setReleaseHint] = useState(false);

  const item = useFetch<BaseItemDto>(isItemId(id) ? itemDetail(id).path : null).data;
  const titles = item ? cardTitles(item) : undefined;

  const state: State = !isItemId(id)
    ? { status: 'error', message: playErrorMessage('none') }
    : loaded?.key === key
      ? loaded.state
      : { status: 'loading' };
  const ready = state.status === 'ready';
  const playing = ready && started === key;
  const play = state.status === 'ready' ? state.play : undefined;
  const tracks: TracksValue = {
    audio: choice.audio ?? play?.defaultAudio,
    subtitle: choice.subtitle ?? play?.defaultSubtitle ?? -1,
    speed: choice.speed ?? 1,
    subtitleScale: choice.subtitleScale ?? 1,
  };

  // The only screen that rotates: unlocked while open, back to upright portrait on leave.
  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.DEFAULT).catch(() => {});
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    };
  }, []);

  useEffect(() => {
    const account = getSession().active;
    const conn = account && account.id === accountId ? connectionFor(account) : null;
    // Signed out: the root layout leaves for Welcome.
    if (!conn || !isItemId(id)) return;
    const done = (next: State) => setLoaded({ key, state: next });
    const controller = new AbortController();
    getPlaybackInfo(conn, id, playbackInfoBody(), controller.signal)
      .then((info) => {
        if (!info) throw new ApiError('parse');
        const result = playSource(conn, id, info);
        done(
          result.ok
            ? { status: 'ready', play: result.play, start: progress.get().position }
            : { status: 'error', message: playErrorMessage(result.problem) },
        );
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        done({ status: 'error', message: playErrorMessage(e instanceof ApiError ? e : new ApiError('network')) });
      });
    return () => controller.abort();
  }, [key, accountId, id, progress]);

  useEffect(() => {
    if (!ready || started === key) return;
    const timer = setTimeout(
      () => setLoaded({ key, state: { status: 'error', message: PLAYBACK_FAILED } }),
      LOAD_TIMEOUT_MS,
    );
    return () => clearTimeout(timer);
  }, [ready, started, key]);

  // Auto-hide while playing; paused, scrubbing, the tracks menu or VoiceOver keep the controls up.
  const menuOpen = menu !== null;
  useEffect(() => {
    if (!shown || !playing || paused || scrubbing || menuOpen || screenReader) return;
    const timer = setTimeout(() => setShown(false), HIDE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [shown, playing, paused, scrubbing, menuOpen, screenReader, touched]);

  // Jellyfin sees the session: start once mpv loaded the file, progress every 10 s / pause / seek, stop on leave.
  const { seeked } = useReporting({
    accountId,
    itemId: isItemId(id) ? id : undefined,
    play,
    started: playing,
    paused,
    progress,
  });

  const close = () => router.back();
  // The menu closes with the failed load; it mustn't reopen once the retry plays.
  const retry = () => {
    setMenu(null);
    setAttempt((n) => n + 1);
  };
  const touch = () => setTouched((n) => n + 1);
  const seek = (seconds: number) => {
    const to = seekTarget(seconds, progress.get().duration);
    player.current?.seek(to);
    progress.set({ position: to });
    seeked();
  };
  const seekBy = (delta: number) => seek(progress.get().position + delta);

  // Only while playing: before that the top bar is always up, and a tap here would swallow Retry's press.
  const tap = useTapGesture({
    testID: 'player-tap',
    runOnJS: true,
    enabled: playing,
    onActivate: () => setShown((v) => !v),
  });
  const doubleTap = useTapGesture({
    testID: 'player-double-tap',
    runOnJS: true,
    numberOfTaps: 2,
    enabled: playing,
    onActivate: (e) => seekBy(e.absoluteX < width / 2 ? -SEEK_STEP : SEEK_STEP),
  });
  // Runs on the UI thread: the video tracks the finger without a JS round trip.
  const pullDown = usePanGesture({
    testID: 'player-pull',
    // Down only; a sideways drag fails it (the scrubber, later horizontal gestures).
    activeOffsetY: 15,
    failOffsetX: [-20, 20],
    onActivate: () => {
      'worklet';
      scheduleOnRN(setShown, false);
    },
    onUpdate: (e) => {
      'worklet';
      pull.value = Math.max(e.translationY, 0);
      const past = e.translationY > PULL_CLOSE_DISTANCE;
      if (past !== pastClose.value) {
        pastClose.value = past;
        scheduleOnRN(setReleaseHint, past);
      }
    },
    onDeactivate: (e) => {
      'worklet';
      if (pastClose.value) {
        pastClose.value = false;
        scheduleOnRN(setReleaseHint, false);
      }
      if (shouldClose(e.translationY, e.velocityY)) {
        // Finish the slide-out, then leave (the modal is already see-through by then).
        pull.value = withTiming(height, { duration: 180 }, () => scheduleOnRN(close));
      } else {
        pull.value = withSpring(0, { damping: 22, stiffness: 220 });
      }
    },
  });
  // Pull first, then a double tap, then a single tap (which waits for the double to fail).
  const gestures = useExclusiveGestures(pullDown, doubleTap, tap);

  // The video shrinks, fades and rounds its corners as it follows the finger - a card lifting off, not a black slab
  // (mpv's view is black around the picture); the black behind it fades out to show the screen below.
  const videoStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pull.value, [0, PULL_CLOSE_DISTANCE * 3], [1, 0.35], Extrapolation.CLAMP),
    borderRadius: interpolate(pull.value, [0, PULL_CLOSE_DISTANCE], [0, radii.cardLarge], Extrapolation.CLAMP),
    transform: [
      { translateY: pull.value },
      { scale: interpolate(pull.value, [0, height], [1, 0.75], Extrapolation.CLAMP) },
    ],
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pull.value, [0, PULL_CLOSE_DISTANCE * 2.5], [1, 0], Extrapolation.CLAMP),
  }));
  const controlsUp = shown || !playing;

  return (
    // Own root: gestures in a native modal need one (Android).
    <GestureHandlerRootView style={styles.root}>
      <ColorsContext.Provider value={palettes.dark}>
        <StatusBar style="light" hidden={!controlsUp} />
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]} pointerEvents="none" />
        <GestureDetector gesture={gestures}>
          <Animated.View
            style={[styles.root, styles.clip, videoStyle]}
            accessible={playing && !controlsUp}
            accessibilityLabel="Video"
            accessibilityHint="Shows the player controls"
            onAccessibilityTap={() => setShown(true)}
            onAccessibilityEscape={close}
          >
            {state.status === 'ready' && (
              <Player
                ref={player}
                source={state.play.source}
                externalSubs={state.play.externalSubs}
                startSeconds={state.start}
                paused={paused}
                audioTrack={tracks.audio}
                subtitleTrack={tracks.subtitle}
                speed={tracks.speed}
                subtitleScale={subtitleScaleFor(tracks.subtitleScale, height > width)}
                onLoad={(e) => {
                  progress.set({ duration: e.duration });
                  setStarted(key);
                }}
                onProgress={progress.set}
                onError={() => setLoaded({ key, state: { status: 'error', message: PLAYBACK_FAILED } })}
              />
            )}
            {state.status !== 'error' && !playing && <Spinner fill />}
            {state.status === 'error' && <Message fill text={state.message} retry={retry} />}
          </Animated.View>
        </GestureDetector>
        {releaseHint && (
          <View style={[styles.hint, { top: insets.top + spacing.lg }]} pointerEvents="none">
            <Glass style={styles.hintPill}>
              <Text variant="label">Release to close</Text>
            </Glass>
          </View>
        )}
        {controlsUp && (
          <PlayerControls
            title={titles?.title}
            subtitle={titles?.subtitle}
            started={playing}
            paused={paused}
            progress={progress}
            onClose={close}
            onTracks={() => setMenu('main')}
            onTogglePause={() => setPaused((p) => !p)}
            onSeekBy={(delta) => {
              touch();
              seekBy(delta);
            }}
            onSeek={seek}
            onScrub={setScrubbing}
          />
        )}
        {play && (
          <TracksMenu
            page={menu}
            onPage={setMenu}
            audio={play.audio}
            subtitles={play.subtitles}
            value={tracks}
            onChange={(next) => setChoice((c) => ({ ...c, ...next }))}
          />
        )}
      </ColorsContext.Provider>
    </GestureHandlerRootView>
  );
}

/** VoiceOver / TalkBack on: the controls never hide (no tap-to-show without sight). */
function useScreenReader(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isScreenReaderEnabled()
      .then(setOn)
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', setOn);
    return () => sub.remove();
  }, []);
  return on;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  // Rounded corners clip the video while it's pulled.
  clip: { overflow: 'hidden' },
  // The modal itself is transparent (root layout): this black is what fades on pull.
  backdrop: { backgroundColor: palettes.dark.background },
  hint: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  hintPill: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.pill },
});
