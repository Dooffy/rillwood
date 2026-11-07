// SPDX-License-Identifier: GPL-3.0-or-later
// Pure item logic: Home requests (path + query for useFetch), DTO → card data, image URLs (docs/context/api.md).
// Type-only imports, so dev scripts can load this file with plain Node (scripts/check-home.mjs).
import type {
  BaseItemDto,
  Endpoint,
  ImageType,
  ItemsResult,
  MediaSourceDto,
  MediaStreamDto,
  PersonDto,
  Query,
  UserItemDataDto,
} from '@/api';

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

/**
 * The episode and the one after it, in series order across seasons (`startItemId`, same on 10.11 + 12.1), without
 * missing (virtual) episodes. Episodes of a series only - movies have no next.
 */
export function nextEpisodes(item: BaseItemDto): Endpoint | undefined {
  if (item.Type !== 'Episode' || !item.SeriesId) return undefined;
  return {
    path: `/Shows/${encodeURIComponent(item.SeriesId)}/Episodes`,
    query: { startItemId: item.Id, limit: 2, isMissing: false },
  };
}

/**
 * The episode after `id` in a `nextEpisodes` answer; none after the last one, or when the next has no file (`Virtual`:
 * `isMissing=false` may still let a not yet aired one through).
 */
export function nextEpisode(list: BaseItemDto[] | undefined, id: string): BaseItemDto | undefined {
  const at = list?.findIndex((ep) => ep.Id === id) ?? -1;
  const next = at < 0 ? undefined : list?.[at + 1];
  return next && hasFile(next) ? next : undefined;
}

// Downloads.

/** The signed-in user; `Policy.EnableContentDownloading` false (or 403 from `/Download`) → no Download button. */
export const currentUser: Endpoint = { path: '/Users/Me' };

/**
 * A season's episodes with their files (`MediaSources` with `Size`) and overview (the download snapshot), to download
 * it. Missing episodes left out.
 */
export function seasonFiles(seriesId: string, seasonId: string): Endpoint {
  const list = episodes(seriesId, seasonId);
  return { ...list, query: { ...list.query, fields: 'MediaSources,Overview', isMissing: false } };
}

/** False for a missing or not yet aired episode (`Virtual`: no file on the server). */
export const hasFile = (item: BaseItemDto) => item.LocationType !== 'Virtual';

/** What to download for each item: its first version (the one Play picks). Items without a file are left out. */
export function downloadSources(items: BaseItemDto[]): { item: BaseItemDto; source: MediaSourceDto }[] {
  return items.flatMap((item) => {
    const source = hasFile(item) ? item.MediaSources?.[0] : undefined;
    return source ? [{ item, source }] : [];
  });
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
  /** Every track in full, file order, the default one picked. Subtitles start with Off. */
  tracks: { label: string; picked: boolean }[];
};

export type MediaRows = { video?: TrackRow; audio?: TrackRow; subtitles?: TrackRow };

/**
 * Label + value chars that surely fit one row on a small phone. A guess, kept low on purpose: opening a row that fits
 * costs nothing, a cut-off value with no way to read it is the bug.
 */
const ROW_FIT_CHARS = 24;

/** A media row opens to list its tracks when there are several, or the default one doesn't fit the row. */
export function trackRowExpands(label: string, row: TrackRow): boolean {
  return row.count > 1 || label.length + row.value.length > ROW_FIT_CHARS;
}

