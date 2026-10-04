// SPDX-License-Identifier: GPL-3.0-or-later
// Pure item logic: Home requests (path + query for useFetch), DTO → card data, image URLs (docs/context/api.md).
// Type-only imports, so dev scripts can load this file with plain Node (scripts/check-home.mjs).
import type { BaseItemDto, Endpoint, ImageType, ItemsResult } from '@/api';

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

// Card data.

export function ticksToSeconds(ticks: number): number {
  return ticks / TICKS_PER_SECOND;
}

export type Playback = {
  /** 0-1, only while in progress. */
  progress?: number;
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
