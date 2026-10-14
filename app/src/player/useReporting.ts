// SPDX-License-Identifier: GPL-3.0-or-later
// Playback reporting (docs/context/player.md): `Sessions/Playing` once the file has loaded, `Progress` every 10 s (paused
// too) + on pause / unpause / seek / track change (leaving the app pauses the player: that pause saves the position), `Stopped` with the last position when the load
// ends (close, Retry, error). Every report carries the audio / subtitle playing - the server remembers them per item.
// A report that doesn't reach the server (offline, known or found by the report failing) is kept as offline progress
// for the replay (`src/sync.ts`, docs/context/sync.md); a 401 signs out through the API layer as everywhere else.
import { useEffect, useRef } from 'react';

import {
  ApiError,
  isOffline,
  reportPlaybackProgress,
  reportPlaybackStart,
  reportPlaybackStopped,
  type Connection,
  type PlaybackReport,
} from '@/api';
import { secondsToTicks } from '@/items';
import { playbackReport, type PlaySource, type TrackChoice } from '@/playback';
import type { ProgressStore } from '@/player/progress';
import { connectionFor, getSession } from '@/session';
import { clearProgress, recordProgress } from '@/sync';
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
    if (!conn || !accountId || !itemId || !play || !started) return;
    const body = (extra: Extra) =>
      playbackReport(itemId, play, progress.get().position, {
        ...extra,
        AudioStreamIndex: tracksNow.current.audio,
        SubtitleStreamIndex: tracksNow.current.subtitle,
      });
    const ignore = () => {};
    // Offline progress: the session start is what the server would stamp as LastPlayedDate. Reports are numbered so a
    // late failure never writes an older position over a newer one.
    const startedAt = new Date().toISOString();
    let numbered = 0;
    let kept = 0;
    const keep = (n: number, report: PlaybackReport, runtimeTicks: number) => {
      if (n < kept) return;
      kept = n;
      recordProgress({ accountId, itemId, positionTicks: report.PositionTicks, runtimeTicks, startedAt });
    };
    // One queue per session: reports reach the server in order, so a late Progress never lands after Stopped (that
    // would revive the session on the dashboard and rewrite the final position). Bodies are taken when queued.
    let queue: Promise<unknown> = Promise.resolve();
    const enqueue = (call: (conn: Connection, report: PlaybackReport) => Promise<unknown>, report: PlaybackReport) => {
      const n = ++numbered;
      // Taken now, with the body: by a late failure the player may be on the next episode.
      const runtimeTicks = secondsToTicks(progress.get().duration);
      // Known offline: kept now, not after the request times out (the app may be killed meanwhile).
      if (isOffline()) keep(n, report, runtimeTicks);
      queue = queue
        .then(() =>
          call(conn, report).then(
            () => {
              // The server has it: what was kept for this session is older.
              if (n >= kept) clearProgress(accountId, itemId, startedAt);
            },
            (e: unknown) => {
              if (e instanceof ApiError && e.kind === 'network') keep(n, report, runtimeTicks);
            },
          ),
        )
        .catch(ignore);
    };
    const send = (extra: Extra) => enqueue(reportPlaybackProgress, body(extra));

    enqueue(reportPlaybackStart, body({ IsPaused: pausedNow.current }));
    report.current = send;
    // Paused too (with IsPaused): the server ends sessions that stop checking in.
    const timer = setInterval(
      () => send({ IsPaused: pausedNow.current, EventName: 'TimeUpdate' }),
      PROGRESS_INTERVAL_MS,
    );

    return () => {
      clearInterval(timer);
      report.current = null;
      // Last in the queue; then refresh everything showing this item: resume point, Continue Watching, Next Up.
      enqueue((c, stop) => reportPlaybackStopped(c, stop).then(() => invalidate()), body({}));
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