/** Version / audio / subtitle rows for a media source (the first one when the item has several versions). */
export function mediaRows(source: MediaSourceDto | undefined): MediaRows {
  const streams = source?.MediaStreams ?? [];
  const of = (type: string) => streams.filter((s) => s.Type === type);
  const row = (type: string, picked: MediaStreamDto | undefined, off?: boolean): TrackRow | undefined => {
    const tracks = of(type).map((s) => ({ label: streamLabel(s), picked: s === picked }));
    if (!tracks.length) return undefined;
    return {
      value: picked ? streamLabel(picked) : 'Off',
      count: tracks.length,
      tracks: off ? [{ label: 'Off', picked: !picked }, ...tracks] : tracks,
    };
  };
  return {
    video: row('Video', of('Video')[0]),
    audio: row('Audio', defaultAudio(streams)),
    subtitles: row('Subtitle', defaultSubtitle(streams), true),
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

// Library (`/library`): browse and search in one list.

export type LibrarySort = 'name' | 'added' | 'year' | 'rating';
/** Type capsules. */
export type SearchScope = 'all' | 'movies' | 'shows' | 'episodes';

/** What the Library shows: optional search term, type, sort (browsing only) and filters. */
export type LibraryQuery = { term?: string; scope: SearchScope; sort: LibrarySort; filters: Filters };

/** Items per page of an endless list. */
export const LIBRARY_PAGE_SIZE = 50;

/** Sort menu, in order. */
export const LIBRARY_SORTS: { key: LibrarySort; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'added', label: 'Date Added' },
  { key: 'year', label: 'Year' },
  { key: 'rating', label: 'Rating' },
];

/** Type capsules, in order. */
export const SEARCH_SCOPES: { key: SearchScope; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'movies', label: 'Movies' },
  { key: 'shows', label: 'Shows' },
  { key: 'episodes', label: 'Episodes' },
];

/** Shortest term sent to the server: one letter already matches every word starting with it. */
export const SEARCH_MIN_LENGTH = 1;

/** The term to search for (trimmed), or undefined while it is empty. */
export function searchTerm(text: string): string | undefined {
  const term = text.trim();
  return term.length >= SEARCH_MIN_LENGTH ? term : undefined;
}

/** Server types per capsule. Browsing All lists movies and shows; episodes only come with a term. */
function scopeTypes(scope: SearchScope, searching: boolean): string {
  switch (scope) {
    case 'all':
      return searching ? 'Movie,Series,Episode' : 'Movie,Series';
    case 'movies':
      return 'Movie';
    case 'shows':
      return 'Series';
    case 'episodes':
      return 'Episode';
  }
}

/** Server sort keys; SortName breaks ties so pages stay stable. */
function sortQuery(scope: SearchScope, sort: LibrarySort): { sortBy: string; sortOrder: 'Ascending' | 'Descending' } {
  switch (sort) {
    case 'name':
      return { sortBy: 'SortName', sortOrder: 'Ascending' };
    case 'added':
      // Shows count as new when an episode lands, not when the series folder first appeared.
      return {
        sortBy: `${scope === 'shows' ? 'DateLastContentAdded' : 'DateCreated'},SortName`,
        sortOrder: 'Descending',
      };
    case 'year':
      return { sortBy: 'ProductionYear,SortName', sortOrder: 'Descending' };
    case 'rating':
      return { sortBy: 'CommunityRating,SortName', sortOrder: 'Descending' };
  }
}

/**
 * `/Items` for the Library: every item of the type the user can see, across libraries (no `parentId`), narrowed by the
 * filters. With a term the server ranks the matches (the sort is not sent); without one the sort applies. Unknown
 * `sortBy` values are ignored by the server, so the keys are fixed here. `limit: 0` = count only (the filter sheet).
 */
export function listItems(
  { term, scope, sort, filters }: LibraryQuery,
  limit: number = LIBRARY_PAGE_SIZE,
  startIndex?: number,
): Endpoint {
  return {
    path: '/Items',
    query: {
      searchTerm: term,
      includeItemTypes: scopeTypes(scope, !!term),
      recursive: true,
      ...(term ? {} : sortQuery(scope, sort)),
      ...filterQuery(filters),
      startIndex,
      limit,
    },
  };
}

/** Where the next page starts, or undefined once everything is loaded. `offset` = server items fetched so far (not the
 * merged list's length: repeats dropped by `mergePage` would make the next page overlap the last one). */
export function nextPageStart(offset: number, total: number | undefined): number | undefined {
  return total !== undefined && offset < total ? offset : undefined;
}

/** Appends a page, skipping items already shown (pages shift when the library changes between requests). */
export function mergePage(items: BaseItemDto[], page: BaseItemDto[]): BaseItemDto[] {
  const seen = new Set(items.map((i) => i.Id));
  return [...items, ...page.filter((i) => !seen.has(i.Id))];
}

// Filters (Library filter sheet).

