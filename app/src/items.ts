// SPDX-License-Identifier: GPL-3.0-or-later
// Pure item logic: Home requests (path + query for useFetch), DTO → card data, image URLs (docs/context/api.md).
// Type-only imports, so dev scripts can load this file with plain Node (scripts/check-home.mjs).
import type { BaseItemDto, Endpoint, ImageType, ItemsResult, MediaSourceDto, MediaStreamDto, PersonDto } from '@/api';

export const TICKS_PER_SECOND = 10_000_000;

export const ROW_LIMIT = 20;

// Home rows.

export const userViews: Endpoint = { path: '/UserViews' };

/** `mediaTypes=Video`: 12.1 adds Season + Series rows otherwise. */
export const continueWatching: Endpoint = {
  path: '/UserItems/Resume',
  query: { mediaTypes: 'Video', limit: ROW_LIMIT },
};

/** In-progress episodes are already in Continue Watching. */
export const nextUp: Endpoint = { path: '/Shows/NextUp', query: { limit: ROW_LIMIT, enableResumable: false } };

/** Recently Added for one library. Answers with a bare array - shape it with `recentlyAdded`. */
export function latest(parentId: string): Endpoint {
  return { path: '/Items/Latest', query: { parentId, limit: ROW_LIMIT } };
}

/** Every path Home reads; pull to refresh / Retry invalidate these (Latest is one path for all libraries). */
export const homePaths = [userViews.path, continueWatching.path, nextUp.path, latest('').path];

/** A `useFetch` result: data once loaded, error once failed (both undefined while loading). */
type Loaded = { data?: ItemsResult; error?: unknown };

export type HomeLayout = {
  /** Up Next: the latest started item, else the next episode. Left out of its row. */
  hero?: BaseItemDto;
  heroFromResume: boolean;
  /** No hero yet, but one may come: show its placeholder. */
  heroPending: boolean;
  /** Row items without the hero; undefined while loading or failed. */
  resume?: BaseItemDto[];
  nextUp?: BaseItemDto[];
  /** Libraries with a Recently Added row; undefined while loading or failed. */
  libraries?: BaseItemDto[];
  /** Views, Resume and Next Up all failed: one error + Retry instead of rows. */
  allFailed: boolean;
  /** Everything loaded and empty, Recently Added rows included: the empty message. */
  empty: boolean;
};

/** What Home shows from its requests. `latestCounts`: items per library id once its Recently Added row loaded. */
export function homeLayout(
  views: Loaded,
  resume: Loaded,
  next: Loaded,
  latestCounts: Record<string, number | undefined>,
): HomeLayout {
  const resumeItems = resume.data?.Items;
  const nextItems = next.data?.Items;
  const resumeDone = resumeItems !== undefined || resume.error !== undefined;
  const nextDone = nextItems !== undefined || next.error !== undefined;
  const heroFromResume = !!resumeItems?.length;
  const hero = heroFromResume ? resumeItems[0] : resumeDone ? nextItems?.[0] : undefined;
  const libraries = views.data && homeLibraries(views.data.Items);
  return {
    hero,
    heroFromResume,
    heroPending: !hero && (!resumeDone || !nextDone),
    resume: heroFromResume ? resumeItems.slice(1) : resumeItems,
    nextUp: hero && !heroFromResume ? nextItems?.slice(1) : nextItems,
    libraries,
    allFailed: [views, resume, next].every((r) => r.data === undefined && r.error !== undefined),
    empty:
      resumeItems?.length === 0 &&
      nextItems?.length === 0 &&
      libraries !== undefined &&
      libraries.every((l) => latestCounts[l.Id] === 0),
  };
}

/** Libraries with a Recently Added row, in server order. */
export function homeLibraries(views: BaseItemDto[]): BaseItemDto[] {
  return views.filter((v) => v.CollectionType === 'movies' || v.CollectionType === 'tvshows');
}

/**
 * Latest items as cards: TV libraries list the series. 12.1 already returns `Series`; 10.11 returns the newest
 * `Episode`s, so each becomes its series (first one wins, order kept).
 */
export function recentlyAdded(items: BaseItemDto[]): BaseItemDto[] {
  const seen = new Set<string>();
  const shown: BaseItemDto[] = [];
  for (const item of items) {
    const id = inSeries(item) ? item.SeriesId : item.Id;
    if (seen.has(id)) continue;
    seen.add(id);
    shown.push(inSeries(item) ? seriesOf(item) : item);
  }
  return shown;
}

