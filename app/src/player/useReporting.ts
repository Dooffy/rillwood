// SPDX-License-Identifier: GPL-3.0-or-later
// Playback reporting (docs/context/player.md): `Sessions/Playing` once the file has loaded, `Progress` every 10 s (paused
// too) + on pause / unpause / seek / track change / leaving the app, `Stopped` with the last position when the load
// ends (close, Retry, error). Every report carries the audio / subtitle playing - the server remembers them per item.
// Best effort: a failed report is dropped (offline progress is M6, docs/context/sync.md); a 401 signs out through the
// API layer as everywhere else.
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { reportPlaybackProgress, reportPlaybackStart, reportPlaybackStopped, type PlaybackReport } from '@/api';
import { playbackReport, type PlaySource, type TrackChoice } from '@/playback';
import type { ProgressStore } from '@/player/progress';
import { connectionFor, getSession } from '@/session';
import { invalidate } from '@/useFetch';

export const PROGRESS_INTERVAL_MS = 10_000;

type Extra = Pick<PlaybackReport, 'IsPaused' | 'EventName'>;

/**
 * Reports the load of `play` as the account `accountId` once `started` (mpv loaded the file). A new `play` object
 * (Retry) is a new session: the old one gets its `Stopped` first. Returns `seeked()` for the screen's seeks.
 */
export function useReporting({
  accountId,
  itemId,
  play,
  started,
  paused,
  tracks,
  progress,
}: {
  accountId: string | undefined;
  itemId: string | undefined;
  play: PlaySource | undefined;
  started: boolean;
  paused: boolean;
  /** Audio / subtitle playing. */
  tracks: TrackChoice;
  progress: ProgressStore;
}): { seeked: () => void } {
  // The running session's progress sender; null when nothing is being reported.
  const report = useRef<((extra: Extra) => void) | null>(null);
  // Latest `paused`, for the timer and the reports (kept in the pause effect below).
  const pausedNow = useRef(paused);
  // Latest tracks, for the reports. Kept before the session effect runs, so a start carries the tracks of its render.
  const { audio, subtitle } = tracks;
  const tracksNow = useRef<TrackChoice>({ audio, subtitle });

  // Track change of a running session: Progress with the change, so the server has it even if no Stopped follows.
  useEffect(() => {
    const before = tracksNow.current;
    tracksNow.current = { audio, subtitle };
    const event =
      before.audio !== audio ? 'AudioTrackChange' : before.subtitle !== subtitle ? 'SubtitleTrackChange' : undefined;
    if (event) report.current?.({ IsPaused: pausedNow.current, EventName: event });
  }, [audio, subtitle]);

  useEffect(() => {
    const account = getSession().active;
    const conn = account && account.id === accountId ? connectionFor(account) : null;
    if (!conn || !itemId || !play || !started) return;
    const body = (extra: Extra) =>
      playbackReport(itemId, play, progress.get().position, {
        ...extra,
        AudioStreamIndex: tracksNow.current.audio,
        SubtitleStreamIndex: tracksNow.current.subtitle,
      });
    const ignore = () => {};
    // One queue per session: reports reach the server in order, so a late Progress never lands after Stopped (that
    // would revive the session on the dashboard and rewrite the final position). Bodies are taken when queued.
    let queue: Promise<unknown> = Promise.resolve();
    const enqueue = (call: () => Promise<unknown>) => {
      queue = queue.then(call).catch(ignore);
      return queue;
    };
    const send = (extra: Extra) => {
      const report = body(extra);
      enqueue(() => reportPlaybackProgress(conn, report));
    };

    const start = body({ IsPaused: pausedNow.current });
    enqueue(() => reportPlaybackStart(conn, start));
    report.current = send;
    // Paused too (with IsPaused): the server ends sessions that stop checking in.
    const timer = setInterval(
      () => send({ IsPaused: pausedNow.current, EventName: 'TimeUpdate' }),
      PROGRESS_INTERVAL_MS,
    );
    // Leaving the app may end in a kill (no Stopped): save the position now (not on iOS `inactive` - Control Center).
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'background') send({ IsPaused: pausedNow.current, EventName: 'TimeUpdate' });
    });

    return () => {
      clearInterval(timer);
      appState.remove();
      report.current = null;
      // Last in the queue; then refresh everything showing this item: resume point, Continue Watching, Next Up.
      const stop = body({});
      enqueue(() => reportPlaybackStopped(conn, stop).then(() => invalidate()));
    };
  }, [accountId, itemId, play, started, progress]);

  // Pause / unpause of a running session (its start already carried the first value).
  useEffect(() => {
    if (pausedNow.current === paused) return;
    pausedNow.current = paused;
    report.current?.({ IsPaused: paused, EventName: paused ? 'Pause' : 'Unpause' });
  }, [paused]);

  return {
    seeked: () => report.current?.({ IsPaused: pausedNow.current, EventName: 'TimeUpdate' }),
  };
}
