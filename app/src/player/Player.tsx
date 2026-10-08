// SPDX-License-Identifier: GPL-3.0-or-later
// PlayerEngine contract (docs/context/player.md). Screens import the player from here, never an engine directly.

export type Track = {
  id: number;
  lang?: string;
  title?: string;
  codec?: string;
  /** Sidecar subtitle: the URI it was loaded from (one of `externalSubs`). */
  external?: string;
};

/** fit (default): the whole picture, bars around it. fill: covers the view edge to edge, cropping the picture. */
export type VideoZoom = 'fit' | 'fill';

export type PlayerProps = {
  /** A new object loads the file again, even with the same URI (replay). */
  source: { uri: string; headers?: Record<string, string> };
  startSeconds?: number;
  audioTrack?: number;
  subtitleTrack?: number; // -1 = off
  /** Playback rate, 1 = normal. */
  speed?: number;
  /** Subtitle size, 1 = normal. */
  subtitleScale?: number;
  /** Subtitle timing in seconds, 0 = as in the file; positive shows them later. */
  subtitleDelay?: number;
  zoom?: VideoZoom;
  /** Picture width / height as shown, if known: subtitles keep their size on a wide (2.39:1) picture. */
  aspect?: number;
  paused?: boolean;
  externalSubs?: { uri: string; lang?: string; title?: string }[];
  /** Once per load, when it can play. Sidecar subs may not be listed yet. */
  onLoad?(e: { duration: number; audio: Track[]; subs: Track[] }): void;
  /** Once per load, the full track list: every sidecar added (or failed to load). */
  onTracks?(e: { audio: Track[]; subs: Track[] }): void;
  onProgress?(e: { position: number; duration: number }): void;
  /**
   * End of file, after a last `onProgress` at the duration: the engine holds the last frame, paused. Play then replays
   * from the start; after a seek it plays from there.
   */
  onEnd?(): void;
  /** Waiting for data (stalled stream, seek, reload after an early end): true until frames flow again. */
  onBuffering?(buffering: boolean): void;
  onError?(msg: string): void;
};

export type PlayerRef = { seek(s: number): void; play(): void; pause(): void };

export { MpvPlayer as Player } from './mpv';