/** Episodes and seasons, which show as their series in rows and posters. */
function inSeries(item: BaseItemDto): item is BaseItemDto & { SeriesId: string } {
  return (item.Type === 'Episode' || item.Type === 'Season') && !!item.SeriesId;
}

function seriesOf(item: BaseItemDto & { SeriesId: string }): BaseItemDto {
  return {
    Id: item.SeriesId,
    Name: item.SeriesName ?? item.Name,
    Type: 'Series',
    ServerId: item.ServerId,
    IsFolder: true,
    ImageTags: item.SeriesPrimaryImageTag ? { Primary: item.SeriesPrimaryImageTag } : {},
    // The series art the episode points at, so landscape / hero cards still find a thumb or backdrop.
    ParentThumbItemId: item.ParentThumbItemId,
    ParentThumbImageTag: item.ParentThumbImageTag,
    ParentBackdropItemId: item.ParentBackdropItemId,
    ParentBackdropImageTags: item.ParentBackdropImageTags,
  };
}

// Detail (`/item/[id]`).

/** `GET /Items/{id}`. Never call with an empty id: the server answers with the root folder. */
export function itemDetail(id: string): Endpoint {
  return { path: `/Items/${encodeURIComponent(id)}` };
}

/** Route param check before `itemDetail`: empty and all-zero (Guid.Empty) ids would load the root folder. */
export function isItemId(id: unknown): id is string {
  return typeof id === 'string' && /[1-9a-f]/i.test(id);
}

// Series detail (`/series/[id]`).

/** Seasons of a series, in order (Specials = index 0). */
export function seasons(seriesId: string): Endpoint {
  return { path: `/Shows/${encodeURIComponent(seriesId)}/Seasons` };
}

/** Episodes of one season, in order. `Overview` is not sent by default. */
export function episodes(seriesId: string, seasonId: string): Endpoint {
  return { path: `/Shows/${encodeURIComponent(seriesId)}/Episodes`, query: { seasonId, fields: 'Overview' } };
}

/**
 * The episode the series' Play button starts: in progress, else the one after the highest-numbered watched episode,
 * else the first (both versions answer S01E01 when nothing is watched). Empty once the last episode is watched. With
 * the overview for the line under Play.
 */
export function seriesNextUp(seriesId: string): Endpoint {
  return { path: '/Shows/NextUp', query: { seriesId, limit: 1, enableResumable: true, fields: 'Overview' } };
}

/** "More Like This" for a movie or series: `{Items}`, often empty on sparse metadata. */
export function similar(id: string): Endpoint {
  return { path: `/Items/${encodeURIComponent(id)}/Similar`, query: { limit: ROW_LIMIT } };
}

/**
 * Season shown first: the one holding the next episode, else the first real season (Specials have index 0), else
 * the first.
 */
export function defaultSeasonId(list: BaseItemDto[], next?: BaseItemDto): string | undefined {
  if (next?.SeasonId && list.some((s) => s.Id === next.SeasonId)) return next.SeasonId;
  return (realSeasons(list)[0] ?? list[0])?.Id;
}

/** Under a season in the season menu: "Watched", "5 unwatched", or nothing. */
export function seasonDetail(season: BaseItemDto): string | undefined {
  if (season.UserData?.Played) return 'Watched';
  const unwatched = season.UserData?.UnplayedItemCount;
  return unwatched ? `${unwatched} unwatched` : undefined;
}

/**
 * What the series' Play button does: the next-up episode (resumed at its position when started), else the first
 * episode shown.
 */
export function seriesPlayTarget(
  next: BaseItemDto | undefined,
  seasonEpisodes: BaseItemDto[] = [],
): { episode: BaseItemDto; resume: boolean; start: number } | undefined {
  const episode = next ?? seasonEpisodes[0];
  if (!episode) return undefined;
  const { progress, resumeSeconds = 0 } = playback(episode);
  return progress !== undefined
    ? { episode, resume: true, start: resumeSeconds }
    : { episode, resume: false, start: 0 };
}