export type ShowState = 'all' | 'unwatched' | 'inProgress' | 'watched' | 'favourites';

export type Filters = {
  show: ShowState;
  /** Any of these (OR). */
  genres: string[];
  /** Decade starts (2010 = 2010-2019); 0 = older than the oldest listed decade. Any of these. */
  decades: number[];
  /** Community rating at least this (0-10); undefined = any. */
  minRating?: number;
  only4K: boolean;
};

export const NO_FILTERS: Filters = { show: 'all', genres: [], decades: [], only4K: false };

export const SHOW_STATES: { key: ShowState; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'unwatched', label: 'Unwatched' },
  { key: 'inProgress', label: 'In Progress' },
  { key: 'watched', label: 'Watched' },
  { key: 'favourites', label: 'Favourites' },
];

/** Decade chips, newest first, then "Older". */
export const DECADES: { key: number; label: string }[] = [
  { key: 2020, label: '2020s' },
  { key: 2010, label: '2010s' },
  { key: 2000, label: '2000s' },
  { key: 1990, label: '1990s' },
  { key: 0, label: 'Older' },
];

export const MIN_RATINGS = [6, 7, 8];

const SHOW_FILTER: Record<ShowState, string | undefined> = {
  all: undefined,
  unwatched: 'IsUnplayed',
  inProgress: 'IsResumable',
  watched: 'IsPlayed',
  favourites: 'IsFavorite',
};

const OLDEST_DECADE = 1990;
const FIRST_YEAR = 1900;

