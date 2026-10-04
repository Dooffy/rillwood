// SPDX-License-Identifier: GPL-3.0-or-later
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiError, getPlaybackInfo } from '@/api';
import { IconButton } from '@/components/IconButton';
import { Message } from '@/components/Message';
import { Spinner } from '@/components/Spinner';
import { isItemId } from '@/items';
import { playbackInfoBody, playErrorMessage, playSource, type PlaySource } from '@/playback';
import { Player } from '@/player/Player';
import { connectionFor, getSession, useSession } from '@/session';
import { ColorsContext, palettes, spacing } from '@/theme';

type State =
  { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; play: PlaySource; start: number };

const PLAYBACK_FAILED = "Couldn't play this video.";
// mpv sends no error when a file fails to open (docs/test-plans/mpv.md I15): no load in this long = failed.
const LOAD_TIMEOUT_MS = 30_000;

// Always dark, whatever the Appearance setting. Loads the play source (docs/context/player.md), then plays it full
// screen. Controls, reporting and orientation come with the next M4 tasks; until then: Close.
export default function PlayerScreen() {
  const { id, start } = useLocalSearchParams<{ id?: string; start?: string }>();
  const accountId = useSession().active?.id;
  const insets = useSafeAreaInsets();
  const [attempt, setAttempt] = useState(0);
  // Answer of the latest request; anything else (new item, account, Retry) shows the spinner until it lands.
  const key = `${accountId}|${id}|${attempt}`;
  const [loaded, setLoaded] = useState<{ key: string; state: State }>();
  // Where a load starts: the route's start, then (Retry) the last position seen.
  const position = useRef(Number(start) || 0);
  // Key of the load the player has reported (`onLoad`); the spinner stays over the video until then.
  const [started, setStarted] = useState<string>();

  const state: State = !isItemId(id)
    ? { status: 'error', message: playErrorMessage('none') }
    : loaded?.key === key
      ? loaded.state
      : { status: 'loading' };

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
            ? { status: 'ready', play: result.play, start: position.current }
            : { status: 'error', message: playErrorMessage(result.problem) },
        );
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        done({ status: 'error', message: playErrorMessage(e instanceof ApiError ? e : new ApiError('network')) });
      });
    return () => controller.abort();
  }, [key, accountId, id]);

  const ready = state.status === 'ready';
  useEffect(() => {
    if (!ready || started === key) return;
    const timer = setTimeout(
      () => setLoaded({ key, state: { status: 'error', message: PLAYBACK_FAILED } }),
      LOAD_TIMEOUT_MS,
    );
    return () => clearTimeout(timer);
  }, [ready, started, key]);

  const retry = () => setAttempt((n) => n + 1);

  return (
    <ColorsContext.Provider value={palettes.dark}>
      <StatusBar style="light" />
      <View style={styles.container}>
        {state.status === 'ready' && (
          <Player
            source={state.play.source}
            externalSubs={state.play.externalSubs}
            startSeconds={state.start}
            onLoad={() => setStarted(key)}
            onProgress={(e) => {
              position.current = e.position;
            }}
            onError={() => setLoaded({ key, state: { status: 'error', message: PLAYBACK_FAILED } })}
          />
        )}
        {(state.status === 'loading' || (ready && started !== key)) && <Spinner fill />}
        {state.status === 'error' && <Message fill text={state.message} retry={retry} />}
        {/* A fullScreenModal has no swipe to dismiss: Close stays clear of the status bar. */}
        <View style={[styles.close, { top: insets.top + spacing.sm, left: insets.left + spacing.md }]}>
          <IconButton icon="xmark" label="Close" onPress={() => router.back()} />
        </View>
      </View>
    </ColorsContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  close: { position: 'absolute' },
});