/** "2019-2023", "2019-" while continuing, "2019" for one year or without an end. */
export function yearRange({ ProductionYear: start, EndDate, Status }: BaseItemDto): string | undefined {
  if (!start) return undefined;
  if (Status === 'Continuing') return `${start}-`;
  const end = EndDate ? new Date(EndDate).getUTCFullYear() : undefined;
  // Bad metadata (unparseable or earlier end) shows the start year alone.
  return end !== undefined && Number.isFinite(end) && end > start ? `${start}-${end}` : `${start}`;
}

/** Seasons that count for "3 Seasons": Specials (index 0) left out; `ChildCount` may include them. */
export function realSeasons(list: BaseItemDto[]): BaseItemDto[] {
  return list.filter((s) => (s.IndexNumber ?? 0) > 0);
}

/** "1 Season", "3 Seasons". */
export function seasonCount(count: number | undefined): string | undefined {
  return count ? `${count} Season${count === 1 ? '' : 's'}` : undefined;
}

/** "1. Pilot" - episode title inside its season list; the name alone without a number. */
export function episodeTitle({ IndexNumber: n, Name }: BaseItemDto): string {
  return n === undefined ? Name : `${n}. ${Name}`;
}

/** Directors' names for "Directed by …" (server order). */
export function directors(people: PersonDto[] = []): string[] {
  return people.filter((p) => p.Type === 'Director').map((p) => p.Name);
}

/** Facts for the detail chips; runtime as seconds (the screen formats it). */
export type DetailFacts = {
  year?: number;
  runtimeSeconds?: number;
  /** Age rating: "PG". */
  rating?: string;
  /** "7.3" (one decimal). */
  score?: string;
  /** "4K", "1080p", "720p", "SD". */
  resolution?: string;
  /** "Dolby Vision", "HDR10+", "HDR10", "HLG", "HDR". */
  hdr?: string;
  /** Default audio track: "7.1", "5.1", "Stereo", "Mono". */
  audio?: string;
  /** "Dolby Atmos" when any audio track is. */
  atmos?: string;
  /** "SDH" when a subtitle track is for the deaf and hard of hearing, else "CC" when there are subtitles. */
  subtitles?: 'SDH' | 'CC';
};

export function detailFacts(item: BaseItemDto): DetailFacts {
  const streams = item.MediaSources?.[0]?.MediaStreams ?? [];
  const video = streams.find((s) => s.Type === 'Video');
  const audio = defaultAudio(streams);
  return {
    year: item.ProductionYear,
    runtimeSeconds: item.RunTimeTicks ? ticksToSeconds(item.RunTimeTicks) : undefined,
    rating: item.OfficialRating,
    score: item.CommunityRating ? item.CommunityRating.toFixed(1) : undefined,
    resolution: video && resolution(video),
    hdr: video && hdr(video),
    audio: audio?.Channels ? channels(audio.Channels) : undefined,
    atmos: streams.some((s) => s.Type === 'Audio' && /atmos/i.test(`${s.Profile ?? ''} ${s.DisplayTitle ?? ''}`))
      ? 'Dolby Atmos'
      : undefined,
    subtitles: streams.some((s) => s.Type === 'Subtitle' && s.IsHearingImpaired)
      ? 'SDH'
      : streams.some((s) => s.Type === 'Subtitle')
        ? 'CC'
        : undefined,
  };
}

/** By width, so scope and 4:3 crops land in the right bucket (4096x1744 is 4K). */
function resolution({ Width: w = 0, Height: h = 0 }: MediaStreamDto): string | undefined {
  if (!w && !h) return undefined;
  if (w >= 3200 || h >= 1800) return '4K';
  if (w >= 1800 || h >= 1000) return '1080p';
  if (w >= 1200 || h >= 700) return '720p';
  return 'SD';
}

function hdr({ VideoRangeType: type = '', VideoRange: range }: MediaStreamDto): string | undefined {
  // DOVIInvalid: broken DV metadata, the server plays it as non-DV.
  if (type.startsWith('DOVI') && type !== 'DOVIInvalid') return 'Dolby Vision';
  if (type === 'HDR10Plus') return 'HDR10+';
  if (type === 'HDR10' || type === 'HLG') return type;
  return range === 'HDR' ? 'HDR' : undefined;
}

function channels(n: number): string {
  return n === 1 ? 'Mono' : n === 2 ? 'Stereo' : n === 6 ? '5.1' : n === 8 ? '7.1' : `${n} ch`;
}

