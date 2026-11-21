// SPDX-License-Identifier: GPL-3.0-or-later
// Kids mode rating rules (pure, docs/context/kids.md "Shared filter"): kids account detection, age step → server
// query, and the allowed-shows check for episodes (they have no rating of their own).
import type { BaseItemDto, Endpoint, Query, UserDto } from './api';
import { hasFile } from './items';

export type AgeStep = 3 | 7 | 10 | 13;
export const AGE_STEPS: readonly AgeStep[] = [3, 7, 10, 13];

/** Shared phone filter: the age step, whether unrated videos show (hidden by default), one library (none = all). */
export type KidsFilter = { age: AgeStep; unrated: boolean; library?: string };

/**
 * The highest rating each step lets in, by name - the server compares by its score (`/Localization/ParentalRatings`),
 * so `PG` also lets in `TV-PG`. 13+ stops at PG-13: TV-14 (score 14) stays out.
 */
const MAX_RATING: Record<AgeStep, string> = { 3: 'TV-G', 7: 'TV-Y7', 10: 'PG', 13: 'PG-13' };

/** The same limits as scores (the server's table: TV-G 0, TV-Y7 7, PG 10, PG-13 13) - for downloads, offline. */
const MAX_SCORE: Record<AgeStep, number> = { 3: 0, 7: 7, 10: 10, 13: 13 };

/**
 * A download in kids mode offline (shared phone filter; a kids account has none - the server filtered it): its saved
 * score up to the age, or - unrated (no score) - only when unrated videos show.
 */
export function allowedOffline(rating: number | undefined, filter: KidsFilter | undefined): boolean {
  if (!filter) return true;
  return rating === undefined ? filter.unrated : rating <= MAX_SCORE[filter.age];
}

/** A user with a rating limit on the server (`/Users/Me`): detected as a kids account. */
export function isKidsAccount(user: UserDto | undefined): boolean {
  return typeof user?.Policy?.MaxParentalRating === 'number';
}

/**
 * Query params for any `/Items` request in kids mode; none without a filter (a kids account - the server filters). `maxOfficialRating` keeps unrated items, so they're
 * dropped with `hasParentalRating` - that works on movies and shows only (every episode counts as rated), so episodes
 * also go through `keepAllowed`.
 */
export function ratingQuery(filter: KidsFilter | undefined): Query {
  if (!filter) return {};
  return { maxOfficialRating: MAX_RATING[filter.age], hasParentalRating: filter.unrated ? undefined : true };
}

/** The library pick as a query (`/Items` takes one `parentId`); none = every library. */
function libraryQuery(filter: KidsFilter | undefined): Query {
  return filter?.library ? { parentId: filter.library } : {};
}

/** The shows the filter lets in - the faces row, and the list `keepAllowed` checks episodes against. */
export function allowedShows(filter: KidsFilter): Endpoint {
  return {
    path: '/Items',
    query: {
      includeItemTypes: 'Series',
      recursive: true,
      sortBy: 'SortName',
      ...ratingQuery(filter),
      ...libraryQuery(filter),
    },
  };
}

const TITLES_LIMIT = 300;

/** Kids Home: every show and movie once, last watched first, then A-Z (docs/context/kids.md, Home). */
export function kidsTitles(filter: KidsFilter | undefined): Endpoint {
  return {
    path: '/Items',
    query: {
      includeItemTypes: 'Movie,Series',
      recursive: true,
      sortBy: 'DatePlayed,SortName',
      sortOrder: 'Descending,Ascending',
      limit: TITLES_LIMIT,
      // A show's episode count (kids Downloads: "5/32 episodes").
      fields: 'RecursiveItemCount',
      ...ratingQuery(filter),
      ...libraryQuery(filter),
    },
  };
}

const SEARCH_TITLES_LIMIT = 24;
const SEARCH_EPISODES_LIMIT = 30;

/**
 * Kids search (docs/context/kids.md, Search): by name, shows and movies in one request, episodes in another (they show
 * as stills under the posters). Same filter as Home; episodes still go through `keepAllowed` (unrated shows).
 */
export function kidsSearch(term: string, filter: KidsFilter | undefined): { titles: Endpoint; episodes: Endpoint } {
  const base = { searchTerm: term, recursive: true, ...ratingQuery(filter), ...libraryQuery(filter) };
  return {
    titles: { path: '/Items', query: { ...base, includeItemTypes: 'Movie,Series', limit: SEARCH_TITLES_LIMIT } },
    episodes: { path: '/Items', query: { ...base, includeItemTypes: 'Episode', limit: SEARCH_EPISODES_LIMIT } },
  };
}

/**
 * A show's episodes for the kids show page, every season in order. The filter is a backstop: the page only opens from
 * an allowed show, and an episode takes its show's rating.
 */
export function kidsEpisodes(seriesId: string, filter: KidsFilter | undefined): Endpoint {
  return {
    path: `/Shows/${encodeURIComponent(seriesId)}/Episodes`,
    query: { isMissing: false, ...ratingQuery(filter) },
  };
}

export type EpisodeRow =
  { kind: 'season'; key: string; season: number } | { kind: 'episodes'; key: string; items: BaseItemDto[] };

/**
 * The show page's rows: episodes with a file, specials left out, `columns` to a row; a season divider before each season
 * when there's more than one.
 */
export function episodeRows(episodes: readonly BaseItemDto[], columns: number): EpisodeRow[] {
  const playable = episodes.filter((e) => hasFile(e) && (e.ParentIndexNumber ?? 1) > 0);
  const bySeason = new Map<number, BaseItemDto[]>();
  for (const e of playable) {
    const season = e.ParentIndexNumber ?? 1;
    bySeason.set(season, [...(bySeason.get(season) ?? []), e]);
  }
  const rows: EpisodeRow[] = [];
  for (const [season, items] of bySeason) {
    if (bySeason.size > 1) rows.push({ kind: 'season', key: `season-${season}`, season });
    for (let i = 0; i < items.length; i += columns) {
      const chunk = items.slice(i, i + columns);
      rows.push({ kind: 'episodes', key: chunk[0].Id, items: chunk });
    }
  }
  return rows;
}

/**
 * Drops episodes (and seasons) whose show isn't allowed - for Next Up (the server ignores the rating there) and
 * unrated shows. Other items pass: movies and shows are filtered by the request itself.
 */
export function keepAllowed<T extends BaseItemDto>(items: readonly T[], shows: ReadonlySet<string>): T[] {
  return items.filter((item) =>
    item.Type === 'Episode' || item.Type === 'Season' ? shows.has(item.SeriesId ?? '') : true,
  );
}
