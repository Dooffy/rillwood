// SPDX-License-Identifier: GPL-3.0-or-later
import { router, useLocalSearchParams } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import {
  GestureDetector,
  GestureHandlerRootView,
  useCompetingGestures,
  useExclusiveGestures,
  usePanGesture,
  usePinchGesture,
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

import { ApiError, getPlaybackInfo, isConnectionError, type BaseItemDto, type ItemsResult } from '@/api';
import { Glass } from '@/components/Glass';
import { Message, Offline } from '@/components/Message';
import { PlayerBottom, PlayerControls, PlayerScrubber, tracksAnchor } from '@/components/PlayerControls';
import { Spinner } from '@/components/Spinner';
import { Text } from '@/components/Text';
import { TracksMenu, type TracksPage, type TracksValue } from '@/components/TracksMenu';
import { UpNext } from '@/components/UpNext';
import { localCopy } from '@/downloads';
import { cardTitles, isItemId, nextEpisode, nextEpisodes, playback, TICKS_PER_SECOND } from '@/items';
import { holdPlaying } from '@/offload';
import { lockAppOrientation } from '@/orientation';
import {
  carryTracks,
  matchTracks,
  picksOf,
  playbackInfoBody,
  preferredTracks,
  localPlaySource,
  playErrorMessage,
  playSource,
  type EngineTrack,
  type PlaySource,
  type TrackPicks,
} from '@/playback';
import {
  HIDE_AFTER_MS,
  PIP_GRACE_MS,
  PULL_CLOSE_DISTANCE,
  SEEK_STEP,
  seekTarget,
  shouldClose,
  STALL_SPINNER_MS,
  subtitleScaleFor,
  videoFrame,
  zoomAfterPinch,
} from '@/player/controls';
import { Player, type PlayerRef, type VideoZoom } from '@/player/Player';
import { createProgress } from '@/player/progress';
import { useReporting } from '@/player/useReporting';
import { connectionFor, getSession, useSession } from '@/session';
import {
  getTrackPrefs,
  setVideoZoom,
  useAutoplayNext,
  useSubtitleScale,
  useSubtitleStyle,
  useVideoZoom,
} from '@/settings';
import { resumeRules } from '@/sync';
import { ColorsContext, palettes, radii, spacing, useWide } from '@/theme';
import { useDebounced } from '@/useDebounced';
import { useFetch } from '@/useFetch';
import { useItem } from '@/useItem';

// Tracks menu choices. Audio / subtitle are Jellyfin indexes of one file: kept with the id of the item they were picked
// on, ignored for any other. `picks` is what carries to the next episode: the picked tracks' language + label (subtitle
// null = off).
type Choice = Partial<TracksValue> & { id?: string; picks: TrackPicks };

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string; connection?: boolean }
  | { status: 'ready'; play: PlaySource; start: number };

const PLAYBACK_FAILED = "Couldn't play this video. Try again.";