/** The track the player starts with: the default one, else the first (audio always plays, subtitles may be off). */
function defaultAudio(streams: MediaStreamDto[]): MediaStreamDto | undefined {
  const audio = streams.filter((s) => s.Type === 'Audio');
  return audio.find((s) => s.IsDefault) ?? audio[0];
}

function defaultSubtitle(streams: MediaStreamDto[]): MediaStreamDto | undefined {
  return streams.find((s) => s.Type === 'Subtitle' && s.IsDefault);
}

function streamLabel(s: MediaStreamDto): string {
  return s.DisplayTitle ?? s.Title ?? s.Language ?? s.Codec ?? `Track ${s.Index}`;
}

export type TrackRow = {
  /** What plays by default: "English - Dolby Digital - 5.1", "Off" for subtitles without a default. */
  value: string;
  /** Tracks of this type in the file. */
  count: number;
};

export type MediaRows = { video?: TrackRow; audio?: TrackRow; subtitles?: TrackRow };

/** Version / audio / subtitle rows for a media source (the first one when the item has several versions). */
export function mediaRows(source: MediaSourceDto | undefined): MediaRows {
  const streams = source?.MediaStreams ?? [];
  const count = (type: string) => streams.filter((s) => s.Type === type).length;
  const video = streams.find((s) => s.Type === 'Video');
  const audio = defaultAudio(streams);
  const subtitle = defaultSubtitle(streams);
  return {
    video: video && { value: streamLabel(video), count: count('Video') },
    audio: audio && { value: streamLabel(audio), count: count('Audio') },
    subtitles: count('Subtitle')
      ? { value: subtitle ? streamLabel(subtitle) : 'Off', count: count('Subtitle') }
      : undefined,
  };
}

const CAST = ['Actor', 'GuestStar'];
const CREW = ['Director', 'Writer'];

/** Most people a detail row shows: real titles list 100+, all loading at once. */
export const PEOPLE_LIMIT = 24;

/**
 * Cast first (server order = billing), then directors and writers, at most `PEOPLE_LIMIT`. Producers and the rest
 * are left out.
 */
export function castAndCrew(people: PersonDto[] = []): PersonDto[] {
  const of = (types: string[]) => people.filter((p) => p.Type !== undefined && types.includes(p.Type));
  return [...of(CAST), ...of(CREW)].slice(0, PEOPLE_LIMIT);
}

/** Under the name: the character for cast, the job for crew. */
export function personRole(p: PersonDto): string | undefined {
  return p.Type !== undefined && CAST.includes(p.Type) ? p.Role : p.Type;
}

export function personImage({ Id, PrimaryImageTag }: PersonDto): ImageRef | undefined {
  return PrimaryImageTag ? { itemId: Id, type: 'Primary', tag: PrimaryImageTag } : undefined;
}

// Card data.

export function ticksToSeconds(ticks: number): number {
  return ticks / TICKS_PER_SECOND;
}

export type Playback = {
  /** 0-1, only while in progress. */
  progress?: number;
  /** Saved position in seconds, only while in progress (Resume). */
  resumeSeconds?: number;
  /** Seconds left, only while in progress. */
  remainingSeconds?: number;
  played: boolean;
};

/** Watch state for a card: progress + time left from the resume position, or played. */
export function playback(item: BaseItemDto): Playback {
  const played = item.UserData?.Played ?? false;
  const position = item.UserData?.PlaybackPositionTicks ?? 0;
  const runtime = item.RunTimeTicks ?? 0;
  if (played || position <= 0 || runtime <= 0) return { played };
  return {
    progress: Math.min(1, position / runtime),
    resumeSeconds: ticksToSeconds(position),
    remainingSeconds: ticksToSeconds(Math.max(0, runtime - position)),
    played,
  };
}

/** Episodes: series name over "S1:E3 · Pilot". Movies / series: name over year. */
export function cardTitles(item: BaseItemDto): { title: string; subtitle?: string } {
  if (item.Type === 'Episode') {
    const code = episodeCode(item);
    return { title: item.SeriesName ?? item.Name, subtitle: code ? `${code} · ${item.Name}` : item.Name };
  }
  return { title: item.Name, subtitle: item.ProductionYear?.toString() };
}

const KIND: Record<string, string | undefined> = { Movie: 'Movie', Series: 'TV Show' };

