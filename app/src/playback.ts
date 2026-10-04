// SPDX-License-Identifier: GPL-3.0-or-later
// PlaybackInfo → what the player loads (docs/context/player.md): the media source, its static stream URL and the
// sidecar subtitle URLs. URLs are built here, never taken from the server (`DeliveryUrl` carries `ApiKey=<token>`).
// Pure (type-only imports), so `npm run check:home` loads it with plain Node.
import type { ApiError, Connection, MediaSourceDto, MediaStreamDto, PlaybackInfoResponse } from '@/api';

// Sidecar text formats the server converts (srt / subrip / vtt / ass checked on 10.11 + 12.1). ASS keeps its styling.
const SUB_EXTENSION: Record<string, string> = {
  srt: 'srt',
  subrip: 'srt',
  ass: 'ass',
  ssa: 'ass',
  vtt: 'vtt',
  webvtt: 'vtt',
};
const TEXT_SUBS = Object.keys(SUB_EXTENSION);

/**
 * Direct play everything (docs/research/jellyfin-api.md): any video container / codec, subtitles embedded or as
 * sidecar files. `MaxStreamingBitrate` is what lets 4K remuxes through (400 Mbps). No transcoding profiles - a refusal
 * is only `SupportsDirectPlay: false`.
 */
export const DEVICE_PROFILE = {
  MaxStreamingBitrate: 400_000_000,
  DirectPlayProfiles: [{ Type: 'Video' }],
  SubtitleProfiles: [
    ...[...TEXT_SUBS, 'pgssub', 'dvdsub', 'dvbsub', 'sub'].map((Format) => ({ Format, Method: 'Embed' })),
    ...TEXT_SUBS.map((Format) => ({ Format, Method: 'External' })),
  ],
};

/** `POST /Items/{id}/PlaybackInfo` body. User from the token; `mediaSourceId` picks a version. */
export function playbackInfoBody(mediaSourceId?: string) {
  return { DeviceProfile: DEVICE_PROFILE, MediaSourceId: mediaSourceId };
}

/**
 * Header for mpv sources: token only. mpv joins headers into a comma-separated list, so the full header splits and
 * Jellyfin answers 400 (docs/test-plans/mpv.md I1).
 */
export function streamAuthHeader(token: string): string {
  return `MediaBrowser Token="${token}"`;
}

export type ExternalSub = {
  uri: string;
  /** Jellyfin stream index - matches the subtitle choice to its mpv track later. */
  index: number;
  lang?: string;
  title?: string;
};

export type PlaySource = {
  mediaSourceId: string;
  /** For `Sessions/Playing` reporting. */
  playSessionId?: string;
  source: { uri: string; headers: Record<string, string> };
  externalSubs: ExternalSub[];
  /** Jellyfin stream indexes; subtitle -1 / undefined = off. */
  defaultAudio?: number;
  defaultSubtitle?: number;
};

/**
 * - `none`: no media source (or not the requested one)
 * - `notAllowed`: the user may not play media (`ErrorCode: NotAllowed`)
 * - `directPlay`: the server won't direct play the file (or any other `ErrorCode`)
 */
export type PlayProblem = 'none' | 'notAllowed' | 'directPlay';

export type PlayResult = { ok: true; play: PlaySource } | { ok: false; problem: PlayProblem };

/** `/Videos/{id}/stream?static=true&mediaSourceId=` - the file as-is, no transcoding. */
export function streamUrl(baseUrl: string, itemId: string, mediaSourceId: string): string {
  return `${baseUrl}/Videos/${encodeURIComponent(itemId)}/stream?static=true&mediaSourceId=${encodeURIComponent(mediaSourceId)}`;
}

/** `/Videos/{id}/{msId}/Subtitles/{index}/Stream.{ext}`; null for formats the server can't serve as text. */
export function subtitleUrl(baseUrl: string, itemId: string, mediaSourceId: string, stream: MediaStreamDto) {
  const ext = SUB_EXTENSION[stream.Codec?.toLowerCase() ?? ''];
  if (!ext) return null;
  return `${baseUrl}/Videos/${encodeURIComponent(itemId)}/${encodeURIComponent(mediaSourceId)}/Subtitles/${stream.Index}/Stream.${ext}`;
}

/** Sidecar subtitle files of a source (embedded ones are in the file - mpv finds those itself). */
export function externalSubs(baseUrl: string, itemId: string, source: MediaSourceDto): ExternalSub[] {
  return (source.MediaStreams ?? []).flatMap((s) => {
    if (s.Type !== 'Subtitle' || !s.IsExternal) return [];
    const uri = subtitleUrl(baseUrl, itemId, source.Id, s);
    return uri ? [{ uri, index: s.Index, lang: s.Language, title: s.DisplayTitle ?? s.Title }] : [];
  });
}

/**
 * Picks the source to play from a PlaybackInfo answer: `mediaSourceId` if given (it must be there), else the first.
 * The server says `SupportsDirectPlay: false` without an error code - that's a refusal too.
 */
export function playSource(
  conn: Pick<Connection, 'baseUrl' | 'token'>,
  itemId: string,
  info: PlaybackInfoResponse,
  mediaSourceId?: string,
): PlayResult {
  if (info.ErrorCode === 'NotAllowed') return { ok: false, problem: 'notAllowed' };
  if (info.ErrorCode) return { ok: false, problem: 'directPlay' };
  const source = mediaSourceId ? info.MediaSources.find((s) => s.Id === mediaSourceId) : info.MediaSources[0];
  if (!source) return { ok: false, problem: 'none' };
  if (!source.SupportsDirectPlay) return { ok: false, problem: 'directPlay' };
  return {
    ok: true,
    play: {
      mediaSourceId: source.Id,
      playSessionId: info.PlaySessionId,
      source: {
        uri: streamUrl(conn.baseUrl, itemId, source.Id),
        headers: conn.token ? { Authorization: streamAuthHeader(conn.token) } : {},
      },
      externalSubs: externalSubs(conn.baseUrl, itemId, source),
      defaultAudio: source.DefaultAudioStreamIndex,
      defaultSubtitle: source.DefaultSubtitleStreamIndex,
    },
  };
}

const PROBLEM_MESSAGE: Record<PlayProblem, string> = {
  none: "This video isn't available.",
  notAllowed: "Your account isn't allowed to play videos on this server.",
  directPlay: "The server won't send this file as-is, and Rillwood doesn't use transcoding.",
};

/** Player error text for a refusal or a failed request. */
export function playErrorMessage(error: PlayProblem | ApiError): string {
  if (typeof error === 'string') return PROBLEM_MESSAGE[error];
  if (error.kind === 'network') return "Couldn't reach the server.";
  if (error.status === 404) return PROBLEM_MESSAGE.none;
  return "Couldn't start playback.";
}
