// SPDX-License-Identifier: GPL-3.0-or-later
// PlaybackInfo → what the player loads (docs/context/player.md): the media source, its static stream URL and the
// sidecar subtitle URLs. URLs are built here, never taken from the server (`DeliveryUrl` carries `ApiKey=<token>`).
// Pure (type-only imports), so `npm run check:home` loads it with plain Node.
import type { ApiError, Connection, MediaSourceDto, MediaStreamDto, PlaybackInfoResponse, PlaybackReport } from '@/api';
import type { Track } from '@/player/Player';

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
  /** What the tracks menu offers, with predicted mpv track ids (`matchTracks` checks them once the file loaded). */
  audio: TrackOption[];
  subtitles: TrackOption[];
  /** Jellyfin indexes to start with (the server's defaults, i.e. the user's language preferences); subtitle -1 = off. */
  defaultAudio?: number;
  defaultSubtitle: number;
  /** Picture width / height as shown (`pictureAspect`), if the server knows it. */
  aspect?: number;
};

/** A track the player can switch to: `id` is mpv's (1-based per type), `index` Jellyfin's stream index. */
export type TrackOption = { id: number; index: number; label: string; lang?: string; forced?: boolean };

/** A track as the engine lists it: sidecars carry the URI they were loaded from. */
export type EngineTrack = Pick<Track, 'id' | 'lang' | 'external'>;

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

// Jellyfin's DisplayTitle marks the default track ("English - Default - SUBRIP"); the menu shows the choice itself.
const trackLabel = (s: MediaStreamDto) =>
  (s.DisplayTitle ?? s.Title ?? s.Language ?? s.Codec ?? `Track ${s.Index}`).replace(/ - Default\b/, '');

/**
 * Audio + subtitle tracks with their mpv ids. mpv numbers each type from 1 in file order, then the sidecar subtitles in
 * the order they're added (`externalSubs` - formats it can't load are left out of both).
 */
export function trackOptions(
  source: MediaSourceDto,
  sidecars: ExternalSub[],
): { audio: TrackOption[]; subtitles: TrackOption[] } {
  const streams = source.MediaStreams ?? [];
  const inFile = (type: string) => streams.filter((s) => s.Type === type && !s.IsExternal);
  const option = (s: MediaStreamDto, i: number): TrackOption => ({
    id: i + 1,
    index: s.Index,
    label: trackLabel(s),
    lang: s.Language,
    forced: s.IsForced,
  });
  const embeddedSubs = inFile('Subtitle').map(option);
  const sidecarSubs = sidecars.flatMap((sub, i) => {
    const stream = streams.find((s) => s.Index === sub.index);
    return stream ? [option(stream, embeddedSubs.length + i)] : [];
  });
  return { audio: inFile('Audio').map(option), subtitles: [...embeddedSubs, ...sidecarSubs] };
}

/**
 * The menu's tracks with the ids the engine really gave them (its full list, `onTracks`): a stream mpv dropped or a
 * sidecar that failed to load would shift the predicted ones. Sidecars match by URI; a type's embedded tracks by
 * position when the counts agree (the prediction holds), else in order by language - best effort (several tracks in one
 * language, or codes that differ like `ger` / `deu`, can pair wrong). Options with no track are left out.
 */
export function matchTracks(
  play: Pick<PlaySource, 'audio' | 'subtitles' | 'externalSubs'>,
  engine: { audio: EngineTrack[]; subs: EngineTrack[] },
): { audio: TrackOption[]; subtitles: TrackOption[] } {
  const sidecarUri = new Map(play.externalSubs.map((s) => [s.index, s.uri]));
  const embedded = play.subtitles.filter((o) => !sidecarUri.has(o.index));
  const sidecars = play.subtitles.flatMap((o) => {
    const uri = sidecarUri.get(o.index);
    const track = uri !== undefined && engine.subs.find((t) => t.external === uri);
    return track ? [{ ...o, id: track.id }] : [];
  });
  return {
    audio: matchInFile(play.audio, engine.audio),
    subtitles: [
      ...matchInFile(
        embedded,
        engine.subs.filter((t) => t.external === undefined),
      ),
      ...sidecars,
    ],
  };
}

// A language code that says something: `und` (undetermined) and none are unknown.
const knownLang = (lang?: string) => (lang && lang.toLowerCase() !== 'und' ? lang.toLowerCase() : undefined);

function matchInFile(options: TrackOption[], tracks: EngineTrack[]): TrackOption[] {
  if (options.length === tracks.length) return options.map((o, i) => ({ ...o, id: tracks[i].id }));
  // A track without a language (or `und`) matches any.
  const sameLang = (a?: string, b?: string) => !knownLang(a) || !knownLang(b) || knownLang(a) === knownLang(b);
  let next = 0;
  const matched = options.flatMap((o) => {
    const at = tracks.findIndex((t, i) => i >= next && sameLang(o.lang, t.lang));
    if (at < 0) return [];
    next = at + 1;
    return [{ ...o, id: tracks[at].id }];
  });
  // No language lines up (codes that differ, like `ger` / `deu`): by position, so the menu keeps what mpv has.
  if (matched.length === 0) return options.slice(0, tracks.length).map((o, i) => ({ ...o, id: tracks[i].id }));
  return matched;
}

/** Audio / subtitle as Jellyfin stream indexes (the engine's ids can change once the file loaded); subtitle -1 = off. */
export type TrackChoice = { audio?: number; subtitle: number };

