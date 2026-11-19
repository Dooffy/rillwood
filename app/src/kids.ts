// SPDX-License-Identifier: GPL-3.0-or-later
// Kids mode rating rules (pure, docs/context/kids.md "Shared filter"): kids account detection, age step → server
// query, and the allowed-shows check for episodes (they have no rating of their own).
import type { BaseItemDto, Endpoint, Query, UserDto } from './api';
import { hasFile } from './items';

export type AgeStep = 3 | 7 | 10 | 13;
export const AGE_STEPS: readonly AgeStep[] = [3, 7, 10, 13];

/** Shared phone filter: the age step and whether unrated videos show (hidden by default). */
export type KidsFilter = { age: AgeStep; unrated: boolean };

/**
 * The highest rating each step lets in, by name - the server compares by its score (`/Localization/ParentalRatings`),
 * so `PG` also lets in `TV-PG`. 13+ stops at PG-13: TV-14 (score 14) stays out.
 */
const MAX_RATING: Record<AgeStep, string> = { 3: 'TV-G', 7: 'TV-Y7', 10: 'PG', 13: 'PG-13' };

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

/** The shows the filter lets in - the faces row, and the list `keepAllowed` checks episodes against. */
export function allowedShows(filter: KidsFilter): Endpoint {
  return {
    path: '/Items',
    query: { includeItemTypes: 'Series', recursive: true, sortBy: 'SortName', ...ratingQuery(filter) },
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
      ...ratingQuery(filter),
    },
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
