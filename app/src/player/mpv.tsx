// SPDX-License-Identifier: GPL-3.0-or-later
// mpv engine behind the PlayerEngine contract - the only file that imports modules/mpv (docs/context/player.md).
// Engine issues handled here (docs/test-plans/mpv.md): I3 stale first progress after a new load, I4 same URL ignored,
// I8 end of file (mpv stays paused on the last frame; a seek alone doesn't resume it), I11 early end of a stream after a
// long network drop (reloaded at that position), iOS subtitles sized to the picture (`frameSubtitleScale`).
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { MpvPlayerView, type MpvPlayerViewRef, type SubtitleTrack, type VideoSource } from '../../modules/mpv';
import type { PlayerProps, PlayerRef, Track, VideoZoom } from './Player';

// Native calls reject when the view is gone or mpv is reloading - nothing to do about it here.
const ignore = () => {};

// An end further than this before the duration is an early end (I11): the stream gave up, not the file.
const EARLY_END_SECONDS = 5;
// Demuxer cache caps (MiB) - mpv's 150 / 50 default is too much memory for 4K remuxes.
const CACHE = { maxBytes: 100, maxBackBytes: 32 };

const track = ({ id, lang, title, codec }: Track): Track => ({ id, lang, title, codec });
const subTrack = ({ external, externalFilename, ...t }: SubtitleTrack): Track => ({
  ...track(t),
  // A sidecar mpv gave no filename can't be matched, but it isn't one of the file's own tracks either.
  ...(external && { external: externalFilename ?? '' }),
});

/**
 * iOS draws subtitles into the picture, sized to its height; Android sizes them to the view in landscape. Scale that sizes
 * the iOS text to the view's height in landscape too: up on a picture shorter than the view (2.39:1 fitted), down on one
 * taller (fill on a narrower picture). Portrait, unknown shape or size: 1.
 */
export function frameSubtitleScale(
  frame: { width: number; height: number } | undefined,
  aspect: number | undefined,
  zoom: VideoZoom,
): number {
  if (!frame || !aspect || frame.width <= frame.height) return 1;
  const widthBound = frame.width / aspect;
  const picture = zoom === 'fill' ? Math.max(frame.height, widthBound) : Math.min(frame.height, widthBound);
  // Rounded: a rotation lays the view out a few times on its way.
  return Math.round(Math.min(2, Math.max(0.5, frame.height / picture)) * 100) / 100;
}