/** What a track picked on one item carries to the next: its language, label and whether it's forced-only. */
export type TrackPick = Pick<TrackOption, 'lang' | 'label' | 'forced'>;

/** Picks to carry to the next episode, keyed like `carryTracks` takes them. Subtitle `null` = off. */
export type TrackPicks = { audio?: TrackPick; subtitle?: TrackPick | null };

/**
 * The picks behind a menu choice (only the types it sets and finds): language + label of the chosen option, subtitles
 * off = null.
 */
export function picksOf(
  options: { audio: TrackOption[]; subtitles: TrackOption[] },
  choice: Partial<TrackChoice>,
): TrackPicks {
  const pick = (list: TrackOption[], index: number): TrackPick | undefined => {
    const option = list.find((t) => t.index === index);
    return option && { lang: option.lang, label: option.label, forced: option.forced };
  };
  const audio = choice.audio === undefined ? undefined : pick(options.audio, choice.audio);
  const subtitle =
    choice.subtitle === undefined
      ? undefined
      : choice.subtitle === -1
        ? null
        : pick(options.subtitles, choice.subtitle);
  // An index not found leaves the earlier pick as it was.
  return { ...(audio && { audio }), ...(subtitle !== undefined && { subtitle }) };
}

/**
 * Picks made on one episode, found again in the next one's options (Jellyfin indexes; undefined = no match, keep the
 * server's default). By language - the same label first (`English - AAC - Stereo` over a commentary track), else the
 * first track in that language that is forced-only as the pick was (full subtitles never become forced ones while the
 * language has full ones), else the first; a pick without a language only by its label. Subtitles off (`null`) stay off. Best
 * effort: codes that differ between files (`ger` / `deu`) don't match.
 */
export function carryTracks(
  options: { audio: TrackOption[]; subtitles: TrackOption[] },
  picks: TrackPicks,
): { audio?: number; subtitle?: number } {
  return {
    audio: picks.audio && sameTrack(options.audio, picks.audio)?.index,
    subtitle: picks.subtitle === null ? -1 : picks.subtitle && sameTrack(options.subtitles, picks.subtitle)?.index,
  };
}

function sameTrack(options: TrackOption[], pick: TrackPick): TrackOption | undefined {
  const lang = knownLang(pick.lang);
  const candidates = lang ? options.filter((o) => knownLang(o.lang) === lang) : options;
  if (!lang) return candidates.find((o) => o.label === pick.label);
  return (
    candidates.find((o) => o.label === pick.label) ??
    candidates.find((o) => Boolean(o.forced) === Boolean(pick.forced)) ??
    candidates[0]
  );
}

/** Sidecar subtitle files of a source (embedded ones are in the file - mpv finds those itself). */
export function externalSubs(baseUrl: string, itemId: string, source: MediaSourceDto): ExternalSub[] {
  return (source.MediaStreams ?? []).flatMap((s) => {
    if (s.Type !== 'Subtitle' || !s.IsExternal) return [];
    const uri = subtitleUrl(baseUrl, itemId, source.Id, s);
    return uri ? [{ uri, index: s.Index, lang: s.Language, title: s.DisplayTitle ?? s.Title }] : [];
  });
}

/** Display shape of the source's picture: the server's `AspectRatio` ("2.40:1"), else Width / Height. */
export function pictureAspect(source: MediaSourceDto): number | undefined {
  const video = source.MediaStreams?.find((s) => s.Type === 'Video');
  if (!video) return undefined;
  const [w, h] = (video.AspectRatio ?? '').split(':').map(Number);
  if (w > 0 && h > 0) return w / h;
  if (video.Width && video.Height) return video.Width / video.Height;
  return undefined;
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
  const subs = externalSubs(conn.baseUrl, itemId, source);
  const tracks = trackOptions(source, subs);
  return {
    ok: true,
    play: {
      mediaSourceId: source.Id,
      playSessionId: info.PlaySessionId,
      source: {
        uri: streamUrl(conn.baseUrl, itemId, source.Id),
        headers: conn.token ? { Authorization: streamAuthHeader(conn.token) } : {},
      },
      externalSubs: subs,
      ...tracks,
      defaultAudio:
        tracks.audio.find((t) => t.index === source.DefaultAudioStreamIndex)?.index ?? tracks.audio[0]?.index,
      defaultSubtitle: tracks.subtitles.find((t) => t.index === source.DefaultSubtitleStreamIndex)?.index ?? -1,
      aspect: pictureAspect(source),
    },
  };
}

// Local copy: this module stays importable by plain Node (`npm run check:home`), so no runtime `@/` imports.
const TICKS_PER_SECOND = 10_000_000;

/** `Sessions/Playing*` body for `play` at `seconds` (direct play, seekable). */
export function playbackReport(
  itemId: string,
  play: Pick<PlaySource, 'mediaSourceId' | 'playSessionId'>,
  seconds: number,
  extra: Pick<PlaybackReport, 'IsPaused' | 'EventName' | 'AudioStreamIndex' | 'SubtitleStreamIndex'> = {},
): PlaybackReport {
  return {
    ItemId: itemId,
    MediaSourceId: play.mediaSourceId,
    PlaySessionId: play.playSessionId,
    PositionTicks: Math.round(Math.max(seconds, 0) * TICKS_PER_SECOND),
    PlayMethod: 'DirectPlay',
    CanSeek: true,
    ...extra,
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