// Always dark, whatever the Appearance setting. Loads the play source (docs/context/player.md), then plays it full
// screen, Apple TV style: no chrome until a tap; tap toggles the controls (auto-hide), double-tap left / right seeks
// ±10s, pull down closes (the video follows the finger and the screen below shows through). Episodes go on to the next
// one at the end (Up Next card in the last 30 s, unless hidden). Rotates freely (the rest of the app is portrait).
export default function PlayerScreen() {
  // `source`: the version to play (a Downloads row's), else the newest download or the server's default ('' = none).
  const params = useLocalSearchParams<{ id?: string; start?: string; source?: string }>();
  const { id, start } = params;
  const source = params.source || undefined;
  const accountId = useSession().active?.id;
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const wide = useWide();
  const [attempt, setAttempt] = useState(0);
  // Answer of the latest request; anything else (new item, account, Retry) shows the spinner until it lands.
  const key = `${accountId}|${id}|${source}|${attempt}`;
  const [loaded, setLoaded] = useState<{ key: string; state: State }>();
  // Position + duration outside state; a load starts at the route's start, then (Retry) at the last position seen.
  const [progress] = useState(() => createProgress(Number(start) || 0));
  // Key of the load the player has reported (`onLoad`); the spinner stays over the video until then.
  const [started, setStarted] = useState<string>();
  const player = useRef<PlayerRef>(null);
  const [paused, setPaused] = useState(false);
  // The engine's full track list of the load with this key: the real mpv ids (`matchTracks`), else the predicted ones.
  const [engineTracks, setEngineTracks] = useState<{ key: string; audio: EngineTrack[]; subs: EngineTrack[] }>();
  const [shown, setShown] = useState(true);
  const [scrubbing, setScrubbing] = useState(false);
  // Tracks menu page (null = closed) and the choices made in it; until a choice, the server's defaults. Choices outlive
  // a Retry (same item); speed applies to whatever plays, subtitle timing only to this item and subtitle track (each file
  // is off by its own amount). Subtitle size and style are phone settings (Settings → Subtitles).
  const [menu, setMenu] = useState<TracksPage | null>(null);
  const [choice, setChoice] = useState<Choice>({ picks: {} });
  const subtitleScale = useSubtitleScale();
  const subtitleStyle = useSubtitleStyle();
  // Fit or fill, remembered on the phone; only landscape zooms (a filled portrait screen would crop most of the picture).
  const zoomSetting = useVideoZoom();
  const landscape = width > height;
  const zoom: VideoZoom = landscape ? zoomSetting : 'fit';
  const picked: Partial<TracksValue> = choice.id === id ? choice : {};
  // Bumped on ±10 s: restarts the auto-hide timer (pause and scrubbing are timer deps already).
  const [touched, setTouched] = useState(0);
  // The engine waiting for data after playback started (stalled stream, reload): spinner over the video after a moment,
  // gone as soon as frames flow.
  const [waiting, setWaiting] = useState(false);
  const stalled = useDebounced(waiting, STALL_SPINNER_MS) && waiting;
  const screenReader = useScreenReader();
  // Pull-down distance (UI thread) + whether a release now would close (drives the hint).
  const pull = useSharedValue(0);
  const pastClose = useSharedValue(false);
  const [releaseHint, setReleaseHint] = useState(false);
  // A pull is on: the Up Next tile steps aside (glass can't fade with the video).
  const [pulling, setPulling] = useState(false);

  // A finished download of this item (`source`'s version first): played from the file (load effect).
  // Looked up again on Retry: a file gone meanwhile plays another downloaded version, else streams.
  const copy = useMemo(
    () => (accountId && isItemId(id) ? localCopy(accountId, id, source) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `attempt` (Retry) re-checks the disk
    [accountId, id, source, attempt],
  );
  // Names it (title, next episode): the server's item, else the one saved with a download - also while it loads.
  const named = useItem(id, attempt);
  const item = named.item ?? named.saved?.item;
  const titles = item ? cardTitles(item) : undefined;
  // The episode after this one, played at the end unless its Up Next card was hidden (id of the episode it was hidden on).
  const nextRequest = item ? nextEpisodes(item) : undefined;
  const nextList = useFetch<ItemsResult>(nextRequest?.path ?? null, { query: nextRequest?.query }).data;
  const [hiddenOn, setHiddenOn] = useState<string>();
  // Off: Up Next waits for a tap (Settings → Autoplay next episode).
  const autoplay = useAutoplayNext() === 'on';
  const next = id && hiddenOn !== id ? nextEpisode(nextList?.Items, id) : undefined;

  const state: State = !isItemId(id)
    ? { status: 'error', message: playErrorMessage('none') }
    : loaded?.key === key
      ? loaded.state
      : { status: 'loading' };
  const ready = state.status === 'ready';
  const playing = ready && started === key;
  const play = state.status === 'ready' ? state.play : undefined;
  const options = play && engineTracks?.key === key ? matchTracks(play, engineTracks) : play;
  // Picks made on an earlier episode, found again here by language (in the server's list: stable for the load, unlike
  // `options`); else the Settings playback defaults, which fall back to the server's (the user's Jellyfin language
  // preferences, or what was last played on this item).
  const carried = play ? carryTracks(play, choice.picks) : {};
  const preferred = play ? preferredTracks(play, getTrackPrefs()) : undefined;
  // A choice the file doesn't have (a sidecar that failed to load, a stream mpv dropped): first audio, subtitles off.
  const audio = picked.audio ?? carried.audio ?? preferred?.audio;
  const subtitle = picked.subtitle ?? carried.subtitle ?? preferred?.subtitle ?? -1;
  const audioTrack = options?.audio.find((t) => t.index === audio) ?? options?.audio[0];
  const subtitleTrack = options?.subtitles.find((t) => t.index === subtitle);
  const tracks: TracksValue = {
    audio: audioTrack?.index,
    subtitle: subtitleTrack?.index ?? -1,
    speed: choice.speed ?? 1,
    subtitleDelay: picked.subtitleDelay ?? 0,
  };

  // Auto-remove never takes the item away while it plays; watched by the server's rules (≥ 90%), its downloads are
  // watched from now. Cleanups run before any setup, so the position is still this item's on the way to the next episode.
  useEffect(() => {
    if (!accountId || !isItemId(id)) return;
    const release = holdPlaying(accountId, id);
    return () => {
      const { position, duration } = progress.get();
      release(duration > 0 && resumeRules(position * TICKS_PER_SECOND, duration * TICKS_PER_SECOND).watched);
    };
  }, [accountId, id, progress]);

  // The only screen that rotates on a phone: unlocked while open, back to the app's lock on leave (upright portrait on
  // phones, still free on tablets).
  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.DEFAULT).catch(() => {});
    return lockAppOrientation;
  }, []);

  // The next episode starts at its own start. Runs after the reporting cleanup (every cleanup runs before any setup),
  // so the finished episode's Stopped still carries its end position.
  const loadedId = useRef(id);
  useEffect(() => {
    if (loadedId.current === id) return;
    loadedId.current = id;
    progress.set({ position: Number(start) || 0, duration: 0 });
  }, [id, start, progress]);

  useEffect(() => {
    const account = getSession().active;
    // Signed out: the root layout leaves for Welcome.
    if (!account || account.id !== accountId || !isItemId(id)) return;
    const done = (next: State) => setLoaded({ key, state: next });
    // Downloaded: plays the file on the phone, no server or connection needed. Else streams.
    const local = copy && localPlaySource(copy);
    if (local) {
      done({ status: 'ready', play: local, start: progress.get().position });
      return;
    }
    const conn = connectionFor(account);
    if (!conn) return;
    const controller = new AbortController();
    getPlaybackInfo(conn, id, playbackInfoBody(source), controller.signal)
      .then((info) => {
        if (!info) throw new ApiError('parse');
        const result = playSource(conn, id, info, source);
        done(
          result.ok
            ? { status: 'ready', play: result.play, start: progress.get().position }
            : { status: 'error', message: playErrorMessage(result.problem) },
        );
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        // Out of reach and not downloaded: the offline state (Go to Downloads - what plays). Only a real network
        // failure says so - a bug in the chain isn't the server being away.
        done({
          status: 'error',
          message: playErrorMessage(e instanceof ApiError ? e : new ApiError('network')),
          connection: isConnectionError(e),
        });
      });
    return () => controller.abort();
  }, [key, accountId, id, source, progress, copy]);

  // Auto-hide while playing; paused, scrubbing, the tracks menu or VoiceOver keep the controls up.
  const menuOpen = menu !== null;
  useEffect(() => {
    if (!shown || !playing || paused || scrubbing || menuOpen || screenReader) return;
    const timer = setTimeout(() => setShown(false), HIDE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [shown, playing, paused, scrubbing, menuOpen, screenReader, touched]);

  // Leaving the app (home, lock, another app) pauses: back in the app, the controls are up and Play carries on. Not on
  // iOS `inactive` (Control Center, a notification pulled down). iOS: a playing video moves into picture in picture
  // instead - the engine starts it as the app is left (`onPipChange`); the pause waits PIP_GRACE_MS and only lands if
  // PiP didn't start. Lock-screen Play can resume audio.
  const pip = useRef(false);
  const away = useRef(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const leave = () => {
      if (pip.current) return;
      setPaused(true);
      setShown(true);
    };
    const sub = AppState.addEventListener('change', (state) => {
      clearTimeout(timer);
      away.current = state === 'background';
      if (!away.current) return;
      if (Platform.OS === 'ios') timer = setTimeout(leave, PIP_GRACE_MS);
      else leave();
    });
    return () => {
      sub.remove();
      clearTimeout(timer);
    };
  }, []);

  // Jellyfin sees the session: start once mpv loaded the file, progress every 10 s / pause / seek, stop on leave.
  const { seeked } = useReporting({
    accountId,
    itemId: isItemId(id) ? id : undefined,
    play,
    started: playing,
    paused,
    // What the user chose (or the defaults), not a fallback for a track that failed to load: the server remembers it.
    tracks: { audio, subtitle },
    progress,
  });

  const close = () => router.back();
  // The menu closes with the failed load; it mustn't reopen once the retry plays.
  const retry = () => {
    setMenu(null);
    setWaiting(false);
    setAttempt((n) => n + 1);
  };
  // Same screen, next item: the reporting hook stops the finished one, the load effect loads this one.
  const playNext = (episode: BaseItemDto) => {
    setMenu(null);
    setWaiting(false);
    setPaused(false);
    // The scrubber goes with the load: a drag cut short this way never reports its end.
    setScrubbing(false);
    // From its own resume point if it was started before.
    router.setParams({
      id: episode.Id,
      start: String(Math.floor(playback(episode).resumeSeconds ?? 0)),
      // Its default version: '' as a route param can't come back as the string "undefined".
      source: '',
    });
  };
  const touch = () => setTouched((n) => n + 1);
  const seek = (seconds: number) => {
    const to = seekTarget(seconds, progress.get().duration);
    player.current?.seek(to);
    progress.set({ position: to });
    seeked();
  };
  const seekBy = (delta: number) => seek(progress.get().position + delta);
  // ±10 s from the controls: also restarts their auto-hide.
  const skip = (delta: number) => {
    touch();
    seekBy(delta);
  };
  // From the button: also restarts the controls' auto-hide.
  const toggleZoom = () => {
    touch();
    setVideoZoom(zoom === 'fill' ? 'fit' : 'fill');
  };

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
    // Two fingers pinch (zoom), never pull.
    maxPointers: 1,
    // Down only; a sideways drag fails it (the scrubber, later horizontal gestures).
    activeOffsetY: 15,
    failOffsetX: [-20, 20],
    onActivate: () => {
      'worklet';
      scheduleOnRN(setShown, false);
      scheduleOnRN(setPulling, true);
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
      // A failed pull (a second finger landed: a pinch) springs back, however far or fast it went.
      if (!e.canceled && shouldClose(e.translationY, e.velocityY)) {
        // Finish the slide-out, then leave (the modal is already see-through by then).
        pull.value = withTiming(height, { duration: 180 }, () => scheduleOnRN(close));
      } else {
        pull.value = withSpring(0, { damping: 22, stiffness: 220 });
        scheduleOnRN(setPulling, false);
      }
    },
  });
  // Pinch apart = fill, together = fit (landscape only), on release.
  const pinch = usePinchGesture({
    testID: 'player-pinch',
    runOnJS: true,
    enabled: playing && landscape,
    onDeactivate: (e) => {
      // A pinch the system took over (Control Center, a call) changes nothing.
      if (e.canceled) return;
      const next = zoomAfterPinch(e.scale, zoom);
      if (next !== zoom) setVideoZoom(next);
    },
  });
  // Pull first, then a double tap, then a single tap (which waits for the double to fail); a pinch races them all.
  const taps = useExclusiveGestures(pullDown, doubleTap, tap);
  const gestures = useCompetingGestures(pinch, taps);

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
  const upNext =
    playing && next ? (
      <UpNext
        next={next}
        progress={progress}
        rate={paused || waiting ? 0 : tracks.speed}
        autoplay={autoplay}
        hidden={pulling}
        onPlay={() => playNext(next)}
        onHide={() => setHiddenOn(id)}
      />
    ) : null;

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
              // Fit keeps the picture clear of the notch / Dynamic Island; fill covers the screen.
              <View style={[StyleSheet.absoluteFill, videoFrame(insets, landscape, zoom)]}>
                <Player
                  ref={player}
                  source={state.play.source}
                  externalSubs={state.play.externalSubs}
                  startSeconds={state.start}
                  paused={paused}
                  audioTrack={audioTrack?.id}
                  subtitleTrack={subtitleTrack?.id ?? -1}
                  speed={tracks.speed}
                  subtitleScale={subtitleScaleFor(subtitleScale, !landscape)}
                  subtitleStyle={subtitleStyle}
                  subtitleDelay={tracks.subtitleDelay}
                  zoom={zoom}
                  aspect={state.play.aspect}
                  onLoad={(e) => {
                    progress.set({ duration: e.duration });
                    setStarted(key);
                  }}
                  onTracks={(e) => setEngineTracks({ key, ...e })}
                  onProgress={progress.set}
                  // The next episode, if any and autoplay is on; else the engine holds the last frame paused: show it
                  // as paused (the pause reports the end - played), controls up; Play replays from the start, Up Next
                  // (autoplay off) plays the next one.
                  onEnd={() => {
                    if (next && autoplay) return playNext(next);
                    setPaused(true);
                    setShown(true);
                  }}
                  // Lock screen, headphones, a call: the controls and the reports follow.
                  onPausedChange={setPaused}
                  // PiP closed while away stops there (nothing plays unseen); restored: back with the controls up. A restore
                  // may report the stop before the app is active again - still away after the grace = closed.
                  onPipChange={(active) => {
                    pip.current = active;
                    if (active) return;
                    setShown(true);
                    setTimeout(() => {
                      if (away.current && !pip.current) setPaused(true);
                    }, PIP_GRACE_MS);
                  }}
                  onBuffering={setWaiting}
                  onError={() => {
                    setWaiting(false);
                    setLoaded({ key, state: { status: 'error', message: PLAYBACK_FAILED } });
                  }}
                />
              </View>
            )}
            {state.status !== 'error' && (!playing || stalled) && <Spinner fill />}
            {state.status === 'error' &&
              (state.connection ? (
                <Offline header retry={retry} />
              ) : (
                <Message fill text={state.message} retry={retry} />
              ))}
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
            onClose={close}
            onTracks={() => setMenu('main')}
            zoom={zoom}
            onToggleZoom={landscape ? toggleZoom : undefined}
            onTogglePause={() => setPaused((p) => !p)}
            onSeekBy={skip}
          />
        )}
        {/* Up Next stays mounted while the controls come and go (the ring keeps running, announced once); the
            scrubber shows with the controls, under it. */}
        {playing && (controlsUp || upNext) && (
          <PlayerBottom>
            {upNext}
            {controlsUp && <PlayerScrubber progress={progress} onSeek={seek} onSeekBy={skip} onScrub={setScrubbing} />}
          </PlayerBottom>
        )}
        {options && (
          <TracksMenu
            page={menu}
            onPage={setMenu}
            // Tablets: under the button that opened it (the top bar's right end).
            anchor={wide ? tracksAnchor(insets) : undefined}
            audio={options.audio}
            subtitles={options.subtitles}
            value={tracks}
            onChange={(next) =>
              setChoice(({ speed, picks, ...tracksOf }) => ({
                speed,
                ...(tracksOf.id === id ? tracksOf : {}),
                ...next,
                // Another subtitle track (or off) is another file's timing: back in sync.
                ...(next.subtitle !== undefined && next.subtitle !== tracks.subtitle && { subtitleDelay: 0 }),
                id,
                picks: { ...picks, ...picksOf(options, next) },
              }))
            }
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