export const MpvPlayer = forwardRef<PlayerRef, PlayerProps>(function MpvPlayer(props, ref) {
  const {
    source,
    paused = false,
    audioTrack,
    subtitleTrack,
    speed = 1,
    subtitleScale = 1,
    subtitleDelay = 0,
    subtitleStyle,
    zoom = 'fit',
    aspect,
  } = props;
  const view = useRef<MpvPlayerViewRef>(null);
  const [frame, setFrame] = useState<{ width: number; height: number }>();
  // Measured on iOS only (`frameSubtitleScale`); Android stays at the scale given.
  const textScale = subtitleScale * frameSubtitleScale(frame, aspect, zoom);
  const latestTextScale = useRef(textScale);
  latestTextScale.current = textScale;
  // Latest props for event handlers and loads, without making them effect dependencies.
  const latest = useRef(props);
  latest.current = props;
  // Bumped per load; progress is dropped until that load's tracks are ready (I3), late answers of an older load too.
  const load = useRef(0);
  const ready = useRef(false);
  // mpv fires tracks-ready several times per load (each track-list change, again after the file loaded): one onLoad.
  const loadedFor = useRef(-1);
  // The load whose file is open (native ready-to-seek, after the sidecars were added): its track list is final. And the
  // load whose final list went out (`onTracks`, once).
  const openFor = useRef(-1);
  const tracksFor = useRef(-1);
  const lastUrl = useRef<string | undefined>(undefined);
  // At the end of the file (I8): mpv sits paused on the last frame; a seek moves away from it.
  const ended = useRef(false);
  // Of the current load: from its tracks-ready, then progress.
  const fileDuration = useRef(0);
  // Where the current load started playing: its start, then our last seek (I11: an early end right there is no progress).
  const startedAt = useRef(0);
  // The end is being checked (async position): a second end event meanwhile is the same end.
  const checkingEnd = useRef(false);
  // I11: an early end reloads the source at that position (`reload: true` - the native view skips a source with the URL
  // it already has).
  const [reload, setReload] = useState<{ source: PlayerProps['source']; at: number }>();

  // Play at the end replays from the start.
  const play = () => {
    if (ended.current) {
      ended.current = false;
      startedAt.current = 0;
      view.current?.seekTo(0).catch(ignore);
    }
    view.current?.play().catch(ignore);
  };
  const seek = (s: number) => {
    ended.current = false;
    startedAt.current = s;
    view.current?.seekTo(s).catch(ignore);
  };

  // A new `source` object = a new load (only that). Start, autoplay, sidecar subs and first tracks come from the props
  // at that moment.
  const videoSource = useMemo<VideoSource>(() => {
    const {
      startSeconds: start = 0,
      paused: p = false,
      audioTrack: audio,
      subtitleTrack: sub,
      externalSubs,
    } = latest.current;
    const resume = reload?.source === source ? reload.at : undefined;
    return {
      url: source.uri,
      headers: source.headers,
      externalSubtitles: externalSubs?.map((s) => s.uri),
      startPosition: resume ?? start,
      autoplay: !p,
      initialAudioId: audio,
      initialSubtitleId: sub,
      cacheConfig: CACHE,
      ...(resume !== undefined && { reload: true }),
    };
  }, [source, reload]);

  useEffect(() => {
    load.current++;
    ended.current = false;
    fileDuration.current = 0;
    startedAt.current = videoSource.startPosition ?? 0;
    // I4: the native view ignores a source with the URL it already plays - restart it ourselves (the file and its
    // sidecar subs stay loaded) and report the load again.
    const player = view.current;
    if (player && lastUrl.current === videoSource.url) {
      const { startPosition = 0, autoplay, initialAudioId, initialSubtitleId } = videoSource;
      player.seekTo(startPosition).catch(ignore);
      (autoplay ? player.play() : player.pause()).catch(ignore);
      if (initialAudioId !== undefined) player.setAudioTrack(initialAudioId).catch(ignore);
      if (initialSubtitleId !== undefined) {
        (initialSubtitleId < 0 ? player.disableSubtitles() : player.setSubtitleTrack(initialSubtitleId)).catch(ignore);
      }
      // Same file, its sidecars long added.
      openFor.current = load.current;
      tracksReady();
    } else {
      // Progress and the end wait for this load's tracks (an EOF of the previous file can still arrive).
      ready.current = false;
    }
    lastUrl.current = videoSource.url;
  }, [videoSource]);

  // Changes after the load; the first values went in with the source.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) return;
    if (paused) view.current?.pause().catch(ignore);
    else play();
  }, [paused]);
  useEffect(() => {
    if (!mounted.current || audioTrack === undefined) return;
    view.current?.setAudioTrack(audioTrack).catch(ignore);
  }, [audioTrack]);
  useEffect(() => {
    if (!mounted.current || subtitleTrack === undefined) return;
    (subtitleTrack < 0 ? view.current?.disableSubtitles() : view.current?.setSubtitleTrack(subtitleTrack))?.catch(
      ignore,
    );
  }, [subtitleTrack]);
  // Declared after the three effects above, so their first run still sees `mounted` false.
  // No `destroy()` on unmount: the native view tears mpv down itself (iOS deinit, Android detach). `destroy()` is for
  // reusing a view - on iOS it stops mpv and starts a fresh handle, wasted work right before the view goes away.
  useEffect(() => {
    mounted.current = true;
  }, []);
  // Speed, subtitle size, style, timing and zoom are mpv-wide (they survive a new load): applied on every change, the
  // first one included.
  useEffect(() => {
    view.current?.setSpeed(speed).catch(ignore);
  }, [speed]);
  useEffect(() => {
    view.current?.setSubtitleScale(textScale).catch(ignore);
  }, [textScale]);
  useEffect(() => {
    if (subtitleStyle) view.current?.setSubtitleStyle(subtitleStyle).catch(ignore);
  }, [subtitleStyle]);
  useEffect(() => {
    view.current?.setSubtitleDelay(subtitleDelay).catch(ignore);
  }, [subtitleDelay]);
  useEffect(() => {
    view.current?.setZoomedToFill(zoom === 'fill').catch(ignore);
  }, [zoom]);

  useImperativeHandle(
    ref,
    () => ({
      seek,
      play,
      pause: () => view.current?.pause().catch(ignore),
    }),
    // `play` / `seek` only read refs.
    [],
  );

  async function tracksReady() {
    const mine = load.current;
    // Only a read started after the file opened has the full list.
    const final = openFor.current === mine;
    const player = view.current;
    if (!player) return;
    if (loadedFor.current === mine && (!final || tracksFor.current === mine)) return;
    try {
      const [audio, subs, duration] = await Promise.all([
        player.getAudioTracks(),
        player.getSubtitleTracks(),
        player.getDuration(),
      ]);
      if (mine !== load.current) return;
      const lists = { audio: audio.map(track), subs: subs.map(subTrack) };
      if (final && tracksFor.current !== mine) {
        tracksFor.current = mine;
        latest.current.onTracks?.(lists);
      }
      if (loadedFor.current === mine) return;
      ready.current = true;
      loadedFor.current = mine;
      fileDuration.current = duration;
      // Again per load: Android creates its renderer only now, so the calls from the effects above may have gone nowhere.
      const { speed: s = 1, subtitleDelay: d = 0, subtitleStyle: st, zoom: z } = latest.current;
      player.setSpeed(s).catch(ignore);
      player.setSubtitleScale(latestTextScale.current).catch(ignore);
      if (st) player.setSubtitleStyle(st).catch(ignore);
      player.setSubtitleDelay(d).catch(ignore);
      player.setZoomedToFill(z === 'fill').catch(ignore);
      // A pause made while this load started (autoplay was fixed at the source) still holds.
      if (latest.current.paused) player.pause().catch(ignore);
      latest.current.onLoad?.({ duration, ...lists });
    } catch {
      if (mine === load.current) ready.current = true;
    }
  }

  return (
    // The view's size, for the subtitle scale (the native view's props have no onLayout).
    <View
      testID="player-frame"
      style={StyleSheet.absoluteFill}
      onLayout={
        Platform.OS === 'ios'
          ? ({ nativeEvent: { layout } }) => setFrame({ width: layout.width, height: layout.height })
          : undefined
      }
    >
      <MpvPlayerView
        ref={view}
        source={videoSource}
        style={StyleSheet.absoluteFill}
        onTracksReady={tracksReady}
        onProgress={({ nativeEvent: { position, duration } }) => {
          if (!ready.current) return;
          fileDuration.current = duration;
          // Moved off the end without us (lock screen, Control Center): play is a plain play again.
          if (position < duration - 1) ended.current = false;
          latest.current.onProgress?.({ position, duration });
        }}
        // mpv's loading state: load, seek, paused for cache. The view only sends changes, in order, so the last one holds.
        onPlaybackStateChange={({ nativeEvent: { isLoading, isReadyToSeek } }) => {
          if (isLoading !== undefined) latest.current.onBuffering?.(isLoading);
          // Once per native load, after the file opened and its sidecars were added (or failed): read the full list.
          if (isReadyToSeek) {
            openFor.current = load.current;
            tracksReady();
          }
        }}
        onError={({ nativeEvent }) => latest.current.onError?.(nativeEvent.error)}
        // The engine already acted (lock screen, headphones, a call): the screen follows.
        onOutsidePause={({ nativeEvent: { isPaused } }) => latest.current.onPausedChange?.(isPaused)}
        onPlaybackEnd={async () => {
          // Not gated on playing: mpv pauses itself at EOF. Once per end (a native reload at the end fires it again).
          if (!ready.current || ended.current || checkingEnd.current) return;
          checkingEnd.current = true;
          const mine = load.current;
          // mpv's own position: progress is throttled and misses seeks made outside the app (lock screen).
          const at = await view.current?.getCurrentPosition().catch(() => undefined);
          checkingEnd.current = false;
          if (mine !== load.current || !ready.current || ended.current) return;
          const d = fileDuration.current;
          // I11: a stream that ended early reloads where it stopped; ending early again with no progress there is an error
          // (network still gone, or a file cut short), not an end - an end would mark it played.
          if (at !== undefined && at < d - EARLY_END_SECONDS) {
            if (reload?.source === source && at <= startedAt.current + EARLY_END_SECONDS) {
              latest.current.onError?.('Stream ended early');
              return;
            }
            // Until the reload's tracks are ready: no progress, no second end. The effect must not take the reload for
            // the same URL again (I4).
            ready.current = false;
            lastUrl.current = undefined;
            latest.current.onBuffering?.(true);
            setReload({ source, at });
            return;
          }
          ended.current = true;
          // Progress is throttled (~1 s): the end lands on the duration.
          if (d > 0) latest.current.onProgress?.({ position: d, duration: d });
          latest.current.onEnd?.();
        }}
      />
    </View>
  );
});