/** Line under the detail title: "S1:E2 · Season 1" for episodes, "Movie · Animation · Fantasy" / "TV Show · Drama" otherwise. */
export function detailSubtitle(item: BaseItemDto): string {
  const parts =
    item.Type === 'Episode'
      ? [episodeCode(item), item.SeasonName]
      : [KIND[item.Type], ...(item.Genres ?? []).slice(0, 2)];
  return parts.filter(Boolean).join(' · ');
}

/** "S2, E3 · Pilot" - names an episode in a line of text (under Play, menu titles); the name alone without numbers. */
export function episodeLine(ep: BaseItemDto): string {
  const { ParentIndexNumber: season, IndexNumber: episode } = ep;
  const code = episode === undefined ? undefined : season === undefined ? `E${episode}` : `S${season}, E${episode}`;
  return code ? `${code} · ${ep.Name}` : ep.Name;
}

/** "S1:E3"; "E3" without a season; undefined without an episode number. */
export function episodeCode({ ParentIndexNumber: season, IndexNumber: episode }: BaseItemDto): string | undefined {
  if (episode === undefined) return undefined;
  return season === undefined ? `E${episode}` : `S${season}:E${episode}`;
}

// Images. The tag is part of the URL: the server sends 1-year cache headers, and a changed image gets a new tag.

export type ImageRef = { itemId: string; type: ImageType; tag: string };

function own(item: BaseItemDto, type: ImageType): ImageRef | undefined {
  const tag = type === 'Backdrop' ? item.BackdropImageTags?.[0] : item.ImageTags?.[type];
  return tag ? { itemId: item.Id, type, tag } : undefined;
}

function parentThumb(item: BaseItemDto): ImageRef | undefined {
  const { ParentThumbItemId: itemId, ParentThumbImageTag: tag } = item;
  return itemId && tag ? { itemId, type: 'Thumb', tag } : undefined;
}

function parentBackdrop(item: BaseItemDto): ImageRef | undefined {
  const { ParentBackdropItemId: itemId, ParentBackdropImageTags: tags } = item;
  return itemId && tags?.[0] ? { itemId, type: 'Backdrop', tag: tags[0] } : undefined;
}

/** 2:3 poster. Episodes and seasons show the series poster. */
export function posterImage(item: BaseItemDto): ImageRef | undefined {
  if (inSeries(item) && item.SeriesPrimaryImageTag) {
    return { itemId: item.SeriesId, type: 'Primary', tag: item.SeriesPrimaryImageTag };
  }
  return own(item, 'Primary');
}

/** 16:9 card. Episodes: their still (Primary) first. Others: thumb, backdrop, then the poster cropped. */
export function landscapeImage(item: BaseItemDto): ImageRef | undefined {
  if (item.Type === 'Episode') return own(item, 'Primary') ?? parentThumb(item) ?? parentBackdrop(item);
  return (
    own(item, 'Thumb') ?? own(item, 'Backdrop') ?? parentThumb(item) ?? parentBackdrop(item) ?? own(item, 'Primary')
  );
}

/** Title art (logo) drawn over the detail hero instead of the text title. */
export function logoImage(item: BaseItemDto): ImageRef | undefined {
  return own(item, 'Logo');
}

/** Full-width art (Up Next hero): backdrop, the series backdrop, then the landscape choice. */
export function backdropImage(item: BaseItemDto): ImageRef | undefined {
  return own(item, 'Backdrop') ?? parentBackdrop(item) ?? landscapeImage(item);
}

/** Pixel widths requested from the server: one URL (and cache entry) serves rows, grid and detail. */
export const IMAGE_WIDTHS = [240, 360, 480, 720, 1080, 1440, 1920, 2880];

/**
 * `/Items/{id}/Images/{type}` sized to the card: `width` in points × screen `scale` (`PixelRatio.get()`), rounded up to
 * the next `IMAGE_WIDTHS` step. No token - images are served without auth.
 */
export function imageUrl(baseUrl: string, { itemId, type, tag }: ImageRef, width: number, scale: number): string {
  const pixels = width * scale;
  const fillWidth = IMAGE_WIDTHS.find((w) => w >= pixels) ?? IMAGE_WIDTHS[IMAGE_WIDTHS.length - 1];
  return `${baseUrl}/Items/${encodeURIComponent(itemId)}/Images/${type}?fillWidth=${fillWidth}&quality=90&tag=${encodeURIComponent(tag)}`;
}
