// SPDX-License-Identifier: GPL-3.0-or-later
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import * as api from './api';
import type { BaseItemDto, Connection, Query } from './api';
import { ratingScores } from './ratings';

const conn: Connection = { baseUrl: 'https://jf.example.com', deviceId: 'dev', token: 'tok', accountId: 'a' };
// The server's own scores for the titles (its maths, any country): G 0, Ireland's G 4, TV-Y7 7, PG 10, R 17; none =
// no score (unrated, or a rating it can't read).
const titleScores: Record<string, number | undefined> = {
  pets: 0,
  irish: 4,
  trains: 7,
  pg: 10,
  grownup: 17,
  bare: undefined,
};
const movie = (Id: string): BaseItemDto => ({ Id, Name: Id, Type: 'Movie' });
const episode = (Id: string, SeriesId: string): BaseItemDto => ({ Id, Name: Id, Type: 'Episode', SeriesId });

const getItemsById = jest.spyOn(api, 'getItemsById');
let fails = false;

beforeEach(() => {
  jest.clearAllMocks();
  fails = false;
  // `/Items?ids=` as 12.1 and 10.11 answer it (docs/research/jellyfin-api.md): a title with no score passes every min
  // and max; `hasParentalRating` doesn't drop it.
  getItemsById.mockImplementation((_conn, ids, q: Query = {}) => {
    if (fails) return Promise.reject(new api.ApiError('network'));
    const min = q.minOfficialRating === undefined ? undefined : Number(q.minOfficialRating);
    const max = q.maxOfficialRating === undefined ? undefined : Number(q.maxOfficialRating);
    const Items = ids
      .filter((id) => id in titleScores)
      .filter((id) => {
        const score = titleScores[id];
        if (score === undefined) return true;
        return (min === undefined || score >= min) && (max === undefined || score <= max);
      })
      .map((Id): BaseItemDto => ({ Id, Name: Id, Type: 'Movie' }));
    return Promise.resolve({ Items, TotalRecordCount: Items.length });
  });
});

const asObject = (m: Map<string, number>) => Object.fromEntries(m);

describe('rating scores', () => {
  it("the lowest age step the server lets through; an episode its show's; unrated and unknown: none", async () => {
    const scores = await ratingScores(conn, [
      movie('pets'),
      movie('irish'),
      movie('pg'),
      movie('bare'),
      movie('gone'),
      episode('t1', 'trains'),
      episode('t2', 'trains'),
      episode('g1', 'grownup'),
    ]);
    // All-ages ratings (G 0, Ireland's G 4) are 3+'s (5) - regression: Ireland's G was 7+. R is over every step: 14.
    expect(asObject(scores)).toEqual({ pets: 5, irish: 5, pg: 10, t1: 7, t2: 7, g1: 14 });
  });

  it('a title the server has no score for stays unrated, not 0, though it passes every step - regression', async () => {
    expect(asObject(await ratingScores(conn, [movie('bare'), episode('b1', 'bare')]))).toEqual({});
  });

  it('asks which titles exist, which have no score, then the scored ones by age (numbers), stopping when placed', async () => {
    await ratingScores(conn, [episode('t1', 'trains'), episode('t2', 'trains'), movie('pets'), movie('bare')]);
    // Only the ids are read: no user data or count.
    const lean = { recursive: true, enableUserData: false, enableTotalRecordCount: false };
    expect(getItemsById.mock.calls.map(([, ids, query]) => [ids, query])).toEqual([
      [['trains', 'pets', 'bare'], lean],
      [['trains', 'pets', 'bare'], { ...lean, minOfficialRating: '100000' }],
      [['trains', 'pets'], { ...lean, maxOfficialRating: '5' }],
      [['trains'], { ...lean, maxOfficialRating: '7' }],
    ]);
  });

  it('many titles: ids in chunks of 100', async () => {
    const many = Array.from({ length: 220 }, (_, i) => movie(`m${i}`));
    await ratingScores(conn, many);
    const first = getItemsById.mock.calls.filter(([, , q]) => q && Object.keys(q).length === 3);
    expect(first.map(([, ids]) => ids.length)).toEqual([100, 100, 20]);
  });

  it('nothing found on the server: no further requests, no scores', async () => {
    expect((await ratingScores(conn, [movie('gone')])).size).toBe(0);
    expect(getItemsById).toHaveBeenCalledTimes(1);
  });

  it('an episode without a show id: asked by its own id', async () => {
    const lone: BaseItemDto = { Id: 'pg', Name: 'lone', Type: 'Episode' };
    expect(asObject(await ratingScores(conn, [lone]))).toEqual({ pg: 10 });
  });

  it('the server out of reach: no scores (asked again later); nothing to ask: no request', async () => {
    fails = true;
    expect((await ratingScores(conn, [movie('pets')])).size).toBe(0);
    getItemsById.mockClear();
    expect((await ratingScores(conn, [])).size).toBe(0);
    expect(getItemsById).not.toHaveBeenCalled();
  });
});