function decadeYears(decade: number): number[] {
  const [from, to] = decade === 0 ? [FIRST_YEAR, OLDEST_DECADE - 1] : [decade, decade + 9];
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

/** `/Items` parameters for the filters (same on 10.11 + 12.1); empty when nothing is set. */
export function filterQuery(f: Filters): Query {
  return {
    filters: SHOW_FILTER[f.show],
    genres: f.genres.length ? f.genres.join('|') : undefined,
    years: f.decades.length ? f.decades.flatMap(decadeYears).join(',') : undefined,
    minCommunityRating: f.minRating,
    is4K: f.only4K || undefined,
  };
}

export type ActiveFilter = { id: string; label: string };

/** One removable chip per active filter, in sheet order. */
export function activeFilters(f: Filters): ActiveFilter[] {
  return [
    ...(f.show === 'all' ? [] : [{ id: 'show', label: SHOW_STATES.find((s) => s.key === f.show)?.label ?? f.show }]),
    ...f.genres.map((g) => ({ id: `genre:${g}`, label: g })),
    ...f.decades.map((d) => ({ id: `decade:${d}`, label: DECADES.find((x) => x.key === d)?.label ?? `${d}s` })),
    ...(f.minRating === undefined ? [] : [{ id: 'rating', label: `★ ${f.minRating}+` }]),
    ...(f.only4K ? [{ id: '4k', label: '4K' }] : []),
  ];
}

/** Filters without the chip `id` (from `activeFilters`). */
export function removeFilter(f: Filters, id: string): Filters {
  if (id === 'show') return { ...f, show: 'all' };
  if (id === 'rating') return { ...f, minRating: undefined };
  if (id === '4k') return { ...f, only4K: false };
  if (id.startsWith('genre:')) return { ...f, genres: f.genres.filter((g) => `genre:${g}` !== id) };
  if (id.startsWith('decade:')) return { ...f, decades: f.decades.filter((d) => `decade:${d}` !== id) };
  return f;
}

/** Genres for the filter sheet: `/Genres` of movies and shows, by name. (10.11 reports a total of 0 - use `Items`.) */
export const genresEndpoint: Endpoint = {
  path: '/Genres',
  query: { includeItemTypes: 'Movie,Series', recursive: true, sortBy: 'SortName', sortOrder: 'Ascending' },
};

export type SearchGroups = { movies: BaseItemDto[]; shows: BaseItemDto[]; episodes: BaseItemDto[] };

/** Splits mixed results into the screen's sections, keeping the server's order inside each. */
export function groupResults(items: BaseItemDto[]): SearchGroups {
  const of = (type: string) => items.filter((i) => i.Type === type);
  return { movies: of('Movie'), shows: of('Series'), episodes: of('Episode') };
}

// User data (mark watched / favourite). Same on 10.11 + 12.1: `POST` / `DELETE` answer the new UserData, marking
// played either way clears the resume point, and a season / series marks every episode in it.

export type UserFlag = 'played' | 'favourite';
/** One change: `itemId` set `flag` to `value`. `userData` = the server's answer for that item, once known. */
export type UserDataChange = { itemId: string; flag: UserFlag; value: boolean; userData?: UserItemDataDto };

/** UserData after the change, as the server answers it. */
export function changedUserData(current: UserItemDataDto | undefined, flag: UserFlag, value: boolean): UserItemDataDto {
  const base: UserItemDataDto = current ?? { PlaybackPositionTicks: 0, Played: false };
  if (flag === 'favourite') return { ...base, IsFavorite: value };
  return {
    ...base,
    Played: value,
    PlaybackPositionTicks: 0,
    PlayedPercentage: undefined,
    ...(base.UnplayedItemCount !== undefined && value ? { UnplayedItemCount: 0 } : {}),
  };
}

/**
 * The item after the change, or the same object when it is untouched: the item itself (with the server's UserData when
 * known), and for played its episodes / seasons (marking a season or series marks everything in it).
 */
export function patchItem(item: BaseItemDto, change: UserDataChange): BaseItemDto {
  if (item.Id === change.itemId) {
    return { ...item, UserData: change.userData ?? changedUserData(item.UserData, change.flag, change.value) };
  }
  const inside = change.flag === 'played' && (item.SeasonId === change.itemId || item.SeriesId === change.itemId);
  return inside ? { ...item, UserData: changedUserData(item.UserData, 'played', change.value) } : item;
}

function isItem(value: unknown): value is BaseItemDto {
  return typeof value === 'object' && value !== null && typeof (value as { Id?: unknown }).Id === 'string';
}

function mapList(list: unknown[], patch: (item: BaseItemDto) => BaseItemDto): unknown[] | undefined {
  let changed = false;
  const next = list.map((x) => {
    if (!isItem(x)) return x;
    const patched = patch(x);
    if (patched !== x) changed = true;
    return patched;
  });
  return changed ? next : undefined;
}

/**
 * A cached response (an item, a list of items, or `{Items}`) with `patch` applied to every item, or undefined when
 * `patch` changed nothing (it returns the same object to leave an item alone). New objects only where something
 * changed, so screens re-render.
 */
export function mapItems(data: unknown, patch: (item: BaseItemDto) => BaseItemDto): unknown {
  if (Array.isArray(data)) return mapList(data, patch);
  if (isItem(data)) {
    const patched = patch(data);
    return patched === data ? undefined : patched;
  }
  const items = (data as { Items?: unknown } | null)?.Items;
  if (Array.isArray(items)) {
    const next = mapList(items, patch);
    return next && { ...(data as object), Items: next };
  }
  return undefined;
}

/** `mapItems` with one user data change. */
export function patchResponse(data: unknown, change: UserDataChange): unknown {
  return mapItems(data, (item) => patchItem(item, change));
}

// Card data.

export function ticksToSeconds(ticks: number): number {
  return ticks / TICKS_PER_SECOND;
}

export function secondsToTicks(seconds: number): number {
  return Math.round(seconds * TICKS_PER_SECOND);
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
  const code = episodeLabel(ep);
  return code ? `${code} · ${ep.Name}` : ep.Name;
}

/** "S2, E3" ("E3" without a season) - the numbers alone, as text (the TV hero's play button). */
export function episodeLabel({ ParentIndexNumber: season, IndexNumber: episode }: BaseItemDto): string | undefined {
  return episode === undefined ? undefined : season === undefined ? `E${episode}` : `S${season}, E${episode}`;
}

/** "S1:E3"; "E3" without a season; undefined without an episode number. */
export function episodeCode({ ParentIndexNumber: season, IndexNumber: episode }: BaseItemDto): string | undefined {
  return seasonEpisodeCode(season, episode);
}

/** `episodeCode` from the numbers alone (a download keeps them, not the item). */
export function seasonEpisodeCode(season: number | undefined, episode: number | undefined): string | undefined {
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
