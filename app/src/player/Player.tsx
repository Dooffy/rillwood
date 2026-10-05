// SPDX-License-Identifier: GPL-3.0-or-later
// PlayerEngine contract (docs/context/player.md). Screens import the player from here, never an engine directly.

export type Track = {
  id: number;
  lang?: string;
  title?: string;
  codec?: string;
};

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
  paused?: boolean;
  externalSubs?: { uri: string; lang?: string; title?: string }[];
  onLoad?(e: { duration: number; audio: Track[]; subs: Track[] }): void;
  onProgress?(e: { position: number; duration: number }): void;
  onEnd?(): void;
  onError?(msg: string): void;
};

export type PlayerRef = { seek(s: number): void; play(): void; pause(): void };

export { MpvPlayer as Player } from './mpv';
