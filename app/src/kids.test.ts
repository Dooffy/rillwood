// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from '@jest/globals';

import type { BaseItemDto, UserDto } from './api';
import { AGE_STEPS, allowedShows, isKidsAccount, keepAllowed, ratingQuery } from './kids';

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
