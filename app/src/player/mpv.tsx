// SPDX-License-Identifier: GPL-3.0-or-later
// mpv engine behind the PlayerEngine contract - the only file that imports modules/mpv (docs/context/player.md).
// Engine issues handled here (docs/test-plans/mpv.md): I3 stale first progress after a new load, I4 same URL ignored,
// I8 end of file (mpv stays paused on the last frame; a seek alone doesn't resume it).
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet } from 'react-native';

import { MpvPlayerView, type MpvPlayerViewRef, type VideoSource } from '../../modules/mpv';
import type { PlayerProps, PlayerRef, Track } from './Player';

// Native calls reject when the view is gone or mpv is reloading - nothing to do about it here.
const ignore = () => {};

const track = ({ id, lang, title, codec }: Track): Track => ({ id, lang, title, codec });

export const MpvPlayer = forwardRef<PlayerRef, PlayerProps>(function MpvPlayer(props, ref) {
  const { source, paused = false, audioTrack, subtitleTrack, speed = 1, subtitleScale = 1 } = props;
  const view = useRef<MpvPlayerViewRef>(null);
  // Latest props for event handlers and loads, without making them effect dependencies.
  const latest = useRef(props);
  latest.current = props;
  // Bumped per load; progress is dropped until that load's tracks are ready (I3), late answers of an older load too.
  const load = useRef(0);
  const ready = useRef(false);
  // mpv fires tracks-ready several times per load (each track-list change, again after the file loaded): one onLoad.
  const loadedFor = useRef(-1);
  const lastUrl = useRef<string | undefined>(undefined);
  // At the end of the file (I8): mpv sits paused on the last frame; a seek moves away from it.
  const ended = useRef(false);
  // Of the current load: from its tracks-ready, then progress.
  const fileDuration = useRef(0);

  // Play at the end replays from the start.
  const play = () => {
    if (ended.current) {
      ended.current = false;
      view.current?.seekTo(0).catch(ignore);
    }
    view.current?.play().catch(ignore);
  };
  const seek = (s: number) => {
    ended.current = false;
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
    return {
      url: source.uri,
      headers: source.headers,
      externalSubtitles: externalSubs?.map((s) => s.uri),
      startPosition: start,
      autoplay: !p,
      initialAudioId: audio,
      initialSubtitleId: sub,
    };
  }, [source]);

  useEffect(() => {
    load.current++;
    ended.current = false;
    fileDuration.current = 0;
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
  // Speed and subtitle size are mpv-wide (they survive a new load): applied on every change, the first one included.
  useEffect(() => {
    view.current?.setSpeed(speed).catch(ignore);
  }, [speed]);
  useEffect(() => {
    view.current?.setSubtitleScale(subtitleScale).catch(ignore);
  }, [subtitleScale]);

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
    const player = view.current;
    if (!player) return;
    try {
      const [audio, subs, duration] = await Promise.all([
        player.getAudioTracks(),
        player.getSubtitleTracks(),
        player.getDuration(),
      ]);
      if (mine !== load.current || loadedFor.current === mine) return;
      ready.current = true;
      loadedFor.current = mine;
      fileDuration.current = duration;
      // Again per load: Android creates its renderer only now, so the calls from the effects above may have gone nowhere.
      const { speed: s = 1, subtitleScale: scale = 1 } = latest.current;
      player.setSpeed(s).catch(ignore);
      player.setSubtitleScale(scale).catch(ignore);
      latest.current.onLoad?.({ duration, audio: audio.map(track), subs: subs.map(track) });
    } catch {
      if (mine === load.current) ready.current = true;
    }
  }

  return (
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
      onError={({ nativeEvent }) => latest.current.onError?.(nativeEvent.error)}
      onPlaybackEnd={() => {
        // Not gated on playing: mpv pauses itself at EOF. Once per end (a native reload at the end fires it again).
        if (!ready.current || ended.current) return;
        ended.current = true;
        // Progress is throttled (~1 s): the end lands on the duration.
        const d = fileDuration.current;
        if (d > 0) latest.current.onProgress?.({ position: d, duration: d });
        latest.current.onEnd?.();
      }}
    />
  );
});
