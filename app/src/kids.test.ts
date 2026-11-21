// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from '@jest/globals';

import type { BaseItemDto, UserDto } from './api';
import {
  AGE_STEPS,
  allowedShows,
  episodeRows,
  isKidsAccount,
  keepAllowed,
  kidsEpisodes,
  kidsSearch,
  kidsTitles,
  ratingQuery,
} from './kids';

const user = (policy?: UserDto['Policy']): UserDto => ({ Id: 'u', Name: 'Mia', Policy: policy });
const item = (Id: string, Type: string, SeriesId?: string) => ({ Id, Name: Id, Type, SeriesId }) as BaseItemDto;

describe('isKidsAccount', () => {
  it('is a kids account when the server sets a rating limit', () => {
    expect(isKidsAccount(user({ MaxParentalRating: 10 }))).toBe(true);
    // G / TV-Y score 0 - still a limit
    expect(isKidsAccount(user({ MaxParentalRating: 0 }))).toBe(true);
  });

  it('is not one without a limit', () => {
    expect(isKidsAccount(user({ EnableContentDownloading: true }))).toBe(false);
    expect(isKidsAccount(user({ MaxParentalRating: null }))).toBe(false);
    expect(isKidsAccount(user())).toBe(false);
    expect(isKidsAccount(undefined)).toBe(false);
  });
});

describe('ratingQuery', () => {
  it('maps each age step to the highest rating it lets in', () => {
    expect(AGE_STEPS.map((age) => ratingQuery({ age, unrated: true }).maxOfficialRating)).toEqual([
      'TV-G',
      'TV-Y7',
      'PG',
      'PG-13',
    ]);
  });

  it('hides unrated items unless they are let in', () => {
    expect(ratingQuery({ age: 7, unrated: false })).toEqual({ maxOfficialRating: 'TV-Y7', hasParentalRating: true });
    expect(ratingQuery({ age: 7, unrated: true }).hasParentalRating).toBeUndefined();
  });
});

describe('allowedShows', () => {
  it('asks for every show under the limit', () => {
    expect(allowedShows({ age: 10, unrated: false })).toEqual({
      path: '/Items',
      query: {
        includeItemTypes: 'Series',
        recursive: true,
        sortBy: 'SortName',
        maxOfficialRating: 'PG',
        hasParentalRating: true,
      },
    });
  });
});

describe('keepAllowed', () => {
  const shows = new Set(['ok']);

  it('keeps episodes and seasons of allowed shows only', () => {
    const items = [item('e1', 'Episode', 'ok'), item('e2', 'Episode', 'blocked'), item('s1', 'Season', 'ok')];
    expect(keepAllowed(items, shows).map((i) => i.Id)).toEqual(['e1', 's1']);
  });

  it('drops an episode without a show', () => {
    expect(keepAllowed([item('e', 'Episode')], shows)).toEqual([]);
  });

  it('lets movies and shows through - the request filtered them', () => {
    const items = [item('m', 'Movie'), item('blocked', 'Series')];
    expect(keepAllowed(items, shows)).toEqual(items);
  });

  it('keeps the order', () => {
    const items = [item('m', 'Movie'), item('e', 'Episode', 'ok'), item('m2', 'Movie')];
    expect(keepAllowed(items, shows).map((i) => i.Id)).toEqual(['m', 'e', 'm2']);
  });
});

describe('kids requests', () => {
  it('asks a kids account for nothing extra - the server filters', () => {
    expect(ratingQuery(undefined)).toEqual({});
  });

  it('lists every show and movie, last watched first then A-Z, filtered', () => {
    expect(kidsTitles({ age: 10, unrated: false })).toEqual({
      path: '/Items',
      query: {
        includeItemTypes: 'Movie,Series',
        recursive: true,
        sortBy: 'DatePlayed,SortName',
        sortOrder: 'Descending,Ascending',
        limit: 300,
        maxOfficialRating: 'PG',
        hasParentalRating: true,
      },
    });
    expect(kidsTitles(undefined).query).not.toHaveProperty('maxOfficialRating');
  });

  it('searches by name: shows + movies in one request, episodes in another, both filtered', () => {
    const { titles, episodes } = kidsSearch('din', { age: 7, unrated: false });
    const base = { searchTerm: 'din', recursive: true, maxOfficialRating: 'TV-Y7', hasParentalRating: true };
    expect(titles).toEqual({ path: '/Items', query: { ...base, includeItemTypes: 'Movie,Series', limit: 24 } });
    expect(episodes).toEqual({ path: '/Items', query: { ...base, includeItemTypes: 'Episode', limit: 30 } });
    // A kids account: the server filters.
    expect(kidsSearch('din', undefined).titles.query).toEqual({
      searchTerm: 'din',
      recursive: true,
      includeItemTypes: 'Movie,Series',
      limit: 24,
    });
  });

  it("asks for a show's episodes with the filter as a backstop", () => {
    expect(kidsEpisodes('a/b', { age: 3, unrated: true })).toEqual({
      path: '/Shows/a%2Fb/Episodes',
      query: { isMissing: false, maxOfficialRating: 'TV-G' },
    });
  });
});

describe('episodeRows', () => {
  const ep = (Id: string, season: number, extra: Partial<BaseItemDto> = {}) =>
    ({ Id, Name: Id, Type: 'Episode', ParentIndexNumber: season, ...extra }) as BaseItemDto;
  const shape = (rows: ReturnType<typeof episodeRows>) =>
    rows.map((r) => (r.kind === 'season' ? `S${r.season}` : r.items.map((i) => i.Id).join('+')));

  it('lists one season without a divider, one episode per row on phones', () => {
    expect(shape(episodeRows([ep('a', 1), ep('b', 1)], 1))).toEqual(['a', 'b']);
  });

  it('puts a divider before each season when there are several', () => {
    expect(shape(episodeRows([ep('a', 1), ep('b', 2), ep('c', 2)], 1))).toEqual(['S1', 'a', 'S2', 'b', 'c']);
  });

  it('groups a season into rows of the column count, a short last row', () => {
    expect(shape(episodeRows([ep('a', 1), ep('b', 1), ep('c', 1)], 2))).toEqual(['a+b', 'c']);
  });

  it('leaves out specials and episodes without a file', () => {
    const rows = episodeRows([ep('special', 0), ep('virtual', 1, { LocationType: 'Virtual' }), ep('a', 1)], 1);
    expect(shape(rows)).toEqual(['a']);
  });

  it('takes an episode without a season as season 1', () => {
    expect(shape(episodeRows([{ Id: 'x', Name: 'x', Type: 'Episode' } as BaseItemDto], 1))).toEqual(['x']);
  });
});
